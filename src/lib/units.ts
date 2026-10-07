import type { ChannelDef, Quantity } from '@/obd/pids';

export type Units = {
  speed: 'kmh' | 'mph';
  temperature: 'c' | 'f';
  pressure: 'bar' | 'psi' | 'kpa';
  torque: 'nm' | 'lbft';
  power: 'ps' | 'hp' | 'kw';
};

export const DEFAULT_UNITS: Units = { speed: 'kmh', temperature: 'c', pressure: 'bar', torque: 'nm', power: 'ps' };

export type Converted = { value: number; unit: string; decimals: number };

export function convert(value: number, quantity: Quantity, units: Units, decimals?: number): Converted {
  switch (quantity) {
    case 'speed':
      return units.speed === 'mph'
        ? { value: value * 0.621371, unit: 'mph', decimals: decimals ?? 0 }
        : { value, unit: 'km/h', decimals: decimals ?? 0 };
    case 'temperature':
      return units.temperature === 'f'
        ? { value: value * 1.8 + 32, unit: '°F', decimals: decimals ?? 0 }
        : { value, unit: '°C', decimals: decimals ?? 0 };
    case 'pressure':
      if (units.pressure === 'psi') return { value: value * 14.5038, unit: 'psi', decimals: decimals === undefined ? 1 : Math.max(0, decimals - 1) };
      if (units.pressure === 'kpa') return { value: value * 100, unit: 'kPa', decimals: 0 };
      return { value, unit: 'bar', decimals: decimals ?? 2 };
    case 'pressureAbs':
      if (units.pressure === 'psi') return { value: value * 0.145038, unit: 'psia', decimals: 1 };
      if (units.pressure === 'bar') return { value: value / 100, unit: 'bar', decimals: 2 };
      return { value, unit: 'kPa', decimals: 0 };
    case 'torque':
      return units.torque === 'lbft'
        ? { value: value * 0.737562, unit: 'lb-ft', decimals: 0 }
        : { value, unit: 'Nm', decimals: 0 };
    case 'power':
      if (units.power === 'hp') return { value: value * 1.34102, unit: 'hp', decimals: 0 };
      if (units.power === 'kw') return { value, unit: 'kW', decimals: 0 };
      return { value: value * 1.35962, unit: 'PS', decimals: 0 };
    case 'distance':
      return units.speed === 'mph'
        ? { value: value * 0.621371, unit: 'mi', decimals: 0 }
        : { value, unit: 'km', decimals: 0 };
    case 'rpm':
      return { value, unit: 'rpm', decimals: 0 };
    case 'percent':
      return { value, unit: '%', decimals: decimals ?? 0 };
    case 'angle':
      return { value, unit: '°', decimals: decimals ?? 1 };
    case 'voltage':
      return { value, unit: 'V', decimals: decimals ?? 1 };
    case 'massFlow':
      return { value, unit: 'g/s', decimals: decimals ?? 1 };
    case 'lambda':
      return { value, unit: 'λ', decimals: decimals ?? 2 };
    case 'afr':
      return { value, unit: ':1', decimals: decimals ?? 1 };
    case 'fuelRate':
      return units.speed === 'mph'
        ? { value: value * 0.264172, unit: 'gal/h', decimals: 1 }
        : { value, unit: 'L/h', decimals: decimals ?? 1 };
    case 'duration':
      return { value, unit: 's', decimals: 0 };
    default:
      return { value, unit: '', decimals: decimals ?? 0 };
  }
}

export function convertChannel(channel: ChannelDef, value: number, units: Units): Converted {
  return convert(value, channel.quantity, units, channel.decimals);
}

export function formatNumber(value: number, decimals: number) {
  if (!Number.isFinite(value)) return '–';
  const fixed = value.toFixed(decimals);
  return fixed === '-0' || /^-0\.0+$/.test(fixed) ? fixed.slice(1) : fixed;
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function channelRange(channel: ChannelDef, units: Units): [number, number] {
  const [lo, hi] = channel.range;
  return [convertChannel(channel, lo, units).value, convertChannel(channel, hi, units).value];
}
