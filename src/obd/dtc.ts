import type { Message } from './frames';

export type DtcKind = 'stored' | 'pending' | 'permanent';

export type Dtc = { code: string; kind: DtcKind; ecu: string };

const LETTERS = ['P', 'C', 'B', 'U'];

export function decodeDtc(a: number, b: number): string {
  const letter = LETTERS[a >> 6];
  const d1 = (a >> 4) & 0x03;
  const d2 = a & 0x0f;
  return `${letter}${d1}${d2.toString(16).toUpperCase()}${b.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function parseDtcMessages(messages: Message[], service: number, kind: DtcKind, can: boolean): Dtc[] {
  const reply = service + 0x40;
  const out: Dtc[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (message.data[0] !== reply) continue;
    const payload = can ? message.data.slice(2) : message.data.slice(1);
    for (let i = 0; i + 1 < payload.length; i += 2) {
      const a = payload[i];
      const b = payload[i + 1];
      if (a === 0 && b === 0) continue;
      const code = decodeDtc(a, b);
      const key = `${message.ecu}:${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ code, kind, ecu: message.ecu });
    }
  }
  return out;
}

export type Monitor = { key: string; label: string; available: boolean; complete: boolean };

export type Readiness = {
  milOn: boolean;
  dtcCount: number;
  compression: boolean;
  monitors: Monitor[];
};

const SPARK_MONITORS: [number, string, string][] = [
  [0, 'catalyst', 'Catalyst'],
  [1, 'heatedCatalyst', 'Heated catalyst'],
  [2, 'evap', 'Evaporative system'],
  [3, 'secondaryAir', 'Secondary air system'],
  [5, 'o2', 'Oxygen sensor'],
  [6, 'o2Heater', 'Oxygen sensor heater'],
  [7, 'egr', 'EGR / VVT system'],
];

export function parseReadiness(d: number[]): Readiness {
  const [a, b, c, dd] = d;
  const compression = (b & 0x08) !== 0;
  const monitors: Monitor[] = [
    { key: 'misfire', label: 'Misfire', available: (b & 0x01) !== 0, complete: (b & 0x10) === 0 },
    { key: 'fuel', label: 'Fuel system', available: (b & 0x02) !== 0, complete: (b & 0x20) === 0 },
    { key: 'components', label: 'Comprehensive components', available: (b & 0x04) !== 0, complete: (b & 0x40) === 0 },
  ];
  if (!compression) {
    for (const [bit, key, label] of SPARK_MONITORS) {
      monitors.push({ key, label, available: (c & (1 << bit)) !== 0, complete: (dd & (1 << bit)) === 0 });
    }
  }
  return { milOn: (a & 0x80) !== 0, dtcCount: a & 0x7f, compression, monitors };
}

export function dtcSystem(code: string): string {
  switch (code[0]) {
    case 'P':
      return 'Powertrain';
    case 'C':
      return 'Chassis';
    case 'B':
      return 'Body';
    default:
      return 'Network';
  }
}

export function isManufacturerSpecific(code: string): boolean {
  const d1 = code[1];
  if (code[0] === 'P') {
    if (d1 === '1') return true;
    if (d1 === '3') return ['0', '1', '2', '3'].includes(code[2]);
    return false;
  }
  return d1 === '1' || d1 === '2';
}
