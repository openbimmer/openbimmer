import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { PressableScale } from '@/components/pressable-scale';
import { Header, Screen } from '@/components/screen';
import { Button, Card, Label, Pill, SectionTitle, tap } from '@/components/ui';
import { channelLevel } from '@/components/value-tile';
import { ENGINE_MAP, powerLabel } from '@/data/engines';
import { convertChannel, formatDuration, formatNumber } from '@/lib/units';
import { useChannel, useChannelDemand, useConnection } from '@/obd/session';
import { CHANNEL_MAP, type ChannelId } from '@/obd/pids';
import { decodeVin } from '@/obd/vin';
import { formatLogDate, useLogs } from '@/store/logs';
import { useSettings } from '@/store/settings';
import { colors, fonts, radius, space, type } from '@/theme';

const HEALTH: ChannelId[] = ['coolant', 'oil', 'iat', 'voltage'];

const ACTIONS: { icon: IconName; title: string; body: string; href: '/live' | '/logs' | '/diagnose' | '/performance' }[] = [
  { icon: 'gauge', title: 'Live gauges', body: 'Boost, timing, temps', href: '/live' },
  { icon: 'chart', title: 'Data logs', body: 'Record and review pulls', href: '/logs' },
  { icon: 'stethoscope', title: 'Fault codes', body: 'Read and clear', href: '/diagnose' },
  { icon: 'timer', title: 'Performance', body: '0–100, ¼ mile', href: '/performance' },
];

export default function Garage() {
  const engineId = useSettings((s) => s.engineId);
  const nickname = useSettings((s) => s.nickname);
  const engine = ENGINE_MAP[engineId ?? 'b58'];
  const status = useConnection((s) => s.status);
  const adapter = useConnection((s) => s.adapter);
  const vin = useConnection((s) => s.vin);
  const hz = useConnection((s) => s.hz);
  const battery = useConnection((s) => s.batteryVoltage);
  const step = useConnection((s) => s.step);
  const connected = status === 'connected';
  const busy = status === 'connecting' || status === 'initializing';
  const vinInfo = vin ? decodeVin(vin) : null;
  const recent = useLogs((s) => s.logs).slice(0, 3);
  const units = useSettings((s) => s.units);

  useChannelDemand(HEALTH, connected);

  return (
    <Screen>
      <Header
        eyebrow="Garage"
        title={nickname || 'My BMW'}
        right={
          <PressableScale
            onPress={() => {
              tap();
              router.push('/connect');
            }}
            accessibilityRole="button"
            accessibilityLabel="Adapter connection">
            {connected ? (
              <Pill label={adapter?.kind === 'demo' ? 'Demo' : 'Connected'} tint={colors.good} background={colors.goodSoft} />
            ) : busy ? (
              <Pill label="Connecting" tint={colors.warn} background={colors.warnSoft} />
            ) : (
              <Pill label="Offline" tint={colors.textSecondary} background={colors.surfaceRaised} />
            )}
          </PressableScale>
        }
      />

      <Card padded={false} style={styles.hero}>
        <PressableScale
          scaleTo={0.985}
          onPress={() => {
            tap();
            router.push('/engine');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Engine ${engine.title}. Change engine`}
          style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Label color={colors.accentStrong}>{engine.series}</Label>
            <Text style={styles.engineCode}>{engine.code}</Text>
            <Text style={[type.callout, { color: colors.textSecondary }]}>{engine.title.split('·')[1]?.trim()}</Text>
          </View>
          <View style={styles.specs}>
            <Spec label="Power" value={powerLabel(engine)} />
            <Spec label="Torque" value={`${engine.torqueNm} Nm`} />
            <Spec label="Redline" value={`${engine.redline.toLocaleString('en-US')} rpm`} />
          </View>
        </PressableScale>
        <View style={styles.heroBottom}>
          {connected ? (
            <Animated.View entering={FadeIn} style={styles.connection}>
              <View style={[styles.dot, { backgroundColor: colors.good }]} />
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                  {adapter?.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {vinInfo ? `${vinInfo.vin}${vinInfo.modelYear ? ` · MY ${vinInfo.modelYear}` : ''}` : adapter?.protocolName}
                </Text>
              </View>
              <Text style={[type.mono, { color: colors.textTertiary }]}>{hz > 0 ? `${hz.toFixed(1)} Hz` : ''}</Text>
            </Animated.View>
          ) : busy ? (
            <View style={styles.connection}>
              <View style={[styles.dot, { backgroundColor: colors.warn }]} />
              <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>{step || 'Connecting'}</Text>
            </View>
          ) : (
            <View style={styles.connectRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.bodyStrong, { color: colors.text }]}>Not connected</Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>Plug in your adapter, ignition on.</Text>
              </View>
              <Button title="Connect" icon="antenna" compact onPress={() => router.push('/connect')} />
            </View>
          )}
        </View>
      </Card>

      <SectionTitle title="Health" />
      <View style={styles.healthRow}>
        {HEALTH.map((id) => (
          <HealthTile key={id} id={id} fallback={id === 'voltage' ? battery ?? undefined : undefined} />
        ))}
      </View>

      <SectionTitle title="Tools" />
      <View style={styles.actions}>
        {ACTIONS.map((a) => (
          <PressableScale
            key={a.title}
            onPress={() => {
              tap();
              router.push(a.href);
            }}
            accessibilityRole="button"
            accessibilityLabel={a.title}
            style={styles.action}>
            <View style={styles.actionIcon}>
              <Icon name={a.icon} size={19} color={colors.accentStrong} />
            </View>
            <View style={{ gap: 1 }}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>{a.title}</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{a.body}</Text>
            </View>
          </PressableScale>
        ))}
      </View>

      {recent.length > 0 ? (
        <>
          <SectionTitle title="Recent logs" action="All logs" onAction={() => router.push('/logs')} />
          <View style={{ gap: space.sm }}>
            {recent.map((log) => {
              const boost = log.peaks.boost;
              const boostText = boost === undefined ? null : convertChannel(CHANNEL_MAP.boost, boost, units);
              return (
                <PressableScale
                  key={log.id}
                  scaleTo={0.98}
                  onPress={() => {
                    tap();
                    router.push({ pathname: '/log/[id]', params: { id: log.id } });
                  }}
                  accessibilityRole="button"
                  style={styles.logRow}>
                  <View style={styles.logIcon}>
                    <Icon name="chart" size={16} color={colors.accentStrong} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {log.name}
                    </Text>
                    <Text style={[type.caption, { color: colors.textSecondary }]}>
                      {formatLogDate(log.startedAt)} · {formatDuration(log.duration)}
                    </Text>
                  </View>
                  {boostText ? (
                    <Text style={[type.mono, { color: colors.text }]}>
                      {formatNumber(boostText.value, boostText.decimals)} {boostText.unit}
                    </Text>
                  ) : null}
                  <Icon name="chevronRight" size={12} color={colors.textTertiary} />
                </PressableScale>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionTitle title={`About the ${engine.code}`} action="All engines" onAction={() => router.push('/engines')} />
      <Card>
        <Text style={[type.body, { color: colors.textSecondary }]}>{engine.notes}</Text>
        <View style={styles.models}>
          {engine.models.slice(0, 6).map((m) => (
            <View key={m} style={styles.model}>
              <Text style={[type.caption, { color: colors.textSecondary }]}>{m}</Text>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={[type.label, { color: colors.textTertiary, fontSize: 10 }]}>{label}</Text>
      <Text style={[type.mono, { color: colors.text, fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

function HealthTile({ id, fallback }: { id: ChannelId; fallback?: number }) {
  const live = useChannel(id);
  const raw = live ?? fallback;
  const units = useSettings((s) => s.units);
  const engineId = useSettings((s) => s.engineId);
  const channel = CHANNEL_MAP[id];
  const converted = raw === undefined ? null : convertChannel(channel, raw, units);
  const level = channelLevel(id, raw, engineId ? ENGINE_MAP[engineId] : null);
  const tint = level === 'danger' ? colors.danger : level === 'warn' ? colors.warn : colors.text;
  return (
    <View style={styles.health}>
      <Text style={[type.label, { color: colors.textTertiary, fontSize: 10 }]} numberOfLines={1}>
        {channel.short}
      </Text>
      <Text style={[type.valueSmall, { color: converted ? tint : colors.textTertiary }]} numberOfLines={1}>
        {converted ? formatNumber(converted.value, id === 'voltage' ? 1 : converted.decimals) : '––'}
      </Text>
      <Text style={[type.caption, { color: colors.textTertiary }]}>{convertChannel(channel, 0, units).unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', padding: space.lg, paddingBottom: space.md, gap: space.md },
  engineCode: { fontFamily: fonts.numBold, fontSize: 72, lineHeight: 76, color: colors.text, letterSpacing: -1.5, marginTop: 2 },
  specs: { gap: space.sm, paddingBottom: 4 },
  heroBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  connection: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 38 },
  connectRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  healthRow: { flexDirection: 'row', gap: space.sm },
  health: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: space.md,
    alignItems: 'center',
    gap: 2,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.md,
  },
  logIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  models: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  model: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
});
