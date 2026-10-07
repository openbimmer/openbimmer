import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { EngineId } from '@/data/engines';
import { convertChannel } from '@/lib/units';
import { CHANNEL_MAP, type ChannelId } from '@/obd/pids';
import { type Sample, session, useConnection } from '@/obd/session';

import { useSettings } from './settings';

export type LogMeta = {
  id: string;
  name: string;
  startedAt: number;
  duration: number;
  sampleCount: number;
  engineId: EngineId | null;
  channels: ChannelId[];
  peaks: Partial<Record<ChannelId, number>>;
};

export type LogData = {
  version: 1;
  id: string;
  name: string;
  startedAt: number;
  engineId: EngineId | null;
  channels: ChannelId[];
  t: number[];
  values: Partial<Record<ChannelId, (number | null)[]>>;
};

export type RecordResult =
  | { kind: 'saved'; at: number; log: LogMeta }
  | { kind: 'discarded'; at: number }
  | { kind: 'error'; at: number; message: string };

export type RecordingState = {
  recording: boolean;
  recordStartedAt: number | null;
  liveSampleCount: number;
  channels: ChannelId[];
  lastResult: RecordResult | null;
};

export const MAX_RECORDING_SECONDS = 30 * 60;
export const MIN_LOG_SECONDS = 2;
export const MIN_LOG_SAMPLES = 5;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatLogDate(timestamp: number, withWeekday = false) {
  const d = new Date(timestamp);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${withWeekday ? `${WEEKDAYS[d.getDay()]} ` : ''}${day}${year}, ${time}`;
}

export function defaultLogName(timestamp: number) {
  return `Log ${formatLogDate(timestamp)}`;
}

export function logSampleRate(log: Pick<LogMeta, 'duration' | 'sampleCount'>) {
  return log.duration > 0 ? Math.max(0, log.sampleCount - 1) / log.duration : 0;
}

type LogsState = {
  logs: LogMeta[];
  renameLog: (id: string, name: string) => void;
  deleteLog: (id: string) => void;
};

export const useLogs = create<LogsState>()(
  persist(
    (set) => ({
      logs: [],
      renameLog: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((s) => ({ logs: s.logs.map((l) => (l.id === id ? { ...l, name: trimmed.slice(0, 80) } : l)) }));
        if (cache?.id === id) cache = { ...cache, name: trimmed.slice(0, 80) };
      },
      deleteLog: (id) => {
        try {
          const file = logFile(id);
          if (file.exists) file.delete();
        } catch {}
        if (cache?.id === id) cache = null;
        set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }));
      },
    }),
    {
      name: 'openbimmer-logs',
      storage: createJSONStorage(() => ({
        getItem: (key: string) => Storage.getItemSync(key),
        setItem: (key: string, value: string) => Storage.setItemSync(key, value),
        removeItem: (key: string) => {
          Storage.removeItemSync(key);
        },
      })),
      partialize: (s) => ({ logs: s.logs }),
      version: 1,
    },
  ),
);

const useRecorder = create<RecordingState>(() => ({
  recording: false,
  recordStartedAt: null,
  liveSampleCount: 0,
  channels: [],
  lastResult: null,
}));

export function useRecording(): RecordingState;
export function useRecording<T>(selector: (s: RecordingState) => T): T;
export function useRecording<T>(selector?: (s: RecordingState) => T) {
  return useRecorder(selector ?? ((s: RecordingState) => s as unknown as T));
}

export function getRecordingState() {
  return useRecorder.getState();
}

function logsDir() {
  const dir = new Directory(Paths.document, 'logs');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function logFile(id: string) {
  return new File(logsDir(), `${id}.json`);
}

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

type ActiveRecording = {
  id: string;
  startedAt: number;
  origin: number | null;
  engineId: EngineId | null;
  channels: ChannelId[];
  t: number[];
  columns: (number | null)[][];
  last: (number | null)[];
  token: symbol;
  unsubscribe: () => void;
  timer: ReturnType<typeof setTimeout>;
};

let active: ActiveRecording | null = null;
let cache: LogData | null = null;

export function startRecording(): boolean {
  if (active) return true;
  if (useConnection.getState().status !== 'connected') return false;
  const channels = [...new Set(useSettings.getState().logChannels)].filter((id) => !!CHANNEL_MAP[id]);
  if (channels.length === 0) return false;

  const startedAt = Date.now();
  const token = Symbol('recorder');
  const recording: ActiveRecording = {
    id: `${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startedAt,
    origin: null,
    engineId: useSettings.getState().engineId,
    channels,
    t: [],
    columns: channels.map(() => []),
    last: channels.map(() => null),
    token,
    unsubscribe: () => undefined,
    timer: setTimeout(() => {
      void stopRecording();
    }, MAX_RECORDING_SECONDS * 1000),
  };

  const onSample = (sample: Sample) => {
    if (active !== recording) return;
    let fresh = false;
    for (let i = 0; i < channels.length; i++) {
      const value = sample.values[channels[i]];
      if (value !== undefined && Number.isFinite(value)) {
        recording.last[i] = value;
        fresh = true;
      }
    }
    if (!fresh) return;
    if (recording.origin === null) recording.origin = sample.t;
    recording.t.push(round((sample.t - recording.origin) / 1000, 3));
    for (let i = 0; i < channels.length; i++) recording.columns[i].push(recording.last[i]);
    useRecorder.setState({ liveSampleCount: recording.t.length });
    if ((sample.t - recording.startedAt) / 1000 >= MAX_RECORDING_SECONDS) void stopRecording();
  };

  const offSample = session.onSample(onSample);
  const offConnection = useConnection.subscribe((s, prev) => {
    if (prev.status === 'connected' && s.status !== 'connected') void stopRecording();
  });
  recording.unsubscribe = () => {
    offSample();
    offConnection();
  };

  active = recording;
  session.demandChannels(token, channels);
  useRecorder.setState({ recording: true, recordStartedAt: startedAt, liveSampleCount: 0, channels });
  return true;
}

export async function stopRecording(): Promise<RecordResult | null> {
  const recording = active;
  if (!recording) return null;
  active = null;
  clearTimeout(recording.timer);
  recording.unsubscribe();
  session.demandChannels(recording.token, []);

  const finish = (result: RecordResult) => {
    useRecorder.setState({ recording: false, recordStartedAt: null, liveSampleCount: 0, lastResult: result });
    return result;
  };

  const { t, channels, columns } = recording;
  const duration = t.length > 0 ? t[t.length - 1] : 0;
  if (t.length < MIN_LOG_SAMPLES || duration < MIN_LOG_SECONDS) {
    return finish({ kind: 'discarded', at: Date.now() });
  }

  const values: LogData['values'] = {};
  const peaks: LogMeta['peaks'] = {};
  const kept: ChannelId[] = [];
  channels.forEach((id, i) => {
    let peak = -Infinity;
    const column = columns[i].map((v) => {
      if (v === null) return null;
      if (v > peak) peak = v;
      return round(v, 4);
    });
    if (peak === -Infinity) return;
    kept.push(id);
    values[id] = column;
    peaks[id] = peak;
  });

  if (kept.length === 0) return finish({ kind: 'discarded', at: Date.now() });

  const name = defaultLogName(recording.startedAt);
  const data: LogData = {
    version: 1,
    id: recording.id,
    name,
    startedAt: recording.startedAt,
    engineId: recording.engineId,
    channels: kept,
    t,
    values,
  };
  const meta: LogMeta = {
    id: recording.id,
    name,
    startedAt: recording.startedAt,
    duration,
    sampleCount: t.length,
    engineId: recording.engineId,
    channels: kept,
    peaks,
  };

  try {
    logFile(recording.id).write(JSON.stringify(data));
  } catch (error) {
    return finish({
      kind: 'error',
      at: Date.now(),
      message: `The log could not be saved. ${error instanceof Error ? error.message : ''}`.trim(),
    });
  }
  cache = data;
  useLogs.setState((s) => ({ logs: [meta, ...s.logs.filter((l) => l.id !== meta.id)] }));
  return finish({ kind: 'saved', at: Date.now(), log: meta });
}

export async function loadLog(id: string): Promise<LogData> {
  const meta = useLogs.getState().logs.find((l) => l.id === id);
  if (cache?.id === id) return meta ? { ...cache, name: meta.name } : cache;
  const file = logFile(id);
  if (!file.exists) throw new Error('The log file is missing. It may have been removed when the app data was cleared.');
  let parsed: LogData;
  try {
    parsed = JSON.parse(await file.text()) as LogData;
  } catch {
    throw new Error('The log file is damaged and cannot be opened.');
  }
  if (!parsed || !Array.isArray(parsed.t) || !Array.isArray(parsed.channels) || typeof parsed.values !== 'object') {
    throw new Error('The log file is damaged and cannot be opened.');
  }
  const channels = parsed.channels.filter((c) => !!CHANNEL_MAP[c] && Array.isArray(parsed.values[c]));
  const data: LogData = { ...parsed, channels, name: meta?.name ?? parsed.name };
  cache = data;
  return data;
}

export function deleteLog(id: string) {
  useLogs.getState().deleteLog(id);
}

export function renameLog(id: string, name: string) {
  useLogs.getState().renameLog(id, name);
}

const csvCell = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

export function buildCsv(data: LogData) {
  const units = useSettings.getState().units;
  const columns = data.channels.map((id) => {
    const def = CHANNEL_MAP[id];
    const unit = convertChannel(def, 0, units).unit;
    return { id, def, header: unit ? `${def.label} (${unit})` : def.label, values: data.values[id] ?? [] };
  });
  const lines = [['Time (s)', ...columns.map((c) => c.header)].map(csvCell).join(',')];
  for (let i = 0; i < data.t.length; i++) {
    const row = [data.t[i].toFixed(3)];
    for (const c of columns) {
      const raw = c.values[i];
      if (raw === null || raw === undefined) {
        row.push('');
        continue;
      }
      const converted = convertChannel(c.def, raw, units);
      row.push(converted.value.toFixed(Math.min(3, converted.decimals + 1)));
    }
    lines.push(row.join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export async function exportCsv(id: string): Promise<void> {
  const data = await loadLog(id);
  if (data.t.length === 0) throw new Error('This log has no samples to export.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const slug = data.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || data.id;
  const file = new File(Paths.cache, `OpenBimmer-${slug}.csv`);
  if (file.exists) file.delete();
  file.write(buildCsv(data));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: data.name,
  });
}
