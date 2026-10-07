import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';

import { colors } from '@/theme';

const SEGMENTS = 12;

export function ShiftLight({ rpm, redline, haptics }: { rpm: number | undefined; redline: number; haptics: boolean }) {
  const start = redline - 2200;
  const shift = redline - 350;
  const lit = rpm === undefined ? 0 : Math.round(Math.min(1, Math.max(0, (rpm - start) / (shift - start))) * SEGMENTS);
  const flashing = rpm !== undefined && rpm >= shift;
  const opacity = useSharedValue(1);
  const buzzed = useRef(false);

  useEffect(() => {
    if (flashing) {
      opacity.value = withRepeat(withSequence(withTiming(0.15, { duration: 70 }), withTiming(1, { duration: 70 })), -1);
      if (haptics && !buzzed.current) {
        buzzed.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      }
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
      if (rpm === undefined || rpm < shift - 600) buzzed.current = false;
    }
  }, [flashing, haptics, opacity, rpm, shift]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.row, style]} accessibilityLabel={flashing ? 'Shift now' : `Shift light ${lit} of ${SEGMENTS}`}>
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const on = i < lit;
        const color = flashing ? colors.danger : i >= SEGMENTS - 3 ? colors.danger : i >= SEGMENTS - 6 ? colors.warn : colors.good;
        return <View key={i} style={[styles.segment, { backgroundColor: on ? color : colors.track }]} />;
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, height: 6 },
  segment: { flex: 1, borderRadius: 2 },
});
