import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { Button, Card, Group, IconButton, Label, Notice, Pill, SectionTitle, Segmented, tap } from '@/components/ui';
import { ENGINE_MAP } from '@/data/engines';
import {
  isStandingStart,
  KMH_PER_MPH,
  PERF_TEST_MAP,
  PERF_TESTS,
  type PerfTest,
  type PerfTestId,
  PerfTimer,
  type SpeedSample,
  startSpeed,
  type TimerPhase,
  type TimerState,
} from '@/lib/perf-timer';
import { convert, formatNumber, type Units } from '@/lib/units';
import { session, useChannelDemand, useConnection } from '@/obd/session';
import { type PerfResult, type PerfSource, usePerformance } from '@/store/performance';
import { useSettings } from '@/store/settings';
import { colors, radius, space, type } from '@/theme';

type Permission = 'unknown' | 'granted' | 'ask' | 'blocked';
type Live = { speed: number | null; at: number };
type Tone = { tint: string; background: string };

const STALE_MS = 2500;
const GPS_UNAVAILABLE = 'Location is unavailable. Check that Location Services are switched on.';

const TONES = {
  neutral: { tint: colors.textSecondary, background: colors.surfaceRaised },
  good: { tint: colors.good, background: colors.goodSoft },
  warn: { tint: colors.warn, background: colors.warnSoft },
  danger: { tint: colors.danger, background: colors.dangerSoft },
  accent: { tint: colors.accentStrong, background: colors.accentSoft },
} satisfies Record<string, Tone>;

const PHASES: Record<TimerPhase, { label: string; tone: Tone }> = {
  idle: { label: 'Waiting', tone: TONES.neutral },
  armed: { label: 'Armed', tone: TONES.good },
  running: { label: 'Running', tone: TONES.accent },
  finished: { label: 'Finished', tone: TONES.good },
  aborted: { label: 'Aborted', tone: TONES.danger },
};

const SOURCES: { value: PerfSource; label: string }[] = [
  { value: 'gps', label: 'GPS' },
  { value: 'obd', label: 'OBD' },
];

function toPermission(p: Location.LocationPermissionResponse): Permission {
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'ask' : 'blocked';
}

function buzz(enabled: boolean, kind: 'armed' | 'success' | 'warning') {
  if (!enabled) return;
  const feedback =
    kind === 'armed'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.notificationAsync(
          kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
        );
  feedback.catch(() => undefined);
}

function boundLabel(kmh: number, test: PerfTest) {
  return test.unit === 'mph' ? `${Math.round(kmh / KMH_PER_MPH)} mph` : `${Math.round(kmh)} km/h`;
}

function formatDistance(m: number, units: Units) {
  return units.speed === 'mph' ? `${formatNumber(m * 3.28084, 0)} ft` : `${formatNumber(m, 0)} m`;
}

function formatSpeed(kmh: number, units: Units) {
  const c = convert(kmh, 'speed', units);
  return `${formatNumber(c.value, c.decimals)} ${c.unit}`;
}

function formatTime(seconds: number) {
  return seconds.toFixed(2);
}

function formatDate(ms: number) {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

function useNow(interval: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

type SignalInput = {
  source: PerfSource;
  connected: boolean;
  hz: number;
  permission: Permission;
  accuracy: number | null;
  stale: boolean;
  gpsError: string | null;
};

function signalFor(s: SignalInput): { label: string; icon: IconName; tone: Tone; caption: string } {
  if (s.source === 'obd') {
    if (!s.connected) return { label: 'No adapter', icon: 'antenna', tone: TONES.danger, caption: 'Connect an adapter to use the car speed' };
    if (s.stale) return { label: 'OBD', icon: 'antenna', tone: TONES.warn, caption: 'Waiting for speed data from the car' };
    return {
      label: `OBD ${formatNumber(s.hz, 0)} Hz`,
      icon: 'antenna',
      tone: s.hz >= 4 ? TONES.good : TONES.warn,
      caption: s.hz >= 4 ? 'Speed from the engine computer' : 'Low update rate, results are less precise',
    };
  }
  if (s.gpsError) return { label: 'GPS off', icon: 'location', tone: TONES.danger, caption: 'Location Services are unavailable' };
  if (s.permission !== 'granted') return { label: 'No access', icon: 'location', tone: TONES.danger, caption: 'Location access is needed for GPS timing' };
  if (s.accuracy === null || s.stale) return { label: 'Searching', icon: 'location', tone: TONES.warn, caption: 'Looking for a GPS fix' };
  const label = `GPS ±${formatNumber(s.accuracy, 0)} m`;
  if (s.accuracy < 5) return { label, icon: 'location', tone: TONES.good, caption: 'Accuracy is good for timing' };
  if (s.accuracy < 15) return { label, icon: 'location', tone: TONES.warn, caption: 'Accuracy is fair, results may vary' };
  return { label, icon: 'location', tone: TONES.danger, caption: 'Weak signal, wait for a better fix' };
}

type StatusInput = SignalInput & {
  snap: TimerState;
  test: PerfTest;
  units: Units;
  safetyAccepted: boolean;
  isBest: boolean;
};

function statusFor(s: StatusInput): { title: string; detail: string; color: string } {
  const plain = (title: string, detail: string) => ({ title, detail, color: colors.text });
  if (!s.safetyAccepted) return plain('Confirm the safety note', 'Timing starts once you have read and confirmed the note above.');
  if (s.source === 'obd' && !s.connected) return plain('Connect an adapter', 'OBD timing needs a connected adapter. Connect one or switch to GPS.');
  if (s.source === 'gps' && s.gpsError) return plain('GPS unavailable', s.gpsError);
  if (s.source === 'gps' && s.permission !== 'granted') return plain('Location access needed', 'Allow location access above to time runs with GPS.');
  if (s.stale) {
    return plain(
      'Waiting for speed',
      s.source === 'gps' ? 'Waiting for a GPS fix. A clear view of the sky helps.' : 'Waiting for speed data from the car.',
    );
  }
  const { snap, test, units } = s;
  const from = boundLabel(startSpeed(test), test);
  const standing = isStandingStart(test);
  switch (snap.phase) {
    case 'idle':
      return standing
        ? plain('Stop the car to arm', 'Hold still for one second to arm the timer.')
        : plain(`Slow below ${from} to arm`, `The run starts when you accelerate through ${from}.`);
    case 'armed':
      return standing
        ? { title: 'Ready, launch when safe', detail: 'Timing starts the moment the car moves.', color: colors.good }
        : { title: `Ready, accelerate through ${from}`, detail: `Timing starts at ${from}.`, color: colors.good };
    case 'running':
      return {
        title: 'Running',
        detail:
          test.kind === 'speed'
            ? `Target ${boundLabel(test.toKmh, test)}`
            : `${formatDistance(Math.max(0, test.meters - snap.distance), units)} to go`,
        color: colors.accentStrong,
      };
    case 'finished': {
      const result = snap.result;
      const detail =
        result?.trapSpeed !== undefined
          ? `Trap speed ${formatSpeed(result.trapSpeed, units)}. Saved to your runs.`
          : `${formatDistance(result?.distance ?? 0, units)} covered. Saved to your runs.`;
      return { title: s.isBest ? 'New best' : 'Finished', detail, color: colors.good };
    }
    case 'aborted': {
      const detail =
        snap.abortReason === 'timeout'
          ? 'No finish within 60 seconds.'
          : snap.abortReason === 'signal'
            ? 'The speed signal dropped out during the run.'
            : 'The car slowed down before the finish.';
      return { title: 'Run aborted', detail, color: colors.danger };
    }
  }
}

export default function PerformanceScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const units = useSettings((s) => s.units);
  const hapticsOn = useSettings((s) => s.haptics);
  const engineId = useSettings((s) => s.engineId);
  const connected = useConnection((s) => s.status === 'connected');
  const hz = useConnection((s) => s.hz);
  const testId = usePerformance((s) => s.selectedTest);
  const selectTest = usePerformance((s) => s.selectTest);
  const safetyAccepted = usePerformance((s) => s.safetyAccepted);
  const acceptSafety = usePerformance((s) => s.acceptSafety);
  const results = usePerformance((s) => s.results);
  const best = usePerformance((s) => s.best[testId]);
  const deleteResult = usePerformance((s) => s.deleteResult);
  const clearResults = usePerformance((s) => s.clearResults);
  const test = PERF_TEST_MAP[testId] ?? PERF_TESTS[0];

  const [source, setSource] = useState<PerfSource>(() => (useConnection.getState().status === 'connected' ? 'obd' : 'gps'));
  const [timer] = useState(() => new PerfTimer(test));
  const [snap, setSnap] = useState<TimerState>(() => timer.state);
  const [live, setLive] = useState<Live>({ speed: null, at: 0 });
  const [permission, setPermission] = useState<Permission>('unknown');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const [lastRun, setLastRun] = useState<{ id: string; isBest: boolean } | null>(null);
  const now = useNow(500);

  const sourceReady = source === 'obd' ? connected : permission === 'granted' && !gpsError;
  const ready = safetyAccepted && sourceReady;
  const stale = live.speed === null || now - live.at > STALE_MS;

  const context = useRef({ ready, source, engineId, hapticsOn });
  useEffect(() => {
    context.current = { ready, source, engineId, hapticsOn };
  }, [ready, source, engineId, hapticsOn]);

  const handleSample = useCallback(
    (sample: SpeedSample | null) => {
      setLive({ speed: sample ? sample.speedKmh : null, at: Date.now() });
      const ctx = context.current;
      if (!sample || !ctx.ready) return;
      const before = timer.state.phase;
      const next = timer.push(sample);
      setSnap(next);
      if (next.phase === before) return;
      if (next.phase === 'armed') buzz(ctx.hapticsOn, 'armed');
      else if (next.phase === 'aborted') buzz(ctx.hapticsOn, 'warning');
      else if (next.phase === 'finished' && next.result) {
        const r = next.result;
        const { result, isBest } = usePerformance.getState().addResult({
          test: r.test,
          time: r.time,
          source: ctx.source,
          maxSpeed: r.maxSpeed,
          distance: r.distance,
          engineId: ctx.engineId,
          ...(r.trapSpeed !== undefined ? { trapSpeed: r.trapSpeed } : {}),
        });
        setLastRun({ id: result.id, isBest });
        buzz(ctx.hapticsOn, 'success');
      }
    },
    [timer],
  );

  useEffect(() => {
    if (!ready) setSnap(timer.reset());
  }, [ready, timer]);

  useEffect(() => {
    if (source !== 'gps') return;
    let active = true;
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (active) setPermission(toPermission(p));
      })
      .catch(() => {
        if (active) setPermission('ask');
      });
    return () => {
      active = false;
    };
  }, [source]);

  useEffect(() => {
    if (source !== 'gps' || permission !== 'granted') return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 100, distanceInterval: 0 },
      (location) => {
        if (!active) return;
        const { speed, accuracy: meters } = location.coords;
        setAccuracy(meters ?? null);
        handleSample(speed === null || speed < 0 ? null : { t: location.timestamp, speedKmh: speed * 3.6 });
      },
      () => {
        if (active) setGpsError(GPS_UNAVAILABLE);
      },
    )
      .then((sub) => {
        if (!active) {
          sub.remove();
          return;
        }
        subscription = sub;
      })
      .catch(() => {
        if (active) setGpsError(GPS_UNAVAILABLE);
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [source, permission, gpsAttempt, handleSample]);

  useChannelDemand(['speed'], source === 'obd' && connected);
  useEffect(() => {
    if (source !== 'obd' || !connected) return;
    return session.onSample((s) => {
      const speed = s.values.speed;
      if (typeof speed === 'number') handleSample({ t: s.t, speedKmh: speed });
    });
  }, [source, connected, handleSample]);

  const changeSource = (next: PerfSource) => {
    setSource(next);
    setSnap(timer.reset());
    setLive({ speed: null, at: 0 });
    setAccuracy(null);
    setLastRun(null);
  };

  const changeTest = (id: PerfTestId) => {
    if (id === test.id) return;
    tap();
    selectTest(id);
    setSnap(timer.setTest(id));
    setLastRun(null);
  };

  const runAgain = () => {
    setSnap(timer.reset());
    setLastRun(null);
  };

  const retryGps = () => {
    setGpsError(null);
    setGpsAttempt((n) => n + 1);
  };

  const requestPermission = () => {
    Location.requestForegroundPermissionsAsync()
      .then((p) => setPermission(toPermission(p)))
      .catch(() => setPermission('blocked'));
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const confirmDelete = (r: PerfResult) => {
    Alert.alert('Delete this run?', `${formatTime(r.time)} s, ${formatDate(r.date)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteResult(r.id) },
    ]);
  };

  const confirmClear = () => {
    Alert.alert('Clear results', 'Saved runs are deleted from this phone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: `Clear ${test.label}`, style: 'destructive', onPress: () => clearResults(test.id) },
      { text: 'Clear all tests', style: 'destructive', onPress: () => clearResults() },
    ]);
  };

  const history = useMemo(() => results.filter((r) => r.test === test.id), [results, test.id]);
  const recent = history.slice(0, 10);

  const signalInput = { source, connected, hz, permission, accuracy, stale, gpsError };
  const signal = signalFor(signalInput);
  const status = statusFor({
    ...signalInput,
    snap,
    test,
    units,
    safetyAccepted,
    isBest: snap.phase === 'finished' && !!lastRun?.isBest,
  });
  const phase = PHASES[snap.phase];

  const speed = convert(live.speed ?? 0, 'speed', units);
  const seconds = snap.phase === 'finished' && snap.result ? snap.result.time : snap.elapsed;
  const timerColor =
    snap.phase === 'running'
      ? colors.text
      : snap.phase === 'finished'
        ? colors.good
        : snap.phase === 'aborted'
          ? colors.textTertiary
          : colors.textSecondary;
  const progressColor = snap.phase === 'finished' ? colors.good : snap.phase === 'aborted' ? colors.textTertiary : colors.accent;
  const trap = snap.result?.trapSpeed;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.topBar}>
        <View style={styles.topTitle}>
          <Label>Performance</Label>
          <Text style={[type.title, { color: colors.text }]}>Timer</Text>
        </View>
        <IconButton icon="close" label="Close" onPress={close} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        indicatorStyle="white">
        {!safetyAccepted ? (
          <View style={styles.safety}>
            <Notice
              tone="warn"
              title="Measure responsibly"
              body="Only measure on closed roads or race tracks and always obey the law. A passenger should operate the phone so the driver can focus on driving."
            />
            <Button title="I understand" variant="secondary" compact onPress={acceptSafety} />
          </View>
        ) : null}

        <Segmented options={SOURCES} value={source} onChange={changeSource} />
        <View style={styles.signalRow}>
          <Pill label={signal.label} icon={signal.icon} tint={signal.tone.tint} background={signal.tone.background} />
          <Text style={[type.caption, styles.signalCaption]} numberOfLines={1}>
            {signal.caption}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroller} contentContainerStyle={styles.chips}>
          {PERF_TESTS.map((t) => (
            <TestChip key={t.id} test={t} active={t.id === test.id} onPress={() => changeTest(t.id)} />
          ))}
        </ScrollView>

        {source === 'gps' && (permission === 'ask' || permission === 'blocked') ? (
          <ActionCard
            icon="location"
            title="Allow location access"
            body="GPS speed times your runs when no adapter is connected. Location is only read while this screen is open and never leaves your phone."
            action={permission === 'blocked' ? 'Open Settings' : 'Allow location'}
            onAction={permission === 'blocked' ? () => Linking.openSettings().catch(() => undefined) : requestPermission}
          />
        ) : null}
        {source === 'gps' && permission === 'granted' && gpsError ? (
          <ActionCard icon="location" title="GPS unavailable" body={gpsError} action="Try again" onAction={retryGps} />
        ) : null}
        {source === 'obd' && !connected ? (
          <ActionCard
            icon="antenna"
            title="No adapter connected"
            body="Connect your OBD adapter to time runs with the speed signal of the car, or switch to GPS."
            action="Connect adapter"
            onAction={() => router.push('/connect')}
          />
        ) : null}

        <Card style={styles.instrument}>
          <View style={styles.instrumentTop}>
            <Pill label={phase.label} tint={phase.tone.tint} background={phase.tone.background} />
            <Text style={[type.label, { color: colors.textTertiary }]}>{test.label}</Text>
          </View>

          <View
            style={styles.speed}
            accessible
            accessibilityLabel={stale ? 'Speed unavailable' : `Speed ${formatNumber(speed.value, 0)} ${speed.unit}`}>
            <Text style={[type.hero, { color: stale ? colors.textTertiary : colors.text }]} numberOfLines={1}>
              {stale ? '––' : formatNumber(speed.value, 0)}
            </Text>
            <Text style={[type.callout, styles.speedUnit]}>{speed.unit}</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(snap.progress * 1000) / 10}%`, backgroundColor: progressColor }]} />
          </View>

          <Elapsed seconds={seconds} running={snap.phase === 'running'} since={live.at} color={timerColor} />

          <View style={styles.stats}>
            <Stat label="Distance" value={formatDistance(snap.distance, units)} />
            <Stat label="Max speed" value={snap.maxSpeed > 0 ? formatSpeed(snap.maxSpeed, units) : '–'} />
            {test.kind === 'distance' ? (
              <Stat label="Trap speed" value={trap !== undefined ? formatSpeed(trap, units) : '–'} />
            ) : (
              <Stat label="Target" value={boundLabel(test.toKmh, test)} />
            )}
          </View>

          <View style={styles.status}>
            <Text style={[type.headline, { color: status.color, textAlign: 'center' }]}>{status.title}</Text>
            <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]}>{status.detail}</Text>
          </View>

          {snap.phase === 'finished' || snap.phase === 'aborted' ? (
            <Button title="Run again" icon="refresh" onPress={runAgain} />
          ) : snap.phase === 'running' ? (
            <Button title="Cancel run" icon="stop" variant="secondary" onPress={runAgain} />
          ) : null}
        </Card>

        <SectionTitle title={test.label} />
        <Card style={styles.summary}>
          <Stat label="Best" value={best ? `${formatTime(best.time)} s` : '–'} tint={best ? colors.good : undefined} />
          <Stat label="Last" value={history[0] ? `${formatTime(history[0].time)} s` : '–'} />
          <Stat label="Runs" value={String(history.length)} />
        </Card>

        <SectionTitle title="Recent runs" action={results.length > 0 ? 'Clear' : undefined} onAction={confirmClear} />
        {recent.length > 0 ? (
          <Group>
            {recent.map((r, i) => (
              <ResultRow
                key={r.id}
                result={r}
                units={units}
                best={best?.id === r.id}
                last={i === recent.length - 1}
                onPress={() => confirmDelete(r)}
              />
            ))}
          </Group>
        ) : (
          <Card>
            <Text style={[type.bodyStrong, { color: colors.text }]}>No runs yet</Text>
            <Text style={[type.callout, { color: colors.textSecondary, marginTop: 2 }]}>
              Complete a {test.label} run and it is saved here with the date and speed source.
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Elapsed({ seconds, running, since, color }: { seconds: number; running: boolean; since: number; color: string }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const loop = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  const extra = running ? Math.min(1.5, Math.max(0, (now - since) / 1000)) : 0;
  const value = formatTime(seconds + extra);
  return (
    <View style={styles.timer} accessible accessibilityLabel={`Elapsed ${value} seconds`}>
      <Text style={[type.display, { color }]}>{value}</Text>
      <Text style={[type.callout, { color: colors.textSecondary }]}>s</Text>
    </View>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Label>{label}</Label>
      <Text style={[type.valueSmall, { color: tint ?? colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function TestChip({ test, active, onPress }: { test: PerfTest; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={test.label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && !active && styles.chipPressed]}>
      <Text style={[type.valueSmall, { color: active ? colors.text : colors.textSecondary }]}>{test.short}</Text>
      <Text style={[type.caption, { color: active ? colors.accentStrong : colors.textTertiary }]}>{test.unit}</Text>
    </Pressable>
  );
}

function ActionCard({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Card style={styles.actionCard}>
      <View style={styles.actionHead}>
        <Icon name={icon} size={17} color={colors.accentStrong} />
        <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{title}</Text>
      </View>
      <Text style={[type.callout, { color: colors.textSecondary }]}>{body}</Text>
      <Button title={action} variant="secondary" compact onPress={onAction} style={styles.actionButton} />
    </Card>
  );
}

function ResultRow({
  result,
  units,
  best,
  last,
  onPress,
}: {
  result: PerfResult;
  units: Units;
  best: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const engine = result.engineId ? ENGINE_MAP[result.engineId]?.code : undefined;
  const meta = [
    result.source === 'gps' ? 'GPS' : 'OBD',
    engine,
    result.trapSpeed !== undefined ? `trap ${formatSpeed(result.trapSpeed, units)}` : `${formatDistance(result.distance, units)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${formatTime(result.time)} seconds, ${formatDate(result.date)}`}
      accessibilityHint="Opens the option to delete this run"
      android_ripple={{ color: colors.surfacePressed }}
      style={({ pressed }) => [styles.resultRow, !last && styles.resultBorder, pressed && { backgroundColor: colors.surfacePressed }]}>
      <View style={styles.resultTime}>
        <Text style={[type.valueSmall, { color: best ? colors.good : colors.text }]}>{formatTime(result.time)}</Text>
        <Text style={[type.caption, { color: colors.textSecondary }]}>s</Text>
      </View>
      <View style={styles.resultText}>
        <Text style={[type.callout, { color: colors.text }]} numberOfLines={1}>
          {formatDate(result.date)}
        </Text>
        <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {best ? <Pill label="Best" tint={colors.good} background={colors.goodSoft} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  topTitle: { flex: 1, gap: 2 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, gap: space.md },
  safety: { gap: space.sm },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  signalCaption: { color: colors.textSecondary, flex: 1 },
  chipScroller: { marginHorizontal: -space.lg, flexGrow: 0 },
  chips: { paddingHorizontal: space.lg, gap: space.sm },
  chip: {
    minWidth: 80,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipPressed: { backgroundColor: colors.surfacePressed },
  actionCard: { gap: space.sm },
  actionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actionButton: { alignSelf: 'flex-start', marginTop: space.xs },
  instrument: { gap: space.lg, paddingVertical: space.xl },
  instrumentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speed: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space.sm },
  speedUnit: { color: colors.textSecondary },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  timer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space.xs },
  stats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.lg,
  },
  stat: { flex: 1, alignItems: 'center', gap: space.xs },
  status: { gap: space.xs, alignItems: 'center', minHeight: 64, justifyContent: 'center' },
  summary: { flexDirection: 'row' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 58,
  },
  resultBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resultTime: { flexDirection: 'row', alignItems: 'baseline', gap: 3, minWidth: 74 },
  resultText: { flex: 1, gap: 1 },
});
