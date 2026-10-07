export type EngineId = 'n54' | 'n55e' | 'n55f' | 'b58' | 's55' | 'n13' | 's58' | 's63';

export type EngineProfile = {
  id: EngineId;
  code: string;
  series: string;
  title: string;
  layout: string;
  displacement: number;
  induction: string;
  powerKw: [number, number];
  torqueNm: number;
  redline: number;
  boostMax: number;
  demoBoost: number;
  years: string;
  models: string[];
  notes: string;
  limits: {
    coolant: number;
    oil: number;
    iat: number;
    timingPullWarn: number;
  };
};

export const ENGINES: EngineProfile[] = [
  {
    id: 'n54',
    code: 'N54',
    series: 'E-Series',
    title: 'N54 · 3.0 twin-turbo I6',
    layout: 'Inline-6',
    displacement: 2979,
    induction: 'Twin turbo, direct injection',
    powerKw: [225, 250],
    torqueNm: 400,
    redline: 7000,
    boostMax: 1.6,
    demoBoost: 1.05,
    years: '2006 – 2013',
    models: ['135i (E82/E88)', '335i (E90–E93)', '535i (E60/E61)', 'X6 xDrive35i (E71)', 'Z4 sDrive35i (E89)', '1M Coupé'],
    notes: 'Two parallel turbos. Watch for high-pressure fuel pump wear and wastegate rattle. Logs: boost, rail pressure and timing per cylinder group.',
    limits: { coolant: 112, oil: 130, iat: 60, timingPullWarn: 3 },
  },
  {
    id: 'n55e',
    code: 'N55',
    series: 'E-Series',
    title: 'N55 · 3.0 twin-scroll I6',
    layout: 'Inline-6',
    displacement: 2979,
    induction: 'Single twin-scroll turbo, Valvetronic',
    powerKw: [225, 235],
    torqueNm: 400,
    redline: 7000,
    boostMax: 1.6,
    demoBoost: 1.0,
    years: '2009 – 2013',
    models: ['135i (E82/E88)', '335i (E90–E93 LCI)', 'X5 xDrive35i (E70)', 'X6 xDrive35i (E71)'],
    notes: 'Single twin-scroll turbo with Valvetronic. Charge pipe and oil filter housing gasket are common wear items.',
    limits: { coolant: 112, oil: 130, iat: 60, timingPullWarn: 3 },
  },
  {
    id: 'n55f',
    code: 'N55',
    series: 'F-Series',
    title: 'N55 · 3.0 twin-scroll I6',
    layout: 'Inline-6',
    displacement: 2979,
    induction: 'Single twin-scroll turbo, Valvetronic',
    powerKw: [225, 272],
    torqueNm: 450,
    redline: 7000,
    boostMax: 1.6,
    demoBoost: 1.1,
    years: '2011 – 2018',
    models: ['M135i (F20/F21)', 'M235i (F22/F23)', '335i (F30/F31/F34)', '435i (F32/F33/F36)', '535i (F10/F11)', 'M2 (F87)', 'X3/X4 35i'],
    notes: 'F-series N55 including the M2 (N55B30T0). Rough idle on cold start often points to injectors or VANOS solenoids.',
    limits: { coolant: 112, oil: 130, iat: 60, timingPullWarn: 3 },
  },
  {
    id: 'b58',
    code: 'B58',
    series: 'F + G-Series',
    title: 'B58 · 3.0 twin-scroll I6',
    layout: 'Inline-6',
    displacement: 2998,
    induction: 'Single twin-scroll turbo, closed-deck block',
    powerKw: [240, 285],
    torqueNm: 500,
    redline: 7000,
    boostMax: 2.0,
    demoBoost: 1.35,
    years: '2015 – today',
    models: ['M140i (F20)', 'M240i (F22/G42)', '340i (F30)', 'M340i (G20/G21)', '440i (F32)', '540i (G30)', '740i (G11)', 'Z4 M40i (G29)'],
    notes: 'Integrated water-to-air intercooler in the intake. Very strong bottom end; watch charge temperatures on track days.',
    limits: { coolant: 112, oil: 135, iat: 55, timingPullWarn: 3 },
  },
  {
    id: 's55',
    code: 'S55',
    series: 'F-Series',
    title: 'S55 · 3.0 twin-turbo I6',
    layout: 'Inline-6',
    displacement: 2979,
    induction: 'Twin mono-scroll turbos',
    powerKw: [302, 368],
    torqueNm: 550,
    redline: 7600,
    boostMax: 2.0,
    demoBoost: 1.45,
    years: '2014 – 2020',
    models: ['M3 (F80)', 'M4 (F82/F83)', 'M2 Competition / CS (F87)'],
    notes: 'High-revving M engine. Crank hub and oil temperatures on track are the classic topics to log.',
    limits: { coolant: 115, oil: 140, iat: 55, timingPullWarn: 3 },
  },
  {
    id: 'n13',
    code: 'N13',
    series: 'F-Series',
    title: 'N13 · 1.6 turbo I4',
    layout: 'Inline-4',
    displacement: 1598,
    induction: 'Single twin-scroll turbo, direct injection',
    powerKw: [75, 125],
    torqueNm: 250,
    redline: 6500,
    boostMax: 1.4,
    demoBoost: 0.95,
    years: '2011 – 2016',
    models: ['114i / 116i / 118i (F20/F21)', '316i (F30)'],
    notes: 'Compact four-cylinder. Timing chain noise on cold start is worth keeping an eye on.',
    limits: { coolant: 112, oil: 130, iat: 60, timingPullWarn: 3 },
  },
  {
    id: 's58',
    code: 'S58',
    series: 'F + G-Series',
    title: 'S58 · 3.0 twin-turbo I6',
    layout: 'Inline-6',
    displacement: 2993,
    induction: 'Twin mono-scroll turbos, closed-deck block',
    powerKw: [338, 405],
    torqueNm: 650,
    redline: 7200,
    boostMax: 2.5,
    demoBoost: 1.7,
    years: '2019 – today',
    models: ['M3 (G80/G81)', 'M4 (G82/G83)', 'M2 (G87)', 'X3 M (F97)', 'X4 M (F98)'],
    notes: 'Current M inline-six. OBD manifold pressure (PID 0B) tops out at 255 kPa, so boost is read from PID 70 when the DME supports it.',
    limits: { coolant: 115, oil: 140, iat: 55, timingPullWarn: 3 },
  },
  {
    id: 's63',
    code: 'S63',
    series: 'F-Series',
    title: 'S63 · 4.4 twin-turbo V8',
    layout: 'V8 hot-vee',
    displacement: 4395,
    induction: 'Twin twin-scroll turbos inside the V',
    powerKw: [412, 460],
    torqueNm: 750,
    redline: 7000,
    boostMax: 2.0,
    demoBoost: 1.4,
    years: '2011 – 2024',
    models: ['M5 (F10/F90)', 'M6 (F06/F12/F13)', 'X5 M (F85)', 'X6 M (F86)', 'M8 (F91–F93)'],
    notes: 'Two banks: log fuel trims for bank 1 and bank 2. Heat management matters, keep an eye on oil temperature.',
    limits: { coolant: 115, oil: 140, iat: 60, timingPullWarn: 3 },
  },
];

export const ENGINE_MAP = Object.fromEntries(ENGINES.map((e) => [e.id, e])) as Record<EngineId, EngineProfile>;

export function powerLabel(e: EngineProfile) {
  const ps = (kw: number) => Math.round(kw * 1.35962);
  const [lo, hi] = e.powerKw;
  return lo === hi ? `${ps(lo)} PS` : `${ps(lo)}–${ps(hi)} PS`;
}
