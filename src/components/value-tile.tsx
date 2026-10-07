import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ENGINE_MAP, type EngineProfile } from '@/data/engines';
import { convertChannel, formatNumber } from '@/lib/units';
import { useChannel } from '@/obd/session';
import { CHANNEL_MAP, type ChannelId } from '@/obd/pids';
import { useSettings } from '@/store/settings';
import { colors, radius, space, type } from '@/theme';

import { PressableScale } from './pressable-scale';
import { tap } from './ui';

export function channelLevel(id: ChannelId, raw: number | undefined, engine: EngineProfile | null): 'normal' | 'warn' | 'danger' {
  if (raw === undefined || !engine) return 'normal';
  const { limits } = engine;
  switch (id) {
    case 'coolant':
      return raw >= limits.coolant ? 'danger' : raw >= limits.coolant - 6 ? 'warn' : 'normal';
    case 'oil':
      return raw >= limits.oil ? 'danger' : raw >= limits.oil - 10 ? 'warn' : 'normal';
    case 'iat':
    case 'cac':
      return raw >= limits.iat ? 'danger' : raw >= limits.iat - 10 ? 'warn' : 'normal';
    case 'boost':
      return raw >= engine.boostMax ? 'danger' : 'normal';
    case 'rpm':
      return raw >= engine.redline ? 'danger' : raw >= engine.redline - 500 ? 'warn' : 'normal';
    case 'voltage':
      return raw < 11.8 ? 'danger' : raw < 12.4 ? 'warn' : 'normal';
    case 'stft1':
    case 'stft2':
    case 'ltft1':
    case 'ltft2':
      return Math.abs(raw) >= 20 ? 'danger' : Math.abs(raw) >= 12 ? 'warn' : 'normal';
    default:
      return 'normal';
  }
}

export const ValueTile = memo(function ValueTile({
  id,
  onPress,
  onLongPress,
}: {
  id: ChannelId;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const channel = CHANNEL_MAP[id];
  const raw = useChannel(id);
  const units = useSettings((s) => s.units);
  const engineId = useSettings((s) => s.engineId);
  const engine = engineId ? ENGINE_MAP[engineId] : null;
  const [extremes, setExtremes] = useState<{ min: number; max: number } | null>(null);
  const last = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (raw === undefined || raw === last.current) return;
    last.current = raw;
    setExtremes((e) => (e ? { min: Math.min(e.min, raw), max: Math.max(e.max, raw) } : { min: raw, max: raw }));
  }, [raw]);

  useEffect(() => {
    setExtremes(null);
    last.current = undefined;
  }, [id]);

  const converted = raw !== undefined ? convertChannel(channel, raw, units) : null;
  const [lo, hi] = channel.range;
  const fraction = raw === undefined ? 0 : Math.min(1, Math.max(0, (raw - lo) / (hi - lo || 1)));
  const level = channelLevel(id, raw, engine);
  const tint = level === 'danger' ? colors.danger : level === 'warn' ? colors.warn : colors.accent;

  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(fraction, { duration: 160 });
  }, [fraction, width]);
  const barStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  const unitLabel = converted?.unit ?? convertChannel(channel, 0, units).unit;
  const fmt = (v: number) => {
    const c = convertChannel(channel, v, units);
    return formatNumber(c.value, c.decimals);
  };

  return (
    <PressableScale
      scaleTo={0.97}
      onPress={
        onPress
          ? () => {
              tap();
              onPress();
            }
          : undefined
      }
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityLabel={`${channel.label}: ${converted ? formatNumber(converted.value, converted.decimals) : 'no data'} ${unitLabel}`}
      style={[styles.tile, level !== 'normal' && { borderColor: tint }]}>
      <View style={styles.header}>
        <Text style={[type.label, { color: colors.textTertiary }]} numberOfLines={1}>
          {channel.short}
        </Text>
        <Text style={[type.caption, { color: colors.textTertiary }]}>{unitLabel}</Text>
      </View>
      <Text style={[type.display, { color: converted ? (level === 'normal' ? colors.text : tint) : colors.textTertiary }]} numberOfLines={1} adjustsFontSizeToFit>
        {converted ? formatNumber(converted.value, converted.decimals) : '––'}
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: tint }, barStyle]} />
      </View>
      <View style={styles.header}>
        <Text style={[type.mono, styles.extreme]}>{extremes ? `↓ ${fmt(extremes.min)}` : ' '}</Text>
        <Text style={[type.mono, styles.extreme]}>{extremes ? `↑ ${fmt(extremes.max)}` : ' '}</Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    paddingHorizontal: space.lg,
    gap: 4,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 3, backgroundColor: colors.track, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  fill: { height: 3, borderRadius: 2 },
  extreme: { color: colors.textTertiary, fontSize: 12.5 },
});
