import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { formatNumber } from '@/lib/units';
import { colors, fonts, type } from '@/theme';

export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  unit: string;
  decimals: number;
};

type Props = {
  series: ChartSeries[];
  t: number[];
  height?: number;
  index?: number | null;
  onScrub?: (index: number | null) => void;
  maxPoints?: number;
};

const PAD_TOP = 10;
const PAD_BOTTOM = 24;
const INSET = 0.06;
const TIME_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

type Bounds = { min: number; max: number; lo: number; hi: number };

function bounds(values: (number | null)[]): Bounds | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) return null;
  if (max - min < 1e-9) {
    const pad = Math.abs(min) * 0.1 || 1;
    return { min: min - pad, max: max + pad, lo: min, hi: max };
  }
  return { min, max, lo: min, hi: max };
}

function downsample(values: (number | null)[], buckets: number): number[] {
  const n = values.length;
  if (n <= buckets * 2) return values.map((_, i) => i);
  const out: number[] = [];
  const size = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(n, Math.floor((b + 1) * size));
    let lo = -1;
    let hi = -1;
    for (let i = start; i < end; i++) {
      const v = values[i];
      if (v === null) continue;
      if (lo < 0 || v < (values[lo] as number)) lo = i;
      if (hi < 0 || v > (values[hi] as number)) hi = i;
    }
    if (lo < 0) {
      out.push(start);
      continue;
    }
    if (lo === hi) out.push(lo);
    else if (lo < hi) out.push(lo, hi);
    else out.push(hi, lo);
  }
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

function timeLabel(seconds: number, step: number) {
  if (step < 1) return `${formatNumber(seconds, 1)}s`;
  if (seconds < 60 && step < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function nearestIndex(t: number[], target: number) {
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(t[lo - 1] - target) <= Math.abs(t[lo] - target)) return lo - 1;
  return lo;
}

type Geometry = {
  width: number;
  height: number;
  t0: number;
  span: number;
  plotTop: number;
  plotHeight: number;
};

const xOf = (g: Geometry, time: number) => ((time - g.t0) / g.span) * g.width;

const yOf = (g: Geometry, b: Bounds, v: number) => {
  const ratio = (v - b.min) / (b.max - b.min);
  return g.plotTop + g.plotHeight * (1 - INSET - ratio * (1 - INSET * 2));
};

const Plot = memo(function Plot({
  series,
  t,
  geometry,
  ranges,
  maxPoints,
}: {
  series: ChartSeries[];
  t: number[];
  geometry: Geometry;
  ranges: (Bounds | null)[];
  maxPoints: number;
}) {
  const { width, height, plotTop, plotHeight, t0, span } = geometry;

  const paths = useMemo(() => {
    const buckets = Math.max(10, Math.floor(Math.min(maxPoints, width * 1.5) / 2));
    return series.map((s, k) => {
      const b = ranges[k];
      if (!b) return '';
      const indices = downsample(s.values, buckets);
      let d = '';
      let pen = false;
      for (const i of indices) {
        const v = s.values[i];
        if (v === null || v === undefined || t[i] === undefined) {
          pen = false;
          continue;
        }
        const x = xOf(geometry, t[i]).toFixed(1);
        const y = yOf(geometry, b, v).toFixed(1);
        d += `${pen ? 'L' : 'M'}${x} ${y}`;
        pen = true;
      }
      return d;
    });
  }, [series, ranges, t, geometry, width, maxPoints]);

  const ticks = useMemo(() => {
    const target = Math.max(2, Math.floor(width / 72));
    const step = TIME_STEPS.find((s) => span / s <= target) ?? TIME_STEPS[TIME_STEPS.length - 1];
    const out: number[] = [];
    for (let v = Math.ceil(t0 / step) * step; v <= t0 + span + 1e-6; v += step) out.push(v);
    return { list: out, step };
  }, [width, span, t0]);

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((r) => plotTop + r * plotHeight);

  return (
    <Svg width={width} height={height}>
      <G>
        {gridY.map((y, i) => (
          <Line
            key={`h${i}`}
            x1={0}
            x2={width}
            y1={y}
            y2={y}
            stroke={i === gridY.length - 1 ? colors.borderStrong : colors.border}
            strokeWidth={1}
          />
        ))}
        {ticks.list.map((v, i) => {
          const x = xOf(geometry, v);
          const anchor = x < 16 ? 'start' : x > width - 16 ? 'end' : 'middle';
          return (
            <G key={`v${v}`}>
              {i > 0 ? <Line x1={x} x2={x} y1={plotTop} y2={plotTop + plotHeight} stroke={colors.border} strokeWidth={1} /> : null}
              <SvgText
                x={x}
                y={height - 6}
                fill={colors.textTertiary}
                fontSize={11}
                fontFamily={fonts.numMedium}
                textAnchor={anchor}>
                {timeLabel(v, ticks.step)}
              </SvgText>
            </G>
          );
        })}
      </G>
      {series.map((s, k) =>
        paths[k] ? (
          <Path
            key={s.id}
            d={paths[k]}
            stroke={s.color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
        ) : null,
      )}
    </Svg>
  );
});

export function LineChart({ series, t, height = 240, index, onScrub, maxPoints = 600 }: Props) {
  const [width, setWidth] = useState(0);
  const [internal, setInternal] = useState<number | null>(null);
  const active = index !== undefined ? index : internal;

  const ranges = useMemo(() => series.map((s) => bounds(s.values)), [series]);

  const geometry = useMemo<Geometry>(() => {
    const t0 = t.length > 0 ? t[0] : 0;
    const t1 = t.length > 0 ? t[t.length - 1] : 1;
    return {
      width,
      height,
      t0,
      span: Math.max(t1 - t0, 1e-3),
      plotTop: PAD_TOP,
      plotHeight: height - PAD_TOP - PAD_BOTTOM,
    };
  }, [t, width, height]);

  const report = (next: number | null) => {
    if (next === active) return;
    setInternal(next);
    onScrub?.(next);
  };

  const scrubTo = (x: number) => {
    if (t.length === 0 || width <= 0) return;
    const clamped = Math.min(width, Math.max(0, x));
    report(nearestIndex(t, geometry.t0 + (clamped / width) * geometry.span));
  };

  const scrubRef = useRef(scrubTo);
  useEffect(() => {
    scrubRef.current = scrubTo;
  });

  const gesture = useMemo(() => {
    const scrub = (x: number) => scrubRef.current(x);
    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-12, 12])
      .onStart((e) => {
        'worklet';
        scheduleOnRN(scrub, e.x);
      })
      .onUpdate((e) => {
        'worklet';
        scheduleOnRN(scrub, e.x);
      });
    const tap = Gesture.Tap()
      .maxDuration(400)
      .onEnd((e, success) => {
        'worklet';
        if (success) scheduleOnRN(scrub, e.x);
      });
    return Gesture.Race(pan, tap);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const hasData = t.length > 1 && series.length > 0 && ranges.some(Boolean);

  const accessibilityLabel = hasData
    ? series
        .map((s, k) => {
          const b = ranges[k];
          if (!b) return `${s.label}: no data`;
          return `${s.label} from ${formatNumber(b.lo, s.decimals)} to ${formatNumber(b.hi, s.decimals)} ${s.unit}`;
        })
        .join('. ')
    : 'No data to plot';

  const cursor =
    hasData && active !== null && active >= 0 && active < t.length && width > 0
      ? {
          x: xOf(geometry, t[active]),
          dots: series
            .map((s, k) => {
              const v = s.values[active];
              const b = ranges[k];
              return v === null || v === undefined || !b ? null : { id: s.id, color: s.color, y: yOf(geometry, b, v) };
            })
            .filter((d): d is { id: string; color: string; y: number } => d !== null),
        }
      : null;

  return (
    <View style={{ height }} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {width > 0 && hasData ? (
        <GestureDetector gesture={gesture}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
            <Plot series={series} t={t} geometry={geometry} ranges={ranges} maxPoints={maxPoints} />
            {cursor ? (
              <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Line
                  x1={cursor.x}
                  x2={cursor.x}
                  y1={geometry.plotTop}
                  y2={geometry.plotTop + geometry.plotHeight}
                  stroke={colors.textSecondary}
                  strokeWidth={1}
                />
                {cursor.dots.map((d) => (
                  <Circle key={d.id} cx={cursor.x} cy={d.y} r={4} fill={d.color} stroke={colors.surface} strokeWidth={2} />
                ))}
              </Svg>
            ) : null}
          </View>
        </GestureDetector>
      ) : null}
      {width > 0 && !hasData ? (
        <View style={[StyleSheet.absoluteFill, styles.empty]}>
          <Text style={[type.callout, { color: colors.textTertiary }]}>
            {series.length === 0 ? 'Select a channel to plot' : 'Not enough data to plot'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
});
