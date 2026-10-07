import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LineChart, type ChartSeries } from '@/components/line-chart';
import { Screen } from '@/components/screen';
import { Button, Card, EmptyState, IconButton, Label, SectionTitle, tap } from '@/components/ui';
import { ENGINE_MAP } from '@/data/engines';
import { convertChannel, formatDuration, formatNumber, type Units } from '@/lib/units';
import { CHANNEL_MAP, type ChannelId } from '@/obd/pids';
import { deleteLog, exportCsv, formatLogDate, type LogData, logSampleRate, loadLog, useLogs } from '@/store/logs';
import { useSettings } from '@/store/settings';
import { colors, fonts, radius, space, type } from '@/theme';

const PALETTE = ['#3D7BFF', '#2ED47A', '#FFB020', '#FF5FA2', '#A78BFA', '#22D3EE'];
const MAX_SERIES = 4;
const PREFERRED: ChannelId[] = ['boost', 'rpm', 'pedal', 'throttle', 'timing'];

type Selection = { id: ChannelId; slot: number }[];
type ChannelStats = { min: number; max: number; avg: number } | null;
type LoadState = { status: 'loading' } | { status: 'ready'; data: LogData } | { status: 'error'; message: string };

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function computeStats(values: (number | null)[]): ChannelStats {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    n++;
  }
  return n === 0 ? null : { min, max, avg: sum / n };
}

function initialSelection(data: LogData): Selection {
  const has = (id: ChannelId) => data.channels.includes(id) && (data.values[id] ?? []).some((v) => v !== null);
  const picks = PREFERRED.filter(has).slice(0, 3);
  for (const id of data.channels) {
    if (picks.length >= 3) break;
    if (!picks.includes(id) && has(id)) picks.push(id);
  }
  return picks.map((id, slot) => ({ id, slot }));
}

function Summary({ duration, samples, rate }: { duration: number; samples: number; rate: number }) {
  const items = [
    { label: 'Duration', value: formatDuration(duration), unit: '' },
    { label: 'Samples', value: samples.toLocaleString('en-US'), unit: '' },
    { label: 'Avg rate', value: formatNumber(rate, 1), unit: 'Hz' },
  ];
  return (
    <Card style={styles.summary}>
      {items.map((item, i) => (
        <View key={item.label} style={[styles.summaryItem, i > 0 && styles.summaryDivider]}>
          <Label>{item.label}</Label>
          <View style={styles.valueRow}>
            <Text style={[type.value, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {item.value}
            </Text>
            {item.unit ? <Text style={[type.callout, { color: colors.textSecondary }]}>{item.unit}</Text> : null}
          </View>
        </View>
      ))}
    </Card>
  );
}

function Chip({ label, color, active, onPress }: { label: string; color?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { backgroundColor: colors.surfacePressed }]}>
      {active && color ? <View style={[styles.key, { backgroundColor: color }]} /> : null}
      <Text style={[type.callout, { color: active ? colors.text : colors.textSecondary, fontFamily: fonts.semibold }]}>{label}</Text>
    </Pressable>
  );
}

function peakOf(values: (number | null)[]) {
  let peak: number | null = null;
  for (const v of values) if (v !== null && (peak === null || v > peak)) peak = v;
  return peak;
}

function Readout({ series, index, time, onClear }: { series: ChartSeries[]; index: number | null; time: number | null; onClear: () => void }) {
  return (
    <View style={styles.readout}>
      <View style={styles.readoutHead}>
        <Text style={[type.caption, { color: colors.textTertiary }]}>
          {index === null || time === null ? 'Peak values. Drag across the chart to read any point.' : `At ${formatTime(time)}`}
        </Text>
        {index !== null ? (
          <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button">
            <Text style={[type.caption, { color: colors.accentStrong }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.readoutGrid}>
        {series.map((s) => {
          const v = index === null ? peakOf(s.values) : s.values[index];
          return (
            <View key={s.id} style={styles.readoutItem}>
              <View style={styles.readoutLabel}>
                <View style={[styles.key, { backgroundColor: s.color }]} />
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {s.label}
                </Text>
              </View>
              <View style={styles.valueRow}>
                <Text style={[type.valueSmall, { color: v === null || v === undefined ? colors.textTertiary : colors.text }]}>
                  {v === null || v === undefined ? '–' : formatNumber(v, s.decimals)}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>{s.unit}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatsTable({
  data,
  stats,
  units,
  colorOf,
  onToggle,
}: {
  data: LogData;
  stats: Partial<Record<ChannelId, ChannelStats>>;
  units: Units;
  colorOf: (id: ChannelId) => string | undefined;
  onToggle: (id: ChannelId) => void;
}) {
  return (
    <Card padded={false}>
      <View style={[styles.tableRow, styles.tableHead]}>
        <Label style={styles.tableHeadName}>Channel</Label>
        <Label style={styles.num}>Min</Label>
        <Label style={styles.num}>Max</Label>
        <Label style={styles.num}>Avg</Label>
      </View>
      {data.channels.map((id, i) => {
        const def = CHANNEL_MAP[id];
        const s = stats[id];
        const fmt = (v: number) => {
          const c = convertChannel(def, v, units);
          return formatNumber(c.value, c.decimals);
        };
        const unit = convertChannel(def, 0, units).unit;
        const color = colorOf(id);
        return (
          <Pressable
            key={id}
            onPress={() => {
              tap();
              onToggle(id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: !!color }}
            accessibilityHint="Shows or hides this channel in the chart"
            style={({ pressed }) => [
              styles.tableRow,
              i < data.channels.length - 1 && styles.tableBorder,
              pressed && { backgroundColor: colors.surfacePressed },
            ]}>
            <View style={styles.tableName}>
              <View style={[styles.key, { backgroundColor: color ?? 'transparent' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[type.callout, { color: colors.text }]} numberOfLines={1}>
                  {def.label}
                </Text>
                <Text style={[type.caption, { color: colors.textTertiary }]}>{unit}</Text>
              </View>
            </View>
            <Text style={[type.mono, styles.num, { color: colors.textSecondary }]}>{s ? fmt(s.min) : '–'}</Text>
            <Text style={[type.mono, styles.num, { color: colors.text }]}>{s ? fmt(s.max) : '–'}</Text>
            <Text style={[type.mono, styles.num, { color: colors.textSecondary }]}>{s ? fmt(s.avg) : '–'}</Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

export default function LogDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const meta = useLogs((s) => s.logs.find((l) => l.id === id));
  const units = useSettings((s) => s.units);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selection, setSelection] = useState<Selection>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [limitHint, setLimitHint] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!id) {
      setState({ status: 'error', message: 'This log could not be found.' });
      return;
    }
    setState({ status: 'loading' });
    loadLog(id)
      .then((data) => {
        if (!alive) return;
        setState({ status: 'ready', data });
        setSelection(initialSelection(data));
        setIndex(null);
      })
      .catch((error: unknown) => {
        if (alive) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const data = state.status === 'ready' ? state.data : null;

  const stats = useMemo(() => {
    const out: Partial<Record<ChannelId, ChannelStats>> = {};
    data?.channels.forEach((c) => {
      out[c] = computeStats(data.values[c] ?? []);
    });
    return out;
  }, [data]);

  const series = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    return selection.map(({ id: channel, slot }) => {
      const def = CHANNEL_MAP[channel];
      const probe = convertChannel(def, 0, units);
      return {
        id: channel,
        label: def.short,
        color: PALETTE[slot % PALETTE.length],
        unit: probe.unit,
        decimals: probe.decimals,
        values: (data.values[channel] ?? []).map((v) => (v === null ? null : convertChannel(def, v, units).value)),
      };
    });
  }, [data, selection, units]);

  const colorOf = (channel: ChannelId) => {
    const hit = selection.find((s) => s.id === channel);
    return hit ? PALETTE[hit.slot % PALETTE.length] : undefined;
  };

  const toggle = (channel: ChannelId) => {
    if (selection.some((s) => s.id === channel)) {
      setLimitHint(false);
      setSelection(selection.filter((s) => s.id !== channel));
      return;
    }
    if (selection.length >= MAX_SERIES) {
      setLimitHint(true);
      return;
    }
    const used = new Set(selection.map((s) => s.slot));
    const slot = PALETTE.findIndex((_, i) => !used.has(i));
    setSelection([...selection, { id: channel, slot }]);
  };

  const onExport = async () => {
    if (!id || exporting) return;
    setExporting(true);
    try {
      await exportCsv(id);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'The CSV file could not be created.');
    } finally {
      setExporting(false);
    }
  };

  const onDelete = () => {
    if (!id) return;
    Alert.alert('Delete log?', `"${meta?.name ?? 'This log'}" will be removed from this phone. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteLog(id);
          if (router.canGoBack()) router.back();
          else router.replace('/logs');
        },
      },
    ]);
  };

  const canExport = !!meta && state.status === 'ready' && !exporting;

  const header = (
    <Stack.Screen
      options={{
        title: meta?.name ?? 'Log',
        headerRight: () =>
          exporting ? (
            <ActivityIndicator color={colors.text} style={{ width: 36 }} />
          ) : (
            <View style={{ opacity: canExport ? 1 : 0.4 }} pointerEvents={canExport ? 'auto' : 'none'}>
              <IconButton icon="share" label="Export CSV" onPress={onExport} background="transparent" size={36} />
            </View>
          ),
      }}
    />
  );

  if (!meta) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="doc"
          title="Log not found"
          body="It may have been deleted. Go back to your logs to pick another one."
          action={<Button title="Back to logs" variant="secondary" compact onPress={() => router.back()} style={{ marginTop: space.md }} />}
        />
      </Screen>
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen>
        {header}
        <View style={styles.loading}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text style={[type.callout, { color: colors.textSecondary }]}>Opening log</Text>
        </View>
      </Screen>
    );
  }

  if (state.status === 'error' || !data) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="warning"
          title="Log could not be opened"
          body={`${state.status === 'error' ? state.message : 'Unknown error.'} You can remove it from the list.`}
          action={<Button title="Remove log" variant="danger" icon="trash" compact onPress={onDelete} style={{ marginTop: space.md }} />}
        />
      </Screen>
    );
  }

  const engine = meta.engineId ? ENGINE_MAP[meta.engineId] : null;
  const time = index !== null && index < data.t.length ? data.t[index] : null;
  const empty = data.t.length < 2 || data.channels.length === 0;

  return (
    <Screen>
      {header}
      <Text style={[type.callout, { color: colors.textSecondary, marginBottom: space.md, paddingHorizontal: 4 }]}>
        {[formatLogDate(meta.startedAt, true), engine?.code, `${data.channels.length} channels`].filter(Boolean).join(' · ')}
      </Text>

      <Summary duration={meta.duration} samples={data.t.length} rate={logSampleRate({ duration: meta.duration, sampleCount: data.t.length })} />

      {empty ? (
        <EmptyState icon="chart" title="Nothing to plot" body="This log has no usable samples. Record a longer drive with the adapter connected." />
      ) : (
        <>
          <SectionTitle title={`Chart · ${selection.length} of ${MAX_SERIES}`} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chips}>
            {data.channels.map((c) => (
              <Chip key={c} label={CHANNEL_MAP[c].short} color={colorOf(c)} active={!!colorOf(c)} onPress={() => toggle(c)} />
            ))}
          </ScrollView>
          {limitHint ? (
            <Text style={[type.caption, { color: colors.warn, marginTop: space.sm, paddingHorizontal: 4 }]}>
              Up to {MAX_SERIES} channels at a time. Remove one to add another.
            </Text>
          ) : null}

          <Card style={styles.chartCard}>
            <LineChart series={series} t={data.t} height={240} index={index} onScrub={setIndex} />
            {series.length > 0 ? <Readout series={series} index={index} time={time} onClear={() => setIndex(null)} /> : null}
          </Card>
          <Text style={[type.caption, { color: colors.textTertiary, marginTop: space.sm, paddingHorizontal: 4 }]}>
            Each line is scaled to its own minimum and maximum.
          </Text>

          <SectionTitle title="All channels" />
          <StatsTable data={data} stats={stats} units={units} colorOf={colorOf} onToggle={toggle} />
        </>
      )}

      <View style={styles.actions}>
        <Button title="Export CSV" icon="share" variant="secondary" onPress={onExport} loading={exporting} disabled={empty} />
        <Button title="Delete log" icon="trash" variant="danger" onPress={onDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl },
  summary: { flexDirection: 'row', paddingHorizontal: 0 },
  summaryItem: { flex: 1, gap: 4, paddingHorizontal: space.lg },
  summaryDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  chipScroll: { marginHorizontal: -space.lg },
  chips: { gap: space.sm, paddingHorizontal: space.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
  key: { width: 12, height: 3, borderRadius: 1.5 },
  chartCard: { marginTop: space.md, paddingHorizontal: space.md, gap: space.lg },
  readout: { gap: space.sm, paddingHorizontal: 4 },
  readoutHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readoutGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  readoutItem: { width: '50%', gap: 2, paddingRight: space.sm },
  readoutLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tableHead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong, paddingVertical: space.md },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 10 },
  tableBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tableName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0 },
  tableHeadName: { flex: 1, marginLeft: 12 + space.sm },
  num: { width: 58, textAlign: 'right' },
  actions: { gap: space.md, marginTop: space.xxl },
});
