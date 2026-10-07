import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { formatNumber } from '@/lib/units';
import { colors, fonts, type } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const START = 135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  'worklet';
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  'worklet';
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  if (b - a < 0.01) return '';
  const p1 = polar(cx, cy, r, a);
  const p2 = polar(cx, cy, r, b);
  const large = b - a > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

function niceStep(span: number) {
  const raw = span / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return step * mag;
}

type Props = {
  value: number | undefined;
  min: number;
  max: number;
  origin?: number;
  unit: string;
  label: string;
  decimals: number;
  warnAt?: number;
  dangerAt?: number;
  peak?: number;
  target?: number;
  size: number;
  caption?: string;
};

export function RadialGauge({
  value,
  min,
  max,
  origin,
  unit,
  label,
  decimals,
  warnAt,
  dangerAt,
  peak,
  target,
  size,
  caption,
}: Props) {
  const stroke = Math.max(10, size * 0.05);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - stroke - 14;
  const zero = Math.min(max, Math.max(min, origin ?? min));
  const toDeg = (v: number) => START + (SWEEP * (Math.min(max, Math.max(min, v)) - min)) / (max - min || 1);

  const animated = useSharedValue(zero);
  useEffect(() => {
    animated.value = withTiming(value ?? zero, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [value, zero, animated]);

  const tint =
    value !== undefined && dangerAt !== undefined && value >= dangerAt
      ? colors.danger
      : value !== undefined && warnAt !== undefined && value >= warnAt
        ? colors.warn
        : colors.accent;

  const arcProps = useAnimatedProps(() => {
    const v = Math.min(max, Math.max(min, animated.value));
    const from = START + (SWEEP * (zero - min)) / (max - min || 1);
    const to = START + (SWEEP * (v - min)) / (max - min || 1);
    return { d: arc(cx, cy, r, from, to) || `M ${cx} ${cy}` };
  });

  const needleProps = useAnimatedProps(() => {
    const v = Math.min(max, Math.max(min, animated.value));
    const deg = START + (SWEEP * (v - min)) / (max - min || 1);
    const outer = polar(cx, cy, r + stroke / 2 + 4, deg);
    const inner = polar(cx, cy, r - stroke / 2 - 8, deg);
    return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
  });

  const ticks = useMemo(() => {
    const step = niceStep(max - min);
    const out: { v: number; major: boolean }[] = [];
    const first = Math.ceil(min / step) * step;
    for (let v = first; v <= max + step * 0.001; v += step) {
      out.push({ v: Math.round(v / step) * step, major: true });
      const half = v + step / 2;
      if (half < max) out.push({ v: half, major: false });
    }
    return { list: out, step };
  }, [min, max]);

  const tickDecimals = ticks.step < 1 ? (ticks.step < 0.1 ? 2 : 1) : 0;

  return (
    <View style={{ width: size, height: size * 0.86 }} accessibilityRole="text" accessibilityLabel={`${label} ${value === undefined ? 'no data' : formatNumber(value, decimals)} ${unit}`}>
      <Svg width={size} height={size}>
        <Path d={arc(cx, cy, r, START, START + SWEEP)} stroke={colors.track} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {warnAt !== undefined && warnAt < max ? (
          <Path
            d={arc(cx, cy, r + stroke / 2 + 5, toDeg(warnAt), toDeg(dangerAt ?? max))}
            stroke={colors.warn}
            strokeOpacity={0.55}
            strokeWidth={2}
            fill="none"
          />
        ) : null}
        {dangerAt !== undefined && dangerAt < max ? (
          <Path d={arc(cx, cy, r + stroke / 2 + 5, toDeg(dangerAt), START + SWEEP)} stroke={colors.danger} strokeOpacity={0.7} strokeWidth={2} fill="none" />
        ) : null}
        <AnimatedPath animatedProps={arcProps} stroke={tint} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <G>
          {ticks.list.map((t) => {
            const deg = toDeg(t.v);
            const p1 = polar(cx, cy, r - stroke / 2 - 6, deg);
            const p2 = polar(cx, cy, r - stroke / 2 - (t.major ? 14 : 10), deg);
            const lp = polar(cx, cy, r - stroke / 2 - 28, deg);
            return (
              <G key={`${t.v}-${t.major}`}>
                <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={t.major ? colors.textSecondary : colors.textTertiary} strokeWidth={t.major ? 1.6 : 1} />
                {t.major && size > 200 ? (
                  <SvgText x={lp.x} y={lp.y + 4} fill={colors.textTertiary} fontSize={11} fontFamily={fonts.numMedium} textAnchor="middle">
                    {formatNumber(t.v, tickDecimals)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </G>
        {peak !== undefined && peak > min ? (
          <Circle cx={polar(cx, cy, r, toDeg(peak)).x} cy={polar(cx, cy, r, toDeg(peak)).y} r={stroke / 2 - 2} fill={colors.text} opacity={0.9} />
        ) : null}
        {target !== undefined ? (
          <Line
            x1={polar(cx, cy, r - stroke / 2 - 2, toDeg(target)).x}
            y1={polar(cx, cy, r - stroke / 2 - 2, toDeg(target)).y}
            x2={polar(cx, cy, r + stroke / 2 + 2, toDeg(target)).x}
            y2={polar(cx, cy, r + stroke / 2 + 2, toDeg(target)).y}
            stroke={colors.good}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ) : null}
        <AnimatedLine animatedProps={needleProps} stroke={colors.text} strokeWidth={3} strokeLinecap="round" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={[type.label, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[size > 220 ? type.hero : type.display, { color: value === undefined ? colors.textTertiary : colors.text }]} numberOfLines={1}>
          {value === undefined ? '––' : formatNumber(value, decimals)}
        </Text>
        <Text style={[type.callout, { color: colors.textSecondary }]}>{unit}</Text>
        {caption ? <Text style={[type.caption, { color: colors.textTertiary, marginTop: 6 }]}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingBottom: 6 },
});
