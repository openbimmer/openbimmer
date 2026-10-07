import { type PerfTestId, PerfTimer, type SpeedSample, type TimerState } from '../src/lib/perf-timer';

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(message ?? `expected ${b}, got ${a}`);
}

type CarModel = {
  launchAt: number;
  powerPerKg: number;
  traction: number;
  jerkMs: number;
  shifts: number[];
  shiftMs: number;
  brakeAtKmh?: number;
  durationMs: number;
};

type Trace = { v: Float64Array; d: Float64Array; launchAt: number };

const STEP_MS = 0.1;

function simulate(model: CarModel): Trace {
  const size = Math.ceil(model.durationMs) + 1;
  const v = new Float64Array(size);
  const d = new Float64Array(size);
  let speed = 0;
  let dist = 0;
  let shiftUntil = -1;
  let nextShift = 0;
  let braking = false;
  const steps = Math.round(1 / STEP_MS);
  for (let ms = 0; ms < size; ms++) {
    v[ms] = speed * 3.6;
    d[ms] = dist;
    for (let k = 0; k < steps; k++) {
      const t = ms + k * STEP_MS;
      if (t < model.launchAt) continue;
      const kmh = speed * 3.6;
      if (model.brakeAtKmh !== undefined && kmh >= model.brakeAtKmh) braking = true;
      if (nextShift < model.shifts.length && kmh >= model.shifts[nextShift]) {
        shiftUntil = t + model.shiftMs;
        nextShift++;
      }
      let accel: number;
      if (braking) accel = -8;
      else if (t < shiftUntil) accel = 0;
      else {
        const ramp = Math.min(1, (t - model.launchAt) / model.jerkMs);
        const drive = Math.min(model.traction, model.powerPerKg / Math.max(speed, 0.5)) * ramp;
        accel = drive - 0.000244 * speed * speed - (speed > 0 ? 0.15 : 0);
      }
      const next = Math.max(0, speed + accel * (STEP_MS / 1000));
      dist += ((speed + next) / 2) * (STEP_MS / 1000);
      speed = next;
    }
  }
  return { v, d, launchAt: model.launchAt };
}

function speedAt(trace: Trace, t: number) {
  const i = Math.floor(t);
  if (i >= trace.v.length - 1) return trace.v[trace.v.length - 1];
  return trace.v[i] + (trace.v[i + 1] - trace.v[i]) * (t - i);
}

function crossing(series: Float64Array, value: number) {
  for (let i = 1; i < series.length; i++) {
    if (series[i] >= value) return i - 1 + (value - series[i - 1]) / (series[i] - series[i - 1]);
  }
  return NaN;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SampleOptions = {
  hz: number;
  offsetMs?: number;
  noiseKmh?: number;
  jitterMs?: number;
  quantize?: boolean;
  dropFromMs?: number;
  dropForMs?: number;
  seed?: number;
};

function sample(trace: Trace, options: SampleOptions): SpeedSample[] {
  const random = rng(options.seed ?? 7);
  const period = 1000 / options.hz;
  const out: SpeedSample[] = [];
  for (let t = options.offsetMs ?? 0; t < trace.v.length - 1; t += period) {
    if (options.dropFromMs !== undefined && t >= options.dropFromMs && t < options.dropFromMs + (options.dropForMs ?? 0)) continue;
    const jitter = options.jitterMs ? (random() - 0.5) * 2 * options.jitterMs : 0;
    const at = Math.max(0, t + jitter);
    let speed = speedAt(trace, at);
    if (options.noiseKmh) speed = Math.max(0, speed + (random() - 0.5) * 2 * options.noiseKmh);
    if (options.quantize) speed = Math.round(speed);
    out.push({ t: 1_760_000_000_000 + at, speedKmh: speed });
  }
  return out;
}

function run(test: PerfTestId, samples: SpeedSample[]) {
  const timer = new PerfTimer(test);
  const phases: string[] = [];
  let state: TimerState = timer.state;
  for (const s of samples) {
    state = timer.push(s);
    if (phases[phases.length - 1] !== state.phase) phases.push(state.phase);
    if (state.phase === 'finished' || state.phase === 'aborted') break;
  }
  return { state, phases };
}

const car: CarModel = {
  launchAt: 3037.4,
  powerPerKg: 130,
  traction: 9,
  jerkMs: 40,
  shifts: [58, 105, 150],
  shiftMs: 150,
  durationMs: 40_000,
};

function truthFor(trace: Trace) {
  const cross = (kmh: number) => crossing(trace.v, kmh);
  return {
    '0-100': (cross(100) - trace.launchAt) / 1000,
    '0-60mph': (cross(60 * 1.609344) - trace.launchAt) / 1000,
    '100-200': (cross(200) - cross(100)) / 1000,
    '60-130mph': (cross(130 * 1.609344) - cross(60 * 1.609344)) / 1000,
    quarter: (crossing(trace.d, 402.336) - trace.launchAt) / 1000,
    quarterTrap: speedAt(trace, crossing(trace.d, 402.336)),
    eighth: (crossing(trace.d, 201.168) - trace.launchAt) / 1000,
  };
}

const trace = simulate(car);
const truth = truthFor(trace);
const soft = simulate({ ...car, jerkMs: 150 });
const softTruth = truthFor(soft);

let failures = 0;
const rows: string[] = [];

function check(name: string, fn: () => string) {
  try {
    rows.push(`ok    ${name}  ${fn()}`);
  } catch (error) {
    failures++;
    rows.push(`FAIL  ${name}  ${error instanceof Error ? error.message : String(error)}`);
  }
}

const PHASES = 25;

function sweep(name: string, test: PerfTestId, source: Trace, expected: number, options: SampleOptions, tolerance: number) {
  check(name, () => {
    const errors: number[] = [];
    for (let k = 0; k < PHASES; k++) {
      const offsetMs = (k / PHASES) * (1000 / options.hz);
      const { state, phases } = run(test, sample(source, { ...options, offsetMs, seed: k + 1 }));
      same(state.phase, 'finished', `phase offset ${offsetMs.toFixed(0)} ms ended ${state.phase} (${phases.join(' > ')}, ${state.abortReason})`);
      errors.push(state.result!.time - expected);
    }
    const worst = errors.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    const mean = errors.reduce((a, b) => a + b, 0) / errors.length;
    const ms = (v: number) => `${v >= 0 ? '+' : ''}${(v * 1000).toFixed(0)} ms`;
    ensure(Math.abs(worst) <= tolerance, `worst error ${ms(worst)} exceeds ${tolerance * 1000} ms (truth ${expected.toFixed(3)} s)`);
    return `truth ${expected.toFixed(3)} s, mean ${ms(mean)}, worst ${ms(worst)} over ${PHASES} phases`;
  });
}

const gps10 = { hz: 10, noiseKmh: 0.3, jitterMs: 5 };

sweep('0-100 km/h, 10 Hz clean', '0-100 km/h', trace, truth['0-100'], { hz: 10 }, 0.05);
sweep('0-100 km/h, 10 Hz GPS noise + jitter', '0-100 km/h', trace, truth['0-100'], gps10, 0.05);
sweep('0-100 km/h, 20 Hz clean', '0-100 km/h', trace, truth['0-100'], { hz: 20 }, 0.05);
sweep('0-100 km/h, 8 Hz OBD integer speed', '0-100 km/h', trace, truth['0-100'], { hz: 8, quantize: true }, 0.1);
sweep('0-100 km/h, 1 Hz phone GPS', '0-100 km/h', trace, truth['0-100'], { hz: 1 }, 0.15);
sweep('0-100 km/h, soft 150 ms launch, 10 Hz', '0-100 km/h', soft, softTruth['0-100'], { hz: 10 }, 0.1);
sweep('0-60 mph, 10 Hz GPS noise', '0-60 mph', trace, truth['0-60mph'], gps10, 0.05);
sweep('100-200 km/h, 10 Hz clean', '100-200 km/h', trace, truth['100-200'], { hz: 10 }, 0.05);
sweep('100-200 km/h, 10 Hz GPS noise', '100-200 km/h', trace, truth['100-200'], gps10, 0.05);
sweep('60-130 mph, 10 Hz GPS noise', '60-130 mph', trace, truth['60-130mph'], gps10, 0.05);
sweep('1/8 mile, 10 Hz GPS noise', '1/8 mile', trace, truth.eighth, gps10, 0.05);
sweep('1/4 mile, 10 Hz GPS noise', '1/4 mile', trace, truth.quarter, gps10, 0.05);

check('1/4 mile trap speed and distance', () => {
  const { state } = run('1/4 mile', sample(trace, { hz: 10, offsetMs: 25 }));
  const result = state.result!;
  ensure(result.trapSpeed !== undefined && Math.abs(result.trapSpeed - truth.quarterTrap) < 1, `trap ${result.trapSpeed} vs ${truth.quarterTrap}`);
  ensure(Math.abs(result.distance - 402.336) < 0.01, `distance ${result.distance}`);
  return `trap ${result.trapSpeed!.toFixed(1)} km/h, truth ${truth.quarterTrap.toFixed(1)} km/h`;
});

check('0-100 km/h distance is plausible', () => {
  const { state } = run('0-100 km/h', sample(trace, { hz: 10, offsetMs: 13 }));
  const expected = trace.d[Math.round(crossing(trace.v, 100))];
  ensure(Math.abs(state.result!.distance - expected) < 1, `distance ${state.result!.distance} vs ${expected}`);
  return `${state.result!.distance.toFixed(1)} m, truth ${expected.toFixed(1)} m`;
});

check('does not arm without 1 s standstill', () => {
  const short = simulate({ ...car, launchAt: 600 });
  const { phases } = run('0-100 km/h', sample(short, { hz: 10, offsetMs: 0 }));
  ensure(!phases.includes('armed') && !phases.includes('running'), phases.join(' > '));
  return phases.join(' > ');
});

check('arms after standstill, then runs', () => {
  const { phases } = run('0-100 km/h', sample(trace, { hz: 10 }));
  same(phases, ['idle', 'armed', 'running', 'finished']);
  return phases.join(' > ');
});

check('aborts when the car slows down', () => {
  const braking = simulate({ ...car, brakeAtKmh: 70 });
  const { state } = run('0-100 km/h', sample(braking, { hz: 10, offsetMs: 13 }));
  same(state.phase, 'aborted');
  same(state.abortReason, 'decel');
  return `aborted (decel) after ${state.elapsed.toFixed(2)} s`;
});

check('aborts after 60 s', () => {
  const slow = simulate({ ...car, powerPerKg: 4.5, durationMs: 70_000 });
  const { state } = run('0-100 km/h', sample(slow, { hz: 10, offsetMs: 13 }));
  same(state.phase, 'aborted');
  same(state.abortReason, 'timeout');
  ensure(Math.abs(state.elapsed - 60) < 0.001, `elapsed ${state.elapsed}`);
  return `aborted (timeout) at ${state.elapsed.toFixed(2)} s`;
});

check('aborts when the speed signal drops out', () => {
  const { state } = run('0-100 km/h', sample(trace, { hz: 10, offsetMs: 13, dropFromMs: 4500, dropForMs: 2000 }));
  same(state.phase, 'aborted');
  same(state.abortReason, 'signal');
  return 'aborted (signal)';
});

check('rolling test re-arms after a false start below the lower bound', () => {
  const timer = new PerfTimer('100-200 km/h');
  const base = 1_760_000_000_000;
  const feed = [96, 98, 99, 100.5, 101.5, 102, 99.5, 98, 97, 99, 101, 104, 106, 108];
  const phases = feed.map((v, i) => timer.push({ t: base + i * 100, speedKmh: v }).phase);
  const expected = ['armed', 'armed', 'armed', 'armed', 'armed', 'running', 'armed', 'armed', 'armed', 'armed', 'armed', 'running', 'running', 'running'];
  same(phases, expected);
  return phases.join(' > ');
});

check('ignores unknown and out-of-order samples', () => {
  const timer = new PerfTimer('0-100 km/h');
  const base = 1_760_000_000_000;
  timer.push({ t: base, speedKmh: 0 });
  timer.push({ t: base + 100, speedKmh: 0 });
  const a = timer.push({ t: base + 200, speedKmh: -1 });
  const b = timer.push({ t: base + 50, speedKmh: 30 });
  const c = timer.push({ t: base + 300, speedKmh: Number.NaN });
  same(a.speed, 0);
  same(b.speed, 0);
  same(c.speed, 0);
  return 'ok';
});

console.log(rows.join('\n'));
console.log(failures === 0 ? '\nAll perf-timer checks passed.' : `\n${failures} perf-timer check(s) failed.`);
if (failures > 0) throw new Error(`${failures} perf-timer check(s) failed`);
