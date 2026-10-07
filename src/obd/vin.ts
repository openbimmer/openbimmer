export type VinInfo = {
  vin: string;
  wmi: string;
  manufacturer: string;
  modelYear: number | null;
  plant: string;
  serial: string;
  isBmw: boolean;
};

const WMI: Record<string, string> = {
  WBA: 'BMW AG',
  WBS: 'BMW M GmbH',
  WBY: 'BMW i',
  WBX: 'BMW AG',
  '4US': 'BMW Manufacturing (USA)',
  '5UX': 'BMW Manufacturing (USA)',
  '5UJ': 'BMW Manufacturing (USA)',
  '5YM': 'BMW M (USA)',
  WMW: 'MINI',
};

const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function modelYear(code: string): number | null {
  const index = YEAR_CODES.indexOf(code);
  if (index === -1) return null;
  const base = 1980 + index;
  const limit = new Date().getFullYear() + 1;
  let year = base;
  while (year + 30 <= limit) year += 30;
  return year;
}

export function decodeVin(raw: string): VinInfo | null {
  const vin = raw.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
  const wmi = vin.slice(0, 3);
  const manufacturer = WMI[wmi] ?? 'Unknown manufacturer';
  return {
    vin,
    wmi,
    manufacturer,
    modelYear: modelYear(vin[9]),
    plant: vin[10],
    serial: vin.slice(11),
    isBmw: wmi in WMI,
  };
}
