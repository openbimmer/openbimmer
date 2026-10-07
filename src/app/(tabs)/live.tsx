import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { RadialGauge } from '@/components/radial-gauge';
import { RecordButton } from '@/components/record-button';
import { Header, Screen } from '@/components/screen';
import { ShiftLight } from '@/components/shift-light';
import { Button, Card, tap } from '@/components/ui';
import { channelLevel, ValueTile } from '@/components/value-tile';
import { ENGINE_MAP } from '@/data/engines';
import { convertChannel, formatNumber } from '@/lib/units';
import { useChannel, useChannelDemand, useConnection } from '@/obd/session';
import { CHANNEL_MAP, type ChannelId } from '@/obd/pids';
import { useSettings } from '@/store/settings';
import { colors, fonts, radius, space, type } from '@/theme';

export default function Live() {
  const { width } = useWindowDimensions();
  const status = useConnection((s) => s.status);
  const adapter = useConnection((s) => s.adapter);
  const hz = useConnection((s) => s.hz);
  const hero = useSettings((s) => s.hero);
  const tiles = useSettings((s) => s.tiles);
  const units = useSettings((s) => s.units);
  const engineId = useSettings((s) => s.engineId);
  const keepAwake = useSettings((s) => s.keepAwake);
  const shiftLightOn = useSettings((s) => s.shiftLight);
  const haptics = useSettings((s) => s.haptics);
  const engine = ENGINE_MAP[engineId ?? 'b58'];
  const connected = status === 'connected';

  const demand = useMemo<ChannelId[]>(() => {
    const ids = new Set<ChannelId>([hero, ...tiles, 'rpm']);
    if (hero === 'boost') ids.add('boostTarget');
    return [...ids];
  }, [hero, tiles]);
  useChannelDemand(demand, connected);

  useEffect(() => {
    if (!connected || !keepAwake) return;
    activateKeepAwakeAsync('live').catch(() => undefined);
    return () => {
      deactivateKeepAwake('live').catch(() => undefined);
    };
  }, [connected, keepAwake]);

  const rpm = useChannel('rpm');
  const heroRaw = useChannel(hero);
  const targetRaw = useChannel('boostTarget');
  const heroChannel = CHANNEL_MAP[hero];
  const [peak, setPeak] = useState<number | undefined>(undefined);
  const lastHero = useRef(hero);

  useEffect(() => {
    if (lastHero.current !== hero) {
      lastHero.current = hero;
      setPeak(undefined);
      return;
    }
    if (heroRaw !== undefined) setPeak((p) => (p === undefined || heroRaw > p ? heroRaw : p));
  }, [heroRaw, hero]);

  const range = hero === 'boost' ? ([-1, engine.boostMax] as [number, number]) : hero === 'rpm' ? ([0, engine.redline + 1000] as [number, number]) : heroChannel.range;
  const conv = (v: number) => convertChannel(heroChannel, v, units);
  const unit = conv(0).unit;
  const decimals = conv(0).decimals;
  const warn = hero === 'rpm' ? engine.redline - 500 : undefined;
  const danger = hero === 'rpm' ? engine.redline : hero === 'boost' ? engine.boostMax * 0.95 : undefined;
  const size = Math.min(width - space.lg * 2, 380);
  const level = channelLevel(hero, heroRaw, engine);

  return (
    <Screen>
      <Header
        eyebrow={`${engine.code} · ${engine.series}`}
        title="Live"
        right={<RecordButton compact />}
      />

      {!connected ? (
        <Card style={styles.banner}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>No adapter connected</Text>
            <Text style={[type.callout, { color: colors.textSecondary }]}>Connect your OBD adapter or start the demo to see live data.</Text>
          </View>
          <Button title="Connect" compact onPress={() => router.push('/connect')} />
        </Card>
      ) : null}

      <Card style={styles.heroCard} padded={false}>
        {shiftLightOn ? (
          <View style={styles.shift}>
            <ShiftLight rpm={rpm} redline={engine.redline} haptics={haptics} />
          </View>
        ) : null}
        <Pressable
          onPress={() => router.push({ pathname: '/channel', params: { slot: 'hero' } })}
          onLongPress={() => {
            tap();
            setPeak(undefined);
          }}
          accessibilityHint="Tap to change the gauge, long press to reset the peak"
          style={styles.heroPress}>
          <RadialGauge
            size={size}
            value={heroRaw === undefined ? undefined : conv(heroRaw).value}
            min={conv(range[0]).value}
            max={conv(range[1]).value}
            origin={hero === 'boost' ? 0 : undefined}
            unit={unit}
            label={heroChannel.short}
            decimals={decimals}
            warnAt={warn === undefined ? undefined : conv(warn).value}
            dangerAt={danger === undefined ? undefined : conv(danger).value}
            peak={peak === undefined ? undefined : conv(peak).value}
            target={hero === 'boost' && targetRaw !== undefined ? conv(targetRaw).value : undefined}
            caption={level === 'danger' ? 'Limit' : undefined}
          />
        </Pressable>
        <View style={styles.heroFooter}>
          <Stat label="Peak" value={peak === undefined ? '––' : formatNumber(conv(peak).value, decimals)} unit={unit} />
          {hero === 'boost' ? (
            <Stat label="Target" value={targetRaw === undefined ? '––' : formatNumber(conv(targetRaw).value, decimals)} unit={unit} />
          ) : null}
          <Stat label="RPM" value={rpm === undefined ? '––' : formatNumber(rpm, 0)} unit="" />
        </View>
      </Card>

      <View style={styles.grid}>
        {tiles.map((id, index) => (
          <ValueTile
            key={`${index}-${id}`}
            id={id}
            onPress={() => router.push({ pathname: '/channel', params: { slot: String(index) } })}
          />
        ))}
      </View>

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: connected ? colors.good : colors.textTertiary }]} />
        <Text style={[type.mono, { color: colors.textTertiary }]}>
          {connected ? `${adapter?.name ?? 'Adapter'} · ${hz.toFixed(1)} Hz` : 'Offline'}
        </Text>
        <Pressable onPress={() => router.push('/connect')} hitSlop={10} style={styles.statusLink}>
          <Icon name="tune" size={13} color={colors.textTertiary} />
        </Pressable>
      </View>
      <Text style={[type.caption, styles.hint]}>Tap a gauge to choose what it shows. Long press the big gauge to reset its peak.</Text>
    </Screen>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.label, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[type.valueSmall, { color: colors.text }]}>
        {value}
        {unit ? <Text style={[type.caption, { color: colors.textSecondary, fontFamily: fonts.medium }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  heroCard: { alignItems: 'center', paddingTop: space.lg, paddingBottom: space.md, overflow: 'hidden' },
  shift: { alignSelf: 'stretch', paddingHorizontal: space.xl, marginBottom: space.xs },
  heroPress: { alignItems: 'center' },
  heroFooter: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.md,
    marginHorizontal: space.lg,
  },
  stat: { alignItems: 'center', gap: 2, minWidth: 80 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', marginTop: space.xl },
  statusLink: { padding: 4, borderRadius: radius.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  hint: { color: colors.textTertiary, textAlign: 'center', marginTop: space.sm },
});
