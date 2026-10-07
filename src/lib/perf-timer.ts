export type PerfTestId = '0-100 km/h' | '100-200 km/h' | '0-60 mph' | '60-130 mph' | '1/8 mile' | '1/4 mile';

type TestBase = { id: PerfTestId; label: string; short: string; unit: string };
export type SpeedTest = TestBase & { kind: 'speed'; fromKmh: number; toKmh: number };
export type DistanceTest = TestBase & { kind: 'distance'; meters: number };
export type PerfTest = SpeedTest | DistanceTest;

export const KMH_PER_MPH = 1.609344;
export const EIGHTH_MILE_M = 201.168;
export const QUARTER_MILE_M = 402.336;

export const PERF_TESTS: PerfTest[] = [
  { id: '0-100 km/h', label: '0–100 km/h', short: '0–100', unit: 'km/h', kind: 'speed', fromKmh: 0, toKmh: 100 },
  { id: '100-200 km/h', label: '100–200 km/h', short: '100–200', unit: 'km/h', kind: 'speed', fromKmh: 100, toKmh: 200 },
  { id: '0-60 mph', label: '0–60 mph', short: '0–60', unit: 'mph', kind: 'speed', fromKmh: 0, toKmh: 60 * KMH_PER_MPH },
  {
    id: '60-130 mph',
    label: '60–130 mph',
    short: '60–130',
    unit: 'mph',
    kind: 'speed',
    fromKmh: 60 * KMH_PER_MPH,
    toKmh: 130 * KMH_PER_MPH,
  },
  { id: '1/8 mile', label: '1/8 mile', short: '1/8', unit: 'mile', kind: 'distance', meters: EIGHTH_MILE_M },
  { id: '1/4 mile', label: '1/4 mile', short: '1/4', unit: 'mile', kind: 'distance', meters: QUARTER_MILE_M },
];

export const PERF_TEST_MAP = Object.fromEntries(PERF_TESTS.map((t) => [t.id, t])) as Record<PerfTestId, PerfTest>;

export function startSpeed(test: PerfTest) {
  return test.kind === 'speed' ? test.fromKmh : 0;
}

export function isStandingStart(test: PerfTest) {
  return startSpeed(test) === 0;
}

export type SpeedSample = { t: number; speedKmh: number };

export type TimerPhase = 'idle' | 'armed' | 'running' | 'finished' | 'aborted';

export type AbortReason = 'decel' | 'timeout' | 'signal';

export type TimerResult = {
  test: PerfTestId;
  time: number;
  maxSpeed: number;
  distance: number;
  trapSpeed?: number;
  startedAt: number;
};

export type TimerState = {
  phase: TimerPhase;
  test: PerfTestId;
  speed: number;
  hasSpeed: boolean;
  elapsed: number;
  distance: number;
  maxSpeed: number;
  progress: number;
  stillFor: number;
  result: TimerResult | null;
  abortReason: AbortReason | null;
};

export type TimerOptions = {
  standstillKmh: number;
  standstillMs: number;
  startKmh: number;
  abortDropKmh: number;
  timeoutMs: number;
  maxGapMs: number;
  smoothingMs: number;
};

export const DEFAULT_TIMER_OPTIONS: TimerOptions = {
  standstillKmh: 1,
  standstillMs: 1000,
  startKmh: 1,
  abortDropKmh: 5,
  timeoutMs: 60_000,
  maxGapMs: 1500,
  smoothingMs: 350,
};

type Launch = { lower: number; first: SpeedSample; points: SpeedSample[] };

const LAUNCH_FIT_POINTS = 5;
const LAUNCH_FIT_WINDOW_MS = 500;

const meters = (va: number, vb: number, dtMs: number) => ((va + vb) / 2 / 3.6) * (dtMs / 1000);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function timeToCover(v0: number, accel: number, distance: number) {
  const disc = v0 * v0 + 2 * accel * distance;
  if (disc <= 0) return v0 > 0 ? distance / v0 : 0;
  return (2 * distance) / (v0 + Math.sqrt(disc));
}

export class PerfTimer {
  private test: PerfTest;
  private options: TimerOptions;
  private phase: TimerPhase = 'idle';
  private last: SpeedSample | null = null;
  private recent: SpeedSample[] = [];
  private smooth: SpeedSample | null = null;
  private prevSmooth: SpeedSample | null = null;
  private stillSince: number | null = null;
  private startAt = 0;
  private launch: Launch | null = null;
  private distance = 0;
  private maxSpeed = 0;
  private endedMs = 0;
  private result: TimerResult | null = null;
  private abortReason: AbortReason | null = null;

  constructor(test: PerfTest | PerfTestId, options: Partial<TimerOptions> = {}) {
    this.test = typeof test === 'string' ? (PERF_TEST_MAP[test] ?? PERF_TESTS[0]) : test;
    this.options = { ...DEFAULT_TIMER_OPTIONS, ...options };
  }

  get state(): TimerState {
    return this.snapshot();
  }

  setTest(test: PerfTest | PerfTestId): TimerState {
    this.test = typeof test === 'string' ? (PERF_TEST_MAP[test] ?? PERF_TESTS[0]) : test;
    return this.reset();
  }

  reset(): TimerState {
    this.clearRun('idle');
    this.last = null;
    this.recent = [];
    this.smooth = null;
    this.prevSmooth = null;
    this.result = null;
    this.abortReason = null;
    return this.snapshot();
  }

  push(sample: SpeedSample): TimerState {
    const { t, speedKmh } = sample;
    if (!Number.isFinite(t) || !Number.isFinite(speedKmh) || speedKmh < 0) return this.snapshot();
    const prev = this.last;
    if (prev && t <= prev.t) return this.snapshot();
    const cur = { t, speedKmh };
    this.last = cur;
    const gap = !prev || t - prev.t > this.options.maxGapMs;
    this.track(cur, gap);
    if (this.phase === 'idle') this.whileIdle(cur, gap);
    else if (this.phase === 'armed') this.whileArmed(prev, cur, gap);
    else if (this.phase === 'running' && prev) this.whileRunning(prev, cur, gap);
    return this.snapshot();
  }

  private track(cur: SpeedSample, gap: boolean) {
    if (gap) this.recent = [];
    this.recent.push(cur);
    const cutoff = cur.t - this.options.smoothingMs;
    while (this.recent.length > 1 && this.recent[0].t <= cutoff) this.recent.shift();
    const n = this.recent.length;
    this.prevSmooth = gap ? null : this.smooth;
    this.smooth = {
      t: this.recent.reduce((sum, p) => sum + p.t, 0) / n,
      speedKmh: this.recent.reduce((sum, p) => sum + p.speedKmh, 0) / n,
    };
  }

  private smoothCrossing(value: number): number | null {
    const a = this.prevSmooth;
    const b = this.smooth;
    if (!a || !b || a.speedKmh >= value || b.speedKmh < value || b.t <= a.t) return null;
    return a.t + ((value - a.speedKmh) / (b.speedKmh - a.speedKmh)) * (b.t - a.t);
  }

  private clearRun(phase: 'idle' | 'armed') {
    this.phase = phase;
    this.stillSince = null;
    this.launch = null;
    this.startAt = 0;
    this.distance = 0;
    this.maxSpeed = 0;
    this.endedMs = 0;
  }

  private whileIdle(cur: SpeedSample, gap: boolean) {
    const from = startSpeed(this.test);
    if (from > 0) {
      if (cur.speedKmh < from) this.phase = 'armed';
      return;
    }
    if (cur.speedKmh >= this.options.standstillKmh) {
      this.stillSince = null;
      return;
    }
    if (this.stillSince === null || gap) this.stillSince = cur.t;
    if (cur.t - this.stillSince >= this.options.standstillMs) this.phase = 'armed';
  }

  private whileArmed(prev: SpeedSample | null, cur: SpeedSample, gap: boolean) {
    const from = startSpeed(this.test);
    if (!prev || gap) {
      const moving = from > 0 ? cur.speedKmh >= from : cur.speedKmh >= this.options.standstillKmh;
      if (moving) this.clearRun('idle');
      return;
    }
    if (from === 0) {
      if (cur.speedKmh > this.options.startKmh) this.startFromStandstill(prev, cur);
    } else {
      const crossing = this.smoothCrossing(from);
      if (crossing !== null) this.startRolling(crossing, cur, from);
    }
  }

  private startFromStandstill(prev: SpeedSample, cur: SpeedSample) {
    const dt = cur.t - prev.t;
    const slope = (cur.speedKmh - prev.speedKmh) / dt;
    const lower = prev.speedKmh > 0 ? Math.max(prev.t - prev.speedKmh / slope, prev.t - dt) : prev.t;
    this.begin(lower);
    this.launch = { lower, first: cur, points: [cur] };
    this.advance({ t: lower, speedKmh: 0 }, cur);
  }

  private startRolling(crossing: number, cur: SpeedSample, from: number) {
    this.begin(crossing);
    this.advance({ t: crossing, speedKmh: from }, cur);
  }

  private begin(startAt: number) {
    this.phase = 'running';
    this.startAt = startAt;
    this.distance = 0;
    this.maxSpeed = 0;
    this.launch = null;
    this.result = null;
    this.abortReason = null;
  }

  private refineLaunch(cur: SpeedSample) {
    const launch = this.launch;
    if (!launch) return;
    const { points, first } = launch;
    if (points.length >= 2 && (points.length >= LAUNCH_FIT_POINTS || cur.t - first.t > LAUNCH_FIT_WINDOW_MS)) {
      this.launch = null;
      return;
    }
    points.push(cur);
    const n = points.length;
    const mt = points.reduce((sum, p) => sum + (p.t - first.t), 0) / n;
    const mv = points.reduce((sum, p) => sum + p.speedKmh, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of points) {
      num += (p.t - first.t - mt) * (p.speedKmh - mv);
      den += (p.t - first.t - mt) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    if (!(slope > 0)) return;
    const start = clamp(first.t + mt - mv / slope, launch.lower, first.t);
    this.distance += meters(0, first.speedKmh, first.t - start) - meters(0, first.speedKmh, first.t - this.startAt);
    this.startAt = start;
  }

  private whileRunning(prev: SpeedSample, cur: SpeedSample, gap: boolean) {
    if (gap) {
      this.abort('signal', prev.t);
      return;
    }
    if (this.launch) this.refineLaunch(cur);
    if (this.advance(prev, cur)) return;
    const { abortDropKmh, standstillKmh, timeoutMs } = this.options;
    const from = startSpeed(this.test);
    if (this.maxSpeed - cur.speedKmh > abortDropKmh) this.abort('decel', cur.t);
    else if (from === 0 && cur.speedKmh < standstillKmh) {
      this.clearRun('idle');
      this.stillSince = cur.t;
    } else if (from > 0 && cur.speedKmh < from) this.clearRun('armed');
    else if (cur.t - this.startAt > timeoutMs) this.abort('timeout', this.startAt + timeoutMs);
  }

  private advance(a: SpeedSample, b: SpeedSample): boolean {
    const dt = b.t - a.t;
    const segment = meters(a.speedKmh, b.speedKmh, dt);
    const test = this.test;
    const { timeoutMs } = this.options;
    if (test.kind === 'distance' && this.distance + segment >= test.meters) {
      const remaining = Math.max(0, test.meters - this.distance);
      const accel = (b.speedKmh - a.speedKmh) / 3.6 / (dt / 1000);
      const tau = clamp(timeToCover(a.speedKmh / 3.6, accel, remaining) * 1000, 0, dt);
      const at = a.t + tau;
      if (at - this.startAt <= timeoutMs) {
        const speed = a.speedKmh + (b.speedKmh - a.speedKmh) * (tau / dt);
        this.distance = test.meters;
        this.maxSpeed = Math.max(this.maxSpeed, speed);
        this.finish(at, speed);
        return true;
      }
    }
    if (test.kind === 'speed') {
      const crossing = this.smoothCrossing(test.toKmh);
      const at = crossing === null ? null : Math.max(crossing, this.startAt);
      if (at !== null && at - this.startAt <= timeoutMs) {
        const tail = meters(test.toKmh, b.speedKmh, Math.max(0, b.t - at));
        this.distance = Math.max(0, this.distance + segment - tail);
        this.maxSpeed = Math.max(this.maxSpeed, test.toKmh);
        this.finish(at, test.toKmh);
        return true;
      }
    }
    this.distance += segment;
    this.maxSpeed = Math.max(this.maxSpeed, b.speedKmh);
    return false;
  }

  private finish(at: number, speed: number) {
    this.phase = 'finished';
    this.launch = null;
    this.endedMs = at - this.startAt;
    this.result = {
      test: this.test.id,
      time: this.endedMs / 1000,
      maxSpeed: this.maxSpeed,
      distance: this.distance,
      ...(this.test.kind === 'distance' ? { trapSpeed: speed } : {}),
      startedAt: this.startAt,
    };
  }

  private abort(reason: AbortReason, at: number) {
    this.phase = 'aborted';
    this.launch = null;
    this.abortReason = reason;
    this.endedMs = Math.max(0, at - this.startAt);
  }

  private progress() {
    if (this.phase === 'finished') return 1;
    if (this.phase !== 'running' && this.phase !== 'aborted') return 0;
    const test = this.test;
    if (test.kind === 'distance') return clamp(this.distance / test.meters, 0, 1);
    const speed = this.last?.speedKmh ?? 0;
    return clamp((speed - test.fromKmh) / (test.toKmh - test.fromKmh), 0, 1);
  }

  private snapshot(): TimerState {
    const last = this.last;
    const active = this.phase === 'running' || this.phase === 'finished' || this.phase === 'aborted';
    const elapsedMs = this.phase === 'running' && last ? last.t - this.startAt : active ? this.endedMs : 0;
    return {
      phase: this.phase,
      test: this.test.id,
      speed: last?.speedKmh ?? 0,
      hasSpeed: last !== null,
      elapsed: Math.max(0, elapsedMs) / 1000,
      distance: active ? this.distance : 0,
      maxSpeed: active ? this.maxSpeed : 0,
      progress: this.progress(),
      stillFor: this.phase === 'idle' && this.stillSince !== null && last ? last.t - this.stillSince : 0,
      result: this.result,
      abortReason: this.abortReason,
    };
  }
}
