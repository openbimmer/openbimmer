import { useEffect } from 'react';
import { create } from 'zustand';

import type { EngineProfile } from '@/data/engines';

import { BleTransport } from './ble-transport';
import { DemoTransport } from './demo-transport';
import { type Dtc, parseDtcMessages, parseReadiness, type Readiness } from './dtc';
import { type CommandLog, Elm327, ElmError } from './elm327';
import { type FrameFormat, parseMessages, pickMessage } from './frames';
import {
  type ChannelId,
  computeChannels,
  decodeMode01,
  pidsForChannels,
  type RawValues,
  resetChannelCache,
  type Snapshot,
  supportedFromBitmask,
} from './pids';
import { decodeVin } from './vin';

export type ConnectionStatus = 'idle' | 'connecting' | 'initializing' | 'connected' | 'error';

export type AdapterInfo = {
  id: string;
  name: string;
  kind: 'ble' | 'demo';
  version: string;
  protocol: string;
  protocolName: string;
};

type ConnectionState = {
  status: ConnectionStatus;
  step: string;
  error: string | null;
  adapter: AdapterInfo | null;
  vin: string | null;
  supported: number[];
  batteryVoltage: number | null;
  values: Snapshot;
  updatedAt: number;
  hz: number;
};

const initial: ConnectionState = {
  status: 'idle',
  step: '',
  error: null,
  adapter: null,
  vin: null,
  supported: [],
  batteryVoltage: null,
  values: {},
  updatedAt: 0,
  hz: 0,
};

export const useConnection = create<ConnectionState>(() => initial);

export type Sample = { t: number; values: Snapshot };
type SampleListener = (sample: Sample) => void;

const PROTOCOLS: Record<string, string> = {
  '1': 'SAE J1850 PWM',
  '2': 'SAE J1850 VPW',
  '3': 'ISO 9141-2',
  '4': 'ISO 14230-4 KWP (5 baud)',
  '5': 'ISO 14230-4 KWP (fast)',
  '6': 'ISO 15765-4 CAN 11 bit 500k',
  '7': 'ISO 15765-4 CAN 29 bit 500k',
  '8': 'ISO 15765-4 CAN 11 bit 250k',
  '9': 'ISO 15765-4 CAN 29 bit 250k',
  A: 'SAE J1939 CAN',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

class Session {
  private elm: Elm327 | null = null;
  private format: FrameFormat = 'can11';
  private supported = new Set<number>();
  private demand = new Map<symbol, ChannelId[]>();
  private listeners = new Set<SampleListener>();
  private running = false;
  private multiPid = true;
  private failures = new Map<number, number>();
  private blocked = new Map<number, number>();
  private echo = false;
  private protocol: string | null = null;
  private silentCycles = 0;
  private multiStrikes = 0;
  private multiRetryAt = 0;
  private lastRead = new Map<number, number>();
  private exclusive = 0;
  private generation = 0;
  private consoleBuffer: CommandLog[] = [];

  get connected() {
    return useConnection.getState().status === 'connected' && !!this.elm;
  }

  async connectBle(id: string, name: string) {
    await this.connect(async () => BleTransport.connect(id, name), id);
  }

  async connectDemo(engine: EngineProfile) {
    await this.connect(async () => new DemoTransport(engine), 'demo');
  }

  private async connect(open: () => Promise<import('./transport').Transport>, id: string) {
    await this.disconnect();
    const generation = ++this.generation;
    useConnection.setState({ ...initial, status: 'connecting', step: 'Connecting to adapter' });
    try {
      const transport = await open();
      if (generation !== this.generation) {
        await transport.close();
        return;
      }
      const elm = new Elm327(transport);
      this.elm = elm;
      this.consoleBuffer = [];
      elm.setLogListener((entry) => {
        this.consoleBuffer.push(entry);
        if (this.consoleBuffer.length > 300) this.consoleBuffer.splice(0, this.consoleBuffer.length - 300);
      });
      transport.onClose((reason) => {
        if (generation !== this.generation) return;
        this.running = false;
        this.elm = null;
        useConnection.setState({
          status: reason === 'closed' ? 'idle' : 'error',
          error: reason === 'closed' ? null : 'The adapter disconnected. Check that it is plugged in and the ignition is on.',
          hz: 0,
        });
      });
      useConnection.setState({ status: 'initializing', step: 'Waking up ELM327' });
      const adapter = await this.initialize(elm, id, generation);
      if (generation !== this.generation) return;
      useConnection.setState({ status: 'connected', step: '', adapter });
      this.startPolling(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      const elm = this.elm;
      this.elm = null;
      await elm?.close().catch(() => undefined);
      useConnection.setState({ status: 'error', error: describeError(error), step: '' });
    }
  }

  private async initialize(elm: Elm327, id: string, generation: number): Promise<AdapterInfo> {
    const step = (s: string) => {
      if (generation === this.generation) useConnection.setState({ step: s });
    };
    let reset: string[] = [];
    for (let attempt = 0; attempt < 2 && reset.length === 0; attempt++) {
      reset = await elm.send('ATZ', 3500).catch(() => []);
    }
    const version = reset.map((l) => /ELM327\s*v?([\d.]+\w*)/i.exec(l)?.[0]).find(Boolean) ?? 'ELM327';
    await elm.send('ATE1', 1500).catch(() => undefined);
    elm.setEchoMatching(true);
    this.echo = await elm
      .send('ATI', 1500)
      .then(() => true)
      .catch(() => false);
    if (!this.echo) {
      elm.setEchoMatching(false);
      await elm.send('ATE0', 1500).catch(() => undefined);
    }
    for (const cmd of ['ATL0', 'ATS0', 'ATH1', 'ATCAF1']) await elm.send(cmd, 1500).catch(() => undefined);
    await elm.send('ATAT1', 1000).catch(() => undefined);
    await elm.send('ATSP0', 1500).catch(() => undefined);

    step('Searching for the engine computer');
    let first: string[];
    try {
      first = await elm.send('0100', 15000);
    } catch (error) {
      if (error instanceof ElmError && (error.code === 'unable-to-connect' || error.code === 'no-data')) {
        throw new Error('The car does not answer. Switch the ignition on (engine running or Start button pressed twice) and try again.');
      }
      throw error;
    }
    const dpn = (await elm.send('ATDPN', 1500).catch(() => ['A6']))[0] ?? 'A6';
    const protocol = dpn.replace(/^A/i, '').trim().toUpperCase().slice(-1);
    this.format = protocol === '6' || protocol === '8' ? 'can11' : protocol === '7' || protocol === '9' ? 'can29' : 'plain';
    this.protocol = /^[1-9A-C]$/.test(protocol) ? protocol : null;
    if (this.protocol) await elm.send(`ATSP${this.protocol}`, 1500).catch(() => undefined);
    if (this.format === 'plain') {
      await elm.send('ATH0', 1000).catch(() => undefined);
      first = await elm.send('0100', 5000).catch(() => first);
    }

    step('Reading supported sensors');
    const supported = new Set<number>();
    const readMask = (lines: string[], base: number) => {
      const message = pickMessage(parseMessages(lines, this.format), 0x01);
      if (!message || message.data[1] !== base) return false;
      supportedFromBitmask(base, message.data.slice(2, 6)).forEach((p) => supported.add(p));
      return supported.has(base + 0x20);
    };
    let more = readMask(first, 0x00);
    if (this.format === 'can11') await elm.send('ATSH7E0', 1000).catch(() => undefined);
    for (let base = 0x20; more && base <= 0xa0; base += 0x20) {
      const lines = await elm.send(`01${hex2(base)}`, 3000).catch(() => [] as string[]);
      more = readMask(lines, base);
    }
    this.supported = supported;

    step('Reading VIN');
    let vin: string | null = null;
    try {
      const lines = await elm.send('0902', 4000);
      vin = extractVin(parseMessages(lines, this.format));
    } catch {
      vin = null;
    }
    const voltage = await this.readVoltage(elm);

    useConnection.setState({
      supported: [...supported].sort((a, b) => a - b),
      vin,
      batteryVoltage: voltage,
    });
    return {
      id,
      name: elm.name,
      kind: elm.kind,
      version,
      protocol,
      protocolName: PROTOCOLS[protocol] ?? `Protocol ${protocol}`,
    };
  }

  private async readVoltage(elm: Elm327) {
    const rv = await elm.send('ATRV', 1500).catch(() => [] as string[]);
    const value = parseFloat((rv[0] ?? '').replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : null;
  }

  async disconnect() {
    this.generation++;
    this.running = false;
    const elm = this.elm;
    this.elm = null;
    this.supported = new Set();
    this.failures.clear();
    this.blocked.clear();
    this.lastRead.clear();
    this.multiPid = true;
    this.multiStrikes = 0;
    this.multiRetryAt = 0;
    this.silentCycles = 0;
    this.protocol = null;
    this.echo = false;
    resetChannelCache();
    if (elm) await elm.close().catch(() => undefined);
    useConnection.setState({ ...initial });
  }

  demandChannels(key: symbol, ids: ChannelId[]) {
    if (ids.length === 0) this.demand.delete(key);
    else this.demand.set(key, ids);
  }

  onSample(listener: SampleListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  consoleLog() {
    return [...this.consoleBuffer];
  }

  async withAdapter<T>(task: (elm: Elm327, format: FrameFormat) => Promise<T>): Promise<T> {
    const elm = this.elm;
    if (!elm) throw new Error('No adapter connected');
    this.exclusive++;
    try {
      await sleep(30);
      return await task(elm, this.format);
    } finally {
      this.exclusive--;
    }
  }

  async readDtcs(): Promise<Dtc[]> {
    return this.withAdapter(async (elm, format) => {
      const can = format !== 'plain';
      const out: Dtc[] = [];
      const read = async (service: number, kind: Dtc['kind']) => {
        try {
          const lines = await elm.send(hex2(service), 6000);
          out.push(...parseDtcMessages(parseMessages(lines, format), service, kind, can));
        } catch (error) {
          if (error instanceof ElmError && error.code === 'no-data') return;
          if (error instanceof ElmError && error.code === 'unknown-command' && service === 0x0a) return;
          throw error;
        }
      };
      await this.functional(elm, format, async () => {
        await read(0x03, 'stored');
        await read(0x07, 'pending');
        await read(0x0a, 'permanent');
      });
      return out;
    });
  }

  private async functional(elm: Elm327, format: FrameFormat, task: () => Promise<void>) {
    if (format !== 'can11') return task();
    await elm.send('ATSH7DF', 1000).catch(() => undefined);
    try {
      await task();
    } finally {
      await elm.send('ATSH7E0', 1000).catch(() => undefined);
    }
  }

  async clearDtcs(): Promise<void> {
    await this.withAdapter(async (elm, format) => {
      let lines: string[] = [];
      await this.functional(elm, format, async () => {
        lines = await elm.send('04', 8000);
      });
      const message = pickMessage(parseMessages(lines, format), 0x04);
      if (!message) throw new Error('The engine computer refused to clear the codes. Switch the engine off, keep the ignition on, and try again.');
    });
  }

  async readReadiness(): Promise<Readiness | null> {
    return this.withAdapter(async (elm, format) => {
      try {
        const lines = await elm.send('0101', 3000);
        const message = pickMessage(parseMessages(lines, format), 0x01);
        if (!message || message.data[1] !== 0x01) return null;
        return parseReadiness(message.data.slice(2, 6));
      } catch {
        return null;
      }
    });
  }

  async refreshVoltage() {
    if (!this.elm) return;
    const voltage = await this.withAdapter((elm) => this.readVoltage(elm));
    useConnection.setState({ batteryVoltage: voltage });
  }

  private wantedPids(now: number) {
    const ids = new Set<ChannelId>();
    this.demand.forEach((list) => list.forEach((id) => ids.add(id)));
    return pidsForChannels([...ids], this.supported).filter((p) => (this.blocked.get(p.pid) ?? 0) <= now);
  }

  private async requestPids(elm: Elm327, pids: number[]): Promise<RawValues> {
    const lines = await elm.send(`01${pids.map(hex2).join('')}`, 1500);
    const message = pickMessage(parseMessages(lines, this.format), 0x01);
    return message ? decodeMode01(message.data) : {};
  }

  private async reapplySettings(elm: Elm327) {
    const commands = [
      this.echo ? 'ATE1' : 'ATE0',
      'ATL0',
      'ATS0',
      this.format === 'plain' ? 'ATH0' : 'ATH1',
      'ATCAF1',
      this.protocol ? `ATSP${this.protocol}` : null,
      this.format === 'can11' ? 'ATSH7E0' : null,
    ];
    if (this.echo) elm.setEchoMatching(false);
    for (const cmd of commands) if (cmd) await elm.send(cmd, 1200).catch(() => undefined);
    if (this.echo) elm.setEchoMatching(true);
  }

  private async startPolling(generation: number) {
    this.running = true;
    let previous: Snapshot = {};
    let lastSampleAt = Date.now();
    const window: number[] = [];
    const interval = { fast: 0, medium: 400, slow: 2000 };
    while (this.running && generation === this.generation) {
      const elm = this.elm;
      if (!elm) break;
      if (this.exclusive > 0) {
        await sleep(50);
        continue;
      }
      const now = Date.now();
      if (now - lastSampleAt > 2500 && Object.keys(useConnection.getState().values).length > 0) {
        previous = {};
        window.length = 0;
        useConnection.setState({ values: {}, hz: 0 });
      }
      const wanted = this.wantedPids(now);
      if (wanted.length === 0) {
        await sleep(200);
        continue;
      }
      const due = wanted.filter((p) => now - (this.lastRead.get(p.pid) ?? 0) >= interval[p.rate]).map((p) => p.pid);
      if (due.length === 0) {
        await sleep(20);
        continue;
      }
      if (!this.multiPid && this.multiRetryAt > 0 && now >= this.multiRetryAt) {
        this.multiPid = true;
        this.multiStrikes = 0;
        this.multiRetryAt = 0;
      }
      const raw: RawValues = {};
      const failed: number[] = [];
      const size = this.multiPid && this.format !== 'plain' ? 6 : 1;
      for (let i = 0; i < due.length; i += size) {
        if (!this.running || generation !== this.generation || this.exclusive > 0) break;
        const batch = due.slice(i, i + size);
        let decoded: RawValues = {};
        try {
          decoded = await this.requestPids(elm, batch);
        } catch (error) {
          if (error instanceof ElmError && error.code === 'closed') return;
        }
        if (batch.length > 1 && batch.every((p) => !decoded[p])) {
          let single = false;
          for (const pid of batch) {
            const one = await this.requestPids(elm, [pid]).catch(() => ({}) as RawValues);
            if (one[pid]) {
              decoded[pid] = one[pid];
              single = true;
            }
          }
          if (single && ++this.multiStrikes >= 3) {
            this.multiPid = false;
            this.multiRetryAt = now + 30000;
          }
        }
        Object.assign(raw, decoded);
        for (const pid of batch) {
          if (decoded[pid]) {
            this.failures.delete(pid);
            this.lastRead.set(pid, now);
          } else failed.push(pid);
        }
      }
      if (Object.keys(raw).length === 0) {
        this.silentCycles++;
        if (this.silentCycles % 6 === 0) await this.reapplySettings(elm);
        await sleep(150);
        continue;
      }
      this.silentCycles = 0;
      failed.forEach((pid) => this.markFailure(pid, now));
      const computed = computeChannels(raw, previous);
      if (Object.keys(computed).length === 0) continue;
      previous = { ...previous, ...computed };
      const t = Date.now();
      lastSampleAt = t;
      window.push(t);
      while (window.length > 0 && t - window[0] > 2000) window.shift();
      useConnection.setState({ values: previous, updatedAt: t, hz: window.length / 2 });
      const sample = { t, values: computed };
      this.listeners.forEach((l) => l(sample));
    }
  }

  private markFailure(pid: number, now: number) {
    const count = (this.failures.get(pid) ?? 0) + 1;
    this.failures.set(pid, count);
    if (count >= 4) {
      this.failures.delete(pid);
      this.blocked.set(pid, now + 30000);
    }
  }
}

function extractVin(messages: import('./frames').Message[]): string | null {
  const parts = messages.filter((m) => m.data[0] === 0x49 && m.data[1] === 0x02);
  if (parts.length === 0) return null;
  let chars: number[] = [];
  if (parts.length === 1) chars = parts[0].data.slice(3);
  else chars = parts.flatMap((p) => p.data.slice(3));
  const text = String.fromCharCode(...chars.filter((c) => c >= 0x30 && c <= 0x5a));
  const vin = text.slice(-17);
  return decodeVin(vin) ? vin : null;
}

function describeError(error: unknown): string {
  if (error instanceof ElmError) {
    switch (error.code) {
      case 'timeout':
        return 'The adapter stopped answering. Unplug it for a few seconds and try again.';
      case 'closed':
        return 'The adapter disconnected during setup.';
      case 'bus-error':
        return 'The adapter reports a CAN bus error. Check that it sits firmly in the OBD port.';
      default:
        return error.message;
    }
  }
  if (error instanceof Error) {
    if (/cancel/i.test(error.message)) return 'Connection cancelled.';
    if (/timed? ?out/i.test(error.message)) return 'The adapter did not respond. Make sure it is powered and in range.';
    return error.message;
  }
  return String(error);
}

export const session = new Session();

export function useChannelDemand(ids: ChannelId[], enabled = true) {
  const key = ids.join(',');
  useEffect(() => {
    if (!enabled) return;
    const token = Symbol(key);
    session.demandChannels(token, key ? (key.split(',') as ChannelId[]) : []);
    return () => session.demandChannels(token, []);
  }, [key, enabled]);
}

export function useChannel(id: ChannelId) {
  return useConnection((s) => s.values[id]);
}
