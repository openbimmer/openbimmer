import { router } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { Header, Screen } from '@/components/screen';
import { Button, Card, EmptyState, Group, Label, Notice, Pill, Row, SectionTitle, tap } from '@/components/ui';
import { ENGINE_MAP } from '@/data/engines';
import { type Dtc, type DtcKind, dtcSystem, isManufacturerSpecific, type Monitor, type Readiness } from '@/obd/dtc';
import { DTC_KIND_INFO, DTC_KINDS, describeDtc } from '@/obd/dtc-codes';
import { ElmError } from '@/obd/elm327';
import { type ConnectionStatus, session, useConnection } from '@/obd/session';
import { decodeVin } from '@/obd/vin';
import { useSettings } from '@/store/settings';
import { colors, radius, space, type } from '@/theme';

type Failure = { title: string; body: string };

const KIND_TONE: Record<DtcKind, { tint: string; background: string }> = {
  stored: { tint: colors.danger, background: colors.dangerSoft },
  pending: { tint: colors.warn, background: colors.warnSoft },
  permanent: { tint: colors.textSecondary, background: colors.surfaceRaised },
};

const MONITOR_STATE: Record<'complete' | 'incomplete' | 'unavailable', { icon: IconName; tint: string; label: string }> = {
  complete: { icon: 'checkCircle', tint: colors.good, label: 'Complete' },
  incomplete: { icon: 'clock', tint: colors.warn, label: 'Incomplete' },
  unavailable: { icon: 'minusCircle', tint: colors.textTertiary, label: 'Not available' },
};

export default function Diagnose() {
  const status = useConnection((s) => s.status);
  return (
    <Screen>
      <Header eyebrow="Engine computer" title="Diagnose" />
      {status === 'connected' ? <Diagnostics /> : <Disconnected status={status} />}
    </Screen>
  );
}

function Disconnected({ status }: { status: ConnectionStatus }) {
  const step = useConnection((s) => s.step);
  if (status === 'connecting' || status === 'initializing') {
    return (
      <EmptyState
        icon="antenna"
        title="Connecting"
        body={step || 'Talking to the adapter.'}
        action={<ActivityIndicator color={colors.accentStrong} style={{ marginTop: space.md }} />}
      />
    );
  }
  return (
    <EmptyState
      icon="stethoscope"
      title="No adapter connected"
      body="Plug the adapter into the OBD port, switch the ignition on, then connect to read fault codes."
      action={<Button title="Connect adapter" icon="antenna" onPress={() => router.push('/connect')} style={{ marginTop: space.md }} />}
    />
  );
}

function Diagnostics() {
  const [dtcs, setDtcs] = useState<Dtc[] | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<'scan' | 'clear' | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const working = useRef(false);

  const scan = async () => {
    if (working.current) return;
    working.current = true;
    setBusy('scan');
    setFailure(null);
    try {
      const codes = await session.readDtcs();
      const monitors = await session.readReadiness();
      await session.refreshVoltage().catch(() => undefined);
      setDtcs(codes);
      setReadiness(monitors);
      setScannedAt(Date.now());
    } catch (error) {
      setFailure({ title: 'Scan failed', body: describeError(error) });
    } finally {
      working.current = false;
      setBusy(null);
    }
  };

  const clear = async () => {
    if (working.current) return;
    working.current = true;
    setBusy('clear');
    setFailure(null);
    try {
      await session.clearDtcs();
    } catch (error) {
      setFailure({ title: 'Codes not cleared', body: describeError(error) });
      return;
    } finally {
      working.current = false;
      setBusy(null);
    }
    await scan();
  };

  const confirmClear = () => {
    Alert.alert(
      'Clear fault codes?',
      'This erases stored and pending codes and resets all readiness monitors. Switch the engine off and keep the ignition on. Codes come back if the fault is still present.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear codes', style: 'destructive', onPress: () => void clear() },
      ],
    );
  };

  const autoScan = useEffectEvent(() => {
    void scan();
  });

  useEffect(() => {
    autoScan();
  }, []);

  const groups = DTC_KINDS.map((kind) => ({ kind, codes: uniqueCodes(dtcs ?? [], kind) }));
  const count = (kind: DtcKind) => groups.find((g) => g.kind === kind)?.codes.length ?? 0;
  const clearable = count('stored') + count('pending') > 0;

  return (
    <>
      <Summary
        dtcs={dtcs}
        readiness={readiness}
        scannedAt={scannedAt}
        counts={{ stored: count('stored'), pending: count('pending'), permanent: count('permanent') }}
        scanning={busy === 'scan'}
        disabled={busy !== null}
        onScan={() => void scan()}
      />

      {failure ? (
        <View style={{ marginTop: space.md }}>
          <Notice tone="danger" title={failure.title} body={failure.body} />
        </View>
      ) : null}

      {dtcs !== null ? (
        <>
          {dtcs.length === 0 ? (
            <>
              <SectionTitle title="Fault codes" />
              <Group>
                <Row
                  icon="checkCircle"
                  iconTint={colors.good}
                  title="No fault codes"
                  subtitle="The engine computer reports no stored, pending or permanent codes."
                  last
                />
              </Group>
            </>
          ) : (
            groups
              .filter((g) => g.codes.length > 0)
              .map((g) => (
                <View key={g.kind}>
                  <SectionTitle title={`${DTC_KIND_INFO[g.kind].label} · ${g.codes.length}`} />
                  <Group>
                    {g.codes.map((dtc, i) => (
                      <DtcRow key={`${dtc.kind}-${dtc.code}`} dtc={dtc} last={i === g.codes.length - 1} />
                    ))}
                  </Group>
                </View>
              ))
          )}

          <Button
            title="Clear codes"
            icon="trash"
            variant="danger"
            onPress={confirmClear}
            loading={busy === 'clear'}
            disabled={!clearable || busy !== null}
            style={{ marginTop: space.lg }}
          />
          {count('permanent') > 0 ? (
            <Text style={[type.caption, styles.hint, { marginTop: space.sm }]}>
              Permanent codes cannot be cleared here. The engine computer removes them once it has verified the repair.
            </Text>
          ) : null}

          <SectionTitle title="Readiness monitors" />
          {readiness ? (
            <ReadinessGrid readiness={readiness} />
          ) : (
            <Notice
              title="Readiness not reported"
              body="The engine computer did not answer the monitor request. Scan again with the ignition on."
            />
          )}
        </>
      ) : null}

      <Vehicle />
    </>
  );
}

function Summary({
  dtcs,
  readiness,
  scannedAt,
  counts,
  scanning,
  disabled,
  onScan,
}: {
  dtcs: Dtc[] | null;
  readiness: Readiness | null;
  scannedAt: number | null;
  counts: Record<DtcKind, number>;
  scanning: boolean;
  disabled: boolean;
  onScan: () => void;
}) {
  const milOn = readiness?.milOn ?? false;
  const unique = new Set((dtcs ?? []).map((d) => d.code)).size;
  const headline =
    dtcs === null
      ? scanning
        ? 'Reading the engine computer'
        : 'Not scanned yet'
      : unique === 0
        ? 'No fault codes'
        : unique === 1
          ? '1 fault code'
          : `${unique} fault codes`;
  const attention = milOn || counts.stored > 0;

  return (
    <Card style={{ gap: space.lg }}>
      <View style={styles.summaryTop}>
        <View style={[styles.lamp, { backgroundColor: attention ? colors.dangerSoft : colors.surfaceRaised }]}>
          <Icon name="engine" size={22} color={attention ? colors.danger : colors.textSecondary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Label>Check engine</Label>
          <Text style={[type.headline, { color: colors.text }]} numberOfLines={1}>
            {headline}
          </Text>
        </View>
        {readiness ? (
          milOn ? (
            <Pill label="Lamp on" tint={colors.danger} background={colors.dangerSoft} />
          ) : (
            <Pill label="Lamp off" tint={colors.good} background={colors.goodSoft} />
          )
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat label="Stored" value={dtcs ? counts.stored : null} tint={counts.stored > 0 ? colors.danger : colors.text} />
        <View style={styles.statDivider} />
        <Stat label="Pending" value={dtcs ? counts.pending : null} tint={counts.pending > 0 ? colors.warn : colors.text} />
        <View style={styles.statDivider} />
        <Stat label="Permanent" value={dtcs ? counts.permanent : null} tint={colors.text} />
      </View>

      <View style={{ gap: space.sm }}>
        <Button title="Scan for codes" icon="refresh" onPress={onScan} loading={scanning} disabled={disabled} />
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: 'center' }]}>
          {scannedAt ? `Last scan at ${clock(scannedAt)}` : 'Reads stored, pending and permanent codes and readiness monitors.'}
        </Text>
      </View>
    </Card>
  );
}

function Stat({ label, value, tint }: { label: string; value: number | null; tint: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.value, { color: value === null ? colors.textTertiary : tint }]}>{value ?? '–'}</Text>
      <Label>{label}</Label>
    </View>
  );
}

function DtcRow({ dtc, last }: { dtc: Dtc; last: boolean }) {
  const description = describeDtc(dtc.code);
  const generic = !isManufacturerSpecific(dtc.code);
  const tone = KIND_TONE[dtc.kind];
  return (
    <Pressable
      onPress={() => {
        tap();
        router.push({ pathname: '/dtc/[code]', params: { code: dtc.code, kind: dtc.kind } });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${dtc.code}, ${description ?? 'manufacturer-specific code'}`}
      android_ripple={{ color: colors.surfacePressed }}
      style={({ pressed }) => [styles.dtcRow, !last && styles.divider, pressed && { backgroundColor: colors.surfacePressed }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.dtcHead}>
          <Text style={[type.valueSmall, { color: colors.text }]}>{dtc.code}</Text>
          <Pill label={DTC_KIND_INFO[dtc.kind].label} tint={tone.tint} background={tone.background} />
        </View>
        <Text style={[type.callout, { color: description ? colors.text : colors.textSecondary }]} numberOfLines={2}>
          {description ?? (generic ? 'No description available' : 'Manufacturer-specific code')}
        </Text>
        <Text style={[type.caption, { color: colors.textTertiary }]}>
          {dtcSystem(dtc.code)} · {generic ? 'Generic' : 'Manufacturer-specific'}
        </Text>
      </View>
      <Icon name="chevronRight" size={13} color={colors.textTertiary} />
    </Pressable>
  );
}

function ReadinessGrid({ readiness }: { readiness: Readiness }) {
  const monitors = [...readiness.monitors].sort((a, b) => Number(b.available) - Number(a.available));
  const available = monitors.filter((m) => m.available);
  const complete = available.filter((m) => m.complete).length;
  const rows: Monitor[][] = [];
  for (let i = 0; i < monitors.length; i += 2) rows.push(monitors.slice(i, i + 2));

  return (
    <View style={{ gap: space.sm }}>
      {rows.map((row) => (
        <View key={row.map((m) => m.key).join('-')} style={styles.tileRow}>
          {row.map((monitor) => (
            <MonitorTile key={monitor.key} monitor={monitor} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
      <Text style={[type.caption, styles.hint]}>
        {available.length > 0 ? `${complete} of ${available.length} monitors complete. ` : ''}
        Incomplete monitors are normal after clearing codes and finish on their own after a drive cycle.
      </Text>
    </View>
  );
}

function MonitorTile({ monitor }: { monitor: Monitor }) {
  const state = MONITOR_STATE[!monitor.available ? 'unavailable' : monitor.complete ? 'complete' : 'incomplete'];
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${monitor.label}: ${state.label}`}>
      <Icon name={state.icon} size={16} color={state.tint} />
      <Text style={[type.callout, { color: monitor.available ? colors.text : colors.textSecondary }]} numberOfLines={2}>
        {monitor.label}
      </Text>
      <Text style={[type.caption, { color: state.tint }]}>{state.label}</Text>
    </View>
  );
}

function Vehicle() {
  const vin = useConnection((s) => s.vin);
  const adapter = useConnection((s) => s.adapter);
  const supported = useConnection((s) => s.supported);
  const voltage = useConnection((s) => s.batteryVoltage);
  const engineId = useSettings((s) => s.engineId);
  const engine = engineId ? ENGINE_MAP[engineId] : null;
  const info = vin ? decodeVin(vin) : null;
  const [reading, setReading] = useState(false);
  const [voltageError, setVoltageError] = useState<string | null>(null);

  const refreshVoltage = async () => {
    if (reading) return;
    setReading(true);
    setVoltageError(null);
    try {
      await session.refreshVoltage();
    } catch (error) {
      setVoltageError(describeError(error));
    } finally {
      setReading(false);
    }
  };

  return (
    <>
      <SectionTitle title="Vehicle" />
      <Group>
        <Row
          icon="doc"
          title="VIN"
          subtitle={vin ? 'Tap to share' : undefined}
          value={vin ?? 'Not reported'}
          onPress={vin ? () => void Share.share({ message: vin }).catch(() => undefined) : undefined}
        />
        {info ? <Row icon="car" title="Manufacturer" value={info.manufacturer} /> : null}
        {info?.modelYear ? <Row icon="clock" title="Model year" value={String(info.modelYear)} /> : null}
        <Row
          icon="engine"
          title="Engine profile"
          subtitle={engine ? engine.title : 'Not selected'}
          onPress={() => router.push('/engine')}
          chevron
        />
        <Row
          icon="battery"
          title="Battery"
          subtitle={reading ? 'Reading' : 'Tap to refresh'}
          value={voltage !== null ? `${voltage.toFixed(1)} V` : 'Unknown'}
          onPress={() => void refreshVoltage()}
          last
        />
      </Group>
      {voltageError ? (
        <View style={{ marginTop: space.md }}>
          <Notice tone="warn" title="Voltage not read" body={voltageError} />
        </View>
      ) : null}

      <SectionTitle title="Connection" />
      <Group>
        <Row icon="antenna" title="Adapter" value={adapter?.name ?? 'Unknown'} />
        <Row icon="terminal" title="ELM version" value={adapter?.version ?? 'Unknown'} />
        <Row icon="link" title="Protocol" subtitle={adapter?.protocolName ?? 'Unknown'} />
        <Row icon="list" title="Supported PIDs" value={String(supported.length)} last />
      </Group>
    </>
  );
}

function uniqueCodes(dtcs: Dtc[], kind: DtcKind): Dtc[] {
  const seen = new Set<string>();
  return dtcs.filter((d) => {
    if (d.kind !== kind || seen.has(d.code)) return false;
    seen.add(d.code);
    return true;
  });
}

function clock(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function describeError(error: unknown): string {
  if (error instanceof ElmError) {
    switch (error.code) {
      case 'timeout':
        return 'The adapter stopped answering. Check that it is plugged in and try again.';
      case 'closed':
        return 'The adapter disconnected. Reconnect it and try again.';
      case 'unable-to-connect':
        return 'The engine computer does not answer. Switch the ignition on and try again.';
      case 'bus-error':
        return 'The adapter reports a bus error. Check that it sits firmly in the OBD port and try again.';
      default:
        return `The adapter answered with an error (${error.code}). Try again with the ignition on.`;
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

const styles = StyleSheet.create({
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lamp: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  dtcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dtcHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tileRow: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    gap: 6,
    padding: space.md,
    minHeight: 96,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  hint: { color: colors.textTertiary, paddingHorizontal: 4 },
});
