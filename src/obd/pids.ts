export type Quantity =
  | 'rpm'
  | 'speed'
  | 'temperature'
  | 'pressure'
  | 'pressureAbs'
  | 'percent'
  | 'angle'
  | 'voltage'
  | 'massFlow'
  | 'lambda'
  | 'afr'
  | 'fuelRate'
  | 'torque'
  | 'power'
  | 'duration'
  | 'distance';

export type Rate = 'fast' | 'medium' | 'slow';

export type PidDef = {
  pid: number;
  bytes: number;
  decode: (d: number[]) => number | null;
};

const u16 = (a: number, b: number) => a * 256 + b;
const pct = (a: number) => (a * 100) / 255;
const trim = (a: number) => ((a - 128) * 100) / 128;

export const PIDS: Record<number, PidDef> = {
  0x01: { pid: 0x01, bytes: 4, decode: (d) => d[0] },
  0x04: { pid: 0x04, bytes: 1, decode: (d) => pct(d[0]) },
  0x05: { pid: 0x05, bytes: 1, decode: (d) => d[0] - 40 },
  0x06: { pid: 0x06, bytes: 1, decode: (d) => trim(d[0]) },
  0x07: { pid: 0x07, bytes: 1, decode: (d) => trim(d[0]) },
  0x08: { pid: 0x08, bytes: 1, decode: (d) => trim(d[0]) },
  0x09: { pid: 0x09, bytes: 1, decode: (d) => trim(d[0]) },
  0x0b: { pid: 0x0b, bytes: 1, decode: (d) => d[0] },
  0x0c: { pid: 0x0c, bytes: 2, decode: (d) => u16(d[0], d[1]) / 4 },
  0x0d: { pid: 0x0d, bytes: 1, decode: (d) => d[0] },
  0x0e: { pid: 0x0e, bytes: 1, decode: (d) => d[0] / 2 - 64 },
  0x0f: { pid: 0x0f, bytes: 1, decode: (d) => d[0] - 40 },
  0x10: { pid: 0x10, bytes: 2, decode: (d) => u16(d[0], d[1]) / 100 },
  0x11: { pid: 0x11, bytes: 1, decode: (d) => pct(d[0]) },
  0x1f: { pid: 0x1f, bytes: 2, decode: (d) => u16(d[0], d[1]) },
  0x23: { pid: 0x23, bytes: 2, decode: (d) => u16(d[0], d[1]) * 10 },
  0x24: { pid: 0x24, bytes: 4, decode: (d) => (2 / 65536) * u16(d[0], d[1]) },
  0x2f: { pid: 0x2f, bytes: 1, decode: (d) => pct(d[0]) },
  0x31: { pid: 0x31, bytes: 2, decode: (d) => u16(d[0], d[1]) },
  0x33: { pid: 0x33, bytes: 1, decode: (d) => d[0] },
  0x34: { pid: 0x34, bytes: 4, decode: (d) => (2 / 65536) * u16(d[0], d[1]) },
  0x3c: { pid: 0x3c, bytes: 2, decode: (d) => u16(d[0], d[1]) / 10 - 40 },
  0x42: { pid: 0x42, bytes: 2, decode: (d) => u16(d[0], d[1]) / 1000 },
  0x43: { pid: 0x43, bytes: 2, decode: (d) => (u16(d[0], d[1]) * 100) / 255 },
  0x44: { pid: 0x44, bytes: 2, decode: (d) => (2 / 65536) * u16(d[0], d[1]) },
  0x45: { pid: 0x45, bytes: 1, decode: (d) => pct(d[0]) },
  0x46: { pid: 0x46, bytes: 1, decode: (d) => d[0] - 40 },
  0x49: { pid: 0x49, bytes: 1, decode: (d) => pct(d[0]) },
  0x4c: { pid: 0x4c, bytes: 1, decode: (d) => pct(d[0]) },
  0x5c: { pid: 0x5c, bytes: 1, decode: (d) => d[0] - 40 },
  0x5e: { pid: 0x5e, bytes: 2, decode: (d) => u16(d[0], d[1]) / 20 },
  0x61: { pid: 0x61, bytes: 1, decode: (d) => d[0] - 125 },
  0x62: { pid: 0x62, bytes: 1, decode: (d) => d[0] - 125 },
  0x63: { pid: 0x63, bytes: 2, decode: (d) => u16(d[0], d[1]) },
  0x70: {
    pid: 0x70,
    bytes: 10,
    decode: (d) => ((d[0] & 0x02) !== 0 ? u16(d[3], d[4]) / 32 : null),
  },
  0x77: { pid: 0x77, bytes: 5, decode: (d) => ((d[0] & 0x01) !== 0 ? d[1] - 40 : null) },
  0x87: { pid: 0x87, bytes: 5, decode: (d) => ((d[0] & 0x01) !== 0 ? u16(d[1], d[2]) / 32 : null) },
  0xa6: {
    pid: 0xa6,
    bytes: 4,
    decode: (d) => (d[0] * 16777216 + d[1] * 65536 + d[2] * 256 + d[3]) / 10,
  },
};

export function boostTarget(d: number[]): number | null {
  return (d[0] & 0x01) !== 0 ? u16(d[1], d[2]) / 32 : null;
}

export type ChannelId =
  | 'rpm'
  | 'speed'
  | 'boost'
  | 'boostTarget'
  | 'map'
  | 'baro'
  | 'load'
  | 'absLoad'
  | 'throttle'
  | 'pedal'
  | 'timing'
  | 'coolant'
  | 'oil'
  | 'iat'
  | 'cac'
  | 'ambient'
  | 'maf'
  | 'rail'
  | 'lambda'
  | 'lambdaTarget'
  | 'afr'
  | 'stft1'
  | 'ltft1'
  | 'stft2'
  | 'ltft2'
  | 'catTemp'
  | 'voltage'
  | 'fuelLevel'
  | 'fuelRate'
  | 'torque'
  | 'power'
  | 'runtime'
  | 'odometer'
  | 'clearDistance';

export type ChannelDef = {
  id: ChannelId;
  label: string;
  short: string;
  quantity: Quantity;
  rate: Rate;
  pids: number[];
  range: [number, number];
  decimals?: number;
};

export const CHANNELS: ChannelDef[] = [
  { id: 'rpm', label: 'Engine speed', short: 'RPM', quantity: 'rpm', rate: 'fast', pids: [0x0c], range: [0, 8000] },
  { id: 'speed', label: 'Vehicle speed', short: 'Speed', quantity: 'speed', rate: 'fast', pids: [0x0d], range: [0, 300] },
  { id: 'boost', label: 'Boost', short: 'Boost', quantity: 'pressure', rate: 'fast', pids: [0x0b, 0x70, 0x87, 0x33], range: [-1, 2], decimals: 2 },
  { id: 'boostTarget', label: 'Boost target', short: 'Target', quantity: 'pressure', rate: 'fast', pids: [0x70, 0x33], range: [-1, 2], decimals: 2 },
  { id: 'map', label: 'Manifold pressure', short: 'MAP', quantity: 'pressureAbs', rate: 'fast', pids: [0x0b, 0x87], range: [0, 300] },
  { id: 'baro', label: 'Barometric pressure', short: 'Baro', quantity: 'pressureAbs', rate: 'slow', pids: [0x33], range: [70, 110] },
  { id: 'load', label: 'Calculated load', short: 'Load', quantity: 'percent', rate: 'fast', pids: [0x04], range: [0, 100] },
  { id: 'absLoad', label: 'Absolute load', short: 'Abs load', quantity: 'percent', rate: 'fast', pids: [0x43], range: [0, 250] },
  { id: 'throttle', label: 'Throttle position', short: 'Throttle', quantity: 'percent', rate: 'fast', pids: [0x11], range: [0, 100] },
  { id: 'pedal', label: 'Accelerator pedal', short: 'Pedal', quantity: 'percent', rate: 'fast', pids: [0x49], range: [0, 100] },
  { id: 'timing', label: 'Ignition timing', short: 'Timing', quantity: 'angle', rate: 'fast', pids: [0x0e], range: [-20, 40], decimals: 1 },
  { id: 'coolant', label: 'Coolant temperature', short: 'Coolant', quantity: 'temperature', rate: 'slow', pids: [0x05], range: [-20, 130] },
  { id: 'oil', label: 'Oil temperature', short: 'Oil', quantity: 'temperature', rate: 'slow', pids: [0x5c], range: [-20, 150] },
  { id: 'iat', label: 'Intake air temperature', short: 'IAT', quantity: 'temperature', rate: 'medium', pids: [0x0f], range: [-20, 90] },
  { id: 'cac', label: 'Charge air cooler temp', short: 'CAC', quantity: 'temperature', rate: 'medium', pids: [0x77], range: [-20, 90] },
  { id: 'ambient', label: 'Ambient temperature', short: 'Ambient', quantity: 'temperature', rate: 'slow', pids: [0x46], range: [-30, 50] },
  { id: 'maf', label: 'Mass air flow', short: 'MAF', quantity: 'massFlow', rate: 'fast', pids: [0x10], range: [0, 400], decimals: 1 },
  { id: 'rail', label: 'Fuel rail pressure', short: 'Rail', quantity: 'pressure', rate: 'medium', pids: [0x23], range: [0, 350], decimals: 0 },
  { id: 'lambda', label: 'Lambda (bank 1)', short: 'Lambda', quantity: 'lambda', rate: 'fast', pids: [0x24, 0x34], range: [0.6, 1.4], decimals: 3 },
  { id: 'lambdaTarget', label: 'Commanded lambda', short: 'λ target', quantity: 'lambda', rate: 'fast', pids: [0x44], range: [0.6, 1.4], decimals: 3 },
  { id: 'afr', label: 'Air-fuel ratio', short: 'AFR', quantity: 'afr', rate: 'fast', pids: [0x24, 0x34], range: [9, 20], decimals: 1 },
  { id: 'stft1', label: 'Short term fuel trim B1', short: 'STFT 1', quantity: 'percent', rate: 'medium', pids: [0x06], range: [-25, 25], decimals: 1 },
  { id: 'ltft1', label: 'Long term fuel trim B1', short: 'LTFT 1', quantity: 'percent', rate: 'slow', pids: [0x07], range: [-25, 25], decimals: 1 },
  { id: 'stft2', label: 'Short term fuel trim B2', short: 'STFT 2', quantity: 'percent', rate: 'medium', pids: [0x08], range: [-25, 25], decimals: 1 },
  { id: 'ltft2', label: 'Long term fuel trim B2', short: 'LTFT 2', quantity: 'percent', rate: 'slow', pids: [0x09], range: [-25, 25], decimals: 1 },
  { id: 'catTemp', label: 'Catalyst temperature', short: 'Cat', quantity: 'temperature', rate: 'slow', pids: [0x3c], range: [0, 1000] },
  { id: 'voltage', label: 'Control module voltage', short: 'Voltage', quantity: 'voltage', rate: 'slow', pids: [0x42], range: [10, 16], decimals: 1 },
  { id: 'fuelLevel', label: 'Fuel level', short: 'Fuel', quantity: 'percent', rate: 'slow', pids: [0x2f], range: [0, 100] },
  { id: 'fuelRate', label: 'Fuel rate', short: 'Fuel rate', quantity: 'fuelRate', rate: 'medium', pids: [0x5e], range: [0, 80], decimals: 1 },
  { id: 'torque', label: 'Engine torque (est.)', short: 'Torque', quantity: 'torque', rate: 'fast', pids: [0x62, 0x63], range: [0, 800] },
  { id: 'power', label: 'Engine power (est.)', short: 'Power', quantity: 'power', rate: 'fast', pids: [0x62, 0x63, 0x0c], range: [0, 500] },
  { id: 'runtime', label: 'Engine run time', short: 'Run time', quantity: 'duration', rate: 'slow', pids: [0x1f], range: [0, 7200] },
  { id: 'odometer', label: 'Odometer', short: 'Odometer', quantity: 'distance', rate: 'slow', pids: [0xa6], range: [0, 400000] },
  { id: 'clearDistance', label: 'Distance since codes cleared', short: 'Since clear', quantity: 'distance', rate: 'slow', pids: [0x31], range: [0, 65535] },
];

export const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.id, c])) as Record<ChannelId, ChannelDef>;

export type RawValues = Partial<Record<number, number[]>>;

export function decodeMode01(data: number[]): RawValues {
  const out: RawValues = {};
  let i = 0;
  while (i < data.length) {
    if (data[i] === 0x41) {
      i += 1;
      continue;
    }
    const def = PIDS[data[i]];
    if (!def || i + 1 + def.bytes > data.length) break;
    out[def.pid] = data.slice(i + 1, i + 1 + def.bytes);
    i += 1 + def.bytes;
  }
  return out;
}

export type Snapshot = Partial<Record<ChannelId, number>>;

const STD_BARO = 101.3;

export function computeChannels(raw: RawValues, previous: Snapshot): Snapshot {
  const v = (pid: number) => {
    const d = raw[pid];
    if (!d) return undefined;
    const value = PIDS[pid].decode(d);
    return value === null || Number.isNaN(value) ? undefined : value;
  };
  const out: Snapshot = {};
  const set = (id: ChannelId, value: number | undefined) => {
    if (value !== undefined) out[id] = value;
  };

  set('rpm', v(0x0c));
  set('speed', v(0x0d));
  set('load', v(0x04));
  set('absLoad', v(0x43));
  set('throttle', v(0x11));
  set('pedal', v(0x49));
  set('timing', v(0x0e));
  set('coolant', v(0x05));
  set('oil', v(0x5c));
  set('iat', v(0x0f));
  set('cac', v(0x77));
  set('ambient', v(0x46));
  set('maf', v(0x10));
  const rail = v(0x23);
  set('rail', rail === undefined ? undefined : rail / 100);
  set('stft1', v(0x06));
  set('ltft1', v(0x07));
  set('stft2', v(0x08));
  set('ltft2', v(0x09));
  set('catTemp', v(0x3c));
  set('voltage', v(0x42));
  set('fuelLevel', v(0x2f));
  set('fuelRate', v(0x5e));
  set('runtime', v(0x1f));
  set('odometer', v(0xa6));
  set('clearDistance', v(0x31));
  set('lambdaTarget', v(0x44));

  const baro = v(0x33) ?? previous.baro;
  set('baro', baro);
  const absPressure = v(0x70) ?? v(0x87) ?? v(0x0b);
  set('map', v(0x87) ?? v(0x0b));
  if (absPressure !== undefined) set('boost', (absPressure - (baro ?? STD_BARO)) / 100);
  const target = raw[0x70] ? boostTarget(raw[0x70]) : null;
  if (target !== null) set('boostTarget', (target - (baro ?? STD_BARO)) / 100);

  const lambda = v(0x24) ?? v(0x34);
  set('lambda', lambda);
  if (lambda !== undefined) set('afr', lambda * 14.7);

  const torquePct = v(0x62);
  const reference = v(0x63) ?? referenceTorqueCache;
  if (v(0x63) !== undefined) referenceTorqueCache = v(0x63);
  if (torquePct !== undefined && reference !== undefined) {
    const nm = Math.max(0, (torquePct / 100) * reference);
    set('torque', nm);
    const rpm = out.rpm ?? previous.rpm;
    if (rpm !== undefined) set('power', (nm * rpm) / 9549);
  }

  return out;
}

let referenceTorqueCache: number | undefined;

export function resetChannelCache() {
  referenceTorqueCache = undefined;
}

export function supportedFromBitmask(base: number, bytes: number[]): number[] {
  const out: number[] = [];
  for (let byte = 0; byte < 4; byte++) {
    for (let bit = 0; bit < 8; bit++) {
      if (bytes[byte] & (0x80 >> bit)) out.push(base + byte * 8 + bit + 1);
    }
  }
  return out;
}

export function channelSupported(channel: ChannelDef, supported: Set<number>): boolean {
  if (supported.size === 0) return true;
  switch (channel.id) {
    case 'boost':
      return supported.has(0x0b) || supported.has(0x70) || supported.has(0x87);
    case 'map':
      return supported.has(0x0b) || supported.has(0x87);
    case 'lambda':
    case 'afr':
      return supported.has(0x24) || supported.has(0x34);
    case 'torque':
      return supported.has(0x62) && supported.has(0x63);
    case 'power':
      return supported.has(0x62) && supported.has(0x63) && supported.has(0x0c);
    case 'boostTarget':
      return supported.has(0x70);
    default:
      return channel.pids.every((p) => supported.has(p));
  }
}

export function pidsForChannels(ids: ChannelId[], supported: Set<number>): { pid: number; rate: Rate }[] {
  const out = new Map<number, Rate>();
  const rank: Record<Rate, number> = { fast: 0, medium: 1, slow: 2 };
  const add = (pid: number, rate: Rate) => {
    if (supported.size > 0 && !supported.has(pid)) return;
    const current = out.get(pid);
    if (!current || rank[rate] < rank[current]) out.set(pid, rate);
  };
  for (const id of ids) {
    const channel = CHANNEL_MAP[id];
    if (!channel) continue;
    switch (id) {
      case 'boost':
      case 'map': {
        const manifold = [0x87, 0x0b].find((p) => supported.size === 0 || supported.has(p)) ?? 0x0b;
        add(manifold, 'fast');
        if (id === 'boost') {
          if (supported.has(0x70)) add(0x70, 'fast');
          add(0x33, 'slow');
        }
        break;
      }
      case 'boostTarget':
        add(0x70, 'fast');
        add(0x33, 'slow');
        break;
      case 'lambda':
      case 'afr':
        add(supported.has(0x24) || supported.size === 0 ? 0x24 : 0x34, 'fast');
        break;
      case 'torque':
      case 'power':
        add(0x62, 'fast');
        add(0x63, 'slow');
        if (id === 'power') add(0x0c, 'fast');
        break;
      default:
        channel.pids.forEach((p) => add(p, channel.rate));
    }
  }
  return [...out.entries()].map(([pid, rate]) => ({ pid, rate }));
}
