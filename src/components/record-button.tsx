import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { formatDuration } from '@/lib/units';
import { useConnection } from '@/obd/session';
import { startRecording, stopRecording, useRecording } from '@/store/logs';
import { useSettings } from '@/store/settings';
import { colors, fonts, radius, space, type } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';

function haptic(kind: 'start' | 'saved' | 'warn') {
  if (!useSettings.getState().haptics) return;
  const run =
    kind === 'start'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.notificationAsync(kind === 'saved' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  run.catch(() => undefined);
}

let handledResultAt = 0;

function PulseDot({ active, size }: { active: boolean; size: number }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (active) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 650, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(opacity);
  }, [active, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.danger }, style]} />;
}

export function RecordButton({ compact = false }: { compact?: boolean }) {
  const connected = useConnection((s) => s.status === 'connected');
  const recording = useRecording((s) => s.recording);
  const startedAt = useRecording((s) => s.recordStartedAt);
  const samples = useRecording((s) => s.liveSampleCount);
  const lastResult = useRecording((s) => s.lastResult);
  const channelCount = useSettings((s) => s.logChannels.length);

  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<{ text: string; tone: 'muted' | 'warn' | 'danger' } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenResult = useRef(lastResult?.at ?? 0);

  useEffect(() => {
    if (!recording) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const showFlash = (text: string, tone: 'muted' | 'warn' | 'danger') => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ text, tone });
    flashTimer.current = setTimeout(() => setFlash(null), 3200);
  };

  useEffect(() => {
    if (!lastResult || lastResult.at === seenResult.current) return;
    seenResult.current = lastResult.at;
    const first = lastResult.at > handledResultAt;
    if (first) handledResultAt = lastResult.at;
    if (lastResult.kind === 'saved') {
      if (first) haptic('saved');
      showFlash('Log saved', 'muted');
    } else if (lastResult.kind === 'discarded') {
      if (first) haptic('warn');
      showFlash('Too short to save', 'warn');
    } else {
      showFlash('Log could not be saved', 'danger');
      if (first) {
        haptic('warn');
        Alert.alert('Log not saved', lastResult.message);
      }
    }
  }, [lastResult]);

  const disabled = !recording && (!connected || channelCount === 0);
  const elapsed = recording && startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;

  const onPress = () => {
    if (recording) {
      void stopRecording();
      return;
    }
    if (!connected) {
      haptic('warn');
      showFlash('Connect an adapter first', 'warn');
      return;
    }
    if (channelCount === 0) {
      haptic('warn');
      showFlash('Choose at least one channel', 'warn');
      return;
    }
    if (startRecording()) {
      haptic('start');
      setFlash(null);
    } else {
      haptic('warn');
      showFlash('Recording could not start', 'danger');
    }
  };

  const hint = flash
    ? flash
    : !connected && !recording
      ? { text: 'Connect an adapter to record', tone: 'muted' as const }
      : null;
  const hintColor = hint?.tone === 'danger' ? colors.danger : hint?.tone === 'warn' ? colors.warn : colors.textTertiary;

  const label = recording ? formatDuration(elapsed) : compact && flash ? flash.text : 'Record';

  const pill = (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recording ? `Stop recording, ${formatDuration(elapsed)} elapsed` : 'Start recording'}
      accessibilityHint={disabled ? 'Connect an adapter to record' : undefined}
      accessibilityState={{ disabled }}
      hitSlop={compact ? 6 : 0}
      style={[
        styles.pill,
        compact ? styles.pillCompact : styles.pillLarge,
        recording ? styles.pillRecording : styles.pillIdle,
        { opacity: disabled ? 0.5 : 1 },
      ]}>
      <PulseDot active={recording} size={compact ? 8 : 10} />
      <Text
        style={[
          recording ? (compact ? type.mono : type.valueSmall) : compact ? type.callout : type.bodyStrong,
          { color: colors.text, fontFamily: recording ? fonts.numSemibold : fonts.semibold },
        ]}
        numberOfLines={1}>
        {label}
      </Text>
      {recording ? (
        <View style={[styles.stop, compact && styles.stopCompact]}>
          <Icon name="stop" size={compact ? 9 : 11} color={colors.danger} />
          {compact ? null : <Text style={[type.caption, { color: colors.danger, fontFamily: fonts.semibold }]}>Stop</Text>}
        </View>
      ) : null}
    </PressableScale>
  );

  if (compact) return pill;

  return (
    <View style={styles.wrap}>
      {pill}
      <Text style={[type.caption, { color: hintColor }]} numberOfLines={1}>
        {recording ? `${samples.toLocaleString('en-US')} samples` : hint ? hint.text : ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillCompact: { height: 34, paddingHorizontal: space.md, gap: space.sm, alignSelf: 'flex-start' },
  pillLarge: { height: 52, paddingHorizontal: space.xl, gap: space.md, alignSelf: 'stretch' },
  pillIdle: { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
  pillRecording: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
  },
  stopCompact: { width: 20, height: 20, paddingHorizontal: 0, justifyContent: 'center' },
});
