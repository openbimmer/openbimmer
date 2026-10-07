import type { EngineProfile } from '@/data/engines';

import { type Transport, TransportEmitter } from './transport';

const SUPPORTED = [
  0x01, 0x04, 0x05, 0x06, 0x07, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x1f, 0x23, 0x24, 0x2f, 0x31, 0x33, 0x3c,
  0x42, 0x43, 0x44, 0x45, 0x46, 0x49, 0x4c, 0x5c, 0x62, 0x63, 0x70,
];

const DEMO_VIN = 'WBADEMV1NL0000001';

type Phase = { until: number; kind: 'idle' | 'pull' | 'shift' | 'lift' | 'cruise' | 'decel'; gear: number };

const CYCLE: Phase[] = [
  { until: 6, kind: 'idle', gear: 1 },
  { until: 8.3, kind: 'pull', gear: 1 },
  { until: 8.6, kind: 'shift', gear: 2 },
  { until: 11.6, kind: 'pull', gear: 2 },
  { until: 11.9, kind: 'shift', gear: 3 },
  { until: 16.6, kind: 'pull', gear: 3 },
  { until: 17, kind: 'shift', gear: 4 },
  { until: 23, kind: 'lift', gear: 4 },
  { until: 30, kind: 'cruise', gear: 4 },
  { until: 38, kind: 'decel', gear: 4 },
  { until: 42, kind: 'idle', gear: 1 },
];
const CRUISE_KMH = 120;
const CYCLE_LENGTH = CYCLE[CYCLE.length - 1].until;
const RATIOS = [0, 4.11, 2.32, 1.54, 1.18, 1.0, 0.85];
const KMH_PER_RPM_TOP = 0.0412;

export class DemoTransport implements Transport {
  readonly kind = 'demo' as const;
  readonly name = 'Demo adapter';
  private emitter = new TransportEmitter();
  private echo = true;
  private headers = false;
  private spaces = true;
  private started = Date.now();
  private stored = ['P0128'];
  private pending = ['P0302'];
  private warmup = 0;
  private open = true;

  constructor(private engine: EngineProfile) {}

  onData(listener: (chunk: string) => void) {
    return this.emitter.onData(listener);
  }

  onClose(listener: (reason?: string) => void) {
    return this.emitter.onClose(listener);
  }

  async close() {
    this.open = false;
    this.emitter.emitClose('closed');
  }

  async write(data: string) {
    if (!this.open) throw new Error('Demo adapter closed');
    const command = data.replace(/[\r\n]/g, '').replace(/\s/g, '').toUpperCase();
    const reply = this.handle(command);
    const text = `${this.echo ? `${command}\r` : ''}${reply.join('\r')}\r\r>`;
    const delay = command.startsWith('AT') ? 8 : 22 + Math.random() * 18;
    setTimeout(() => {
      if (!this.open) return;
      for (let i = 0; i < text.length; i += 20) this.emitter.emitData(text.slice(i, i + 20));
    }, delay);
  }

  private handle(cmd: string): string[] {
    if (cmd === '') return [];
    if (cmd.startsWith('AT')) return this.handleAt(cmd.slice(2));
    const bytes = cmd.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) ?? [];
    const service = bytes[0];
    switch (service) {
      case 0x01:
        return this.mode01(bytes.slice(1));
      case 0x03:
        return this.dtcReply(0x43, this.stored);
      case 0x07:
        return this.dtcReply(0x47, this.pending);
      case 0x0a:
        return this.dtcReply(0x4a, []);
      case 0x04:
        this.stored = [];
        this.pending = [];
        this.warmup = 0;
        return this.frames([0x44]);
      case 0x09:
        if (bytes[1] === 0x02) return this.frames([0x49, 0x02, 0x01, ...[...DEMO_VIN].map((c) => c.charCodeAt(0))]);
        if (bytes[1] === 0x00) return this.frames([0x49, 0x00, 0x54, 0x40, 0x00, 0x00]);
        return ['NO DATA'];
      default:
        return ['NO DATA'];
    }
  }

  private handleAt(cmd: string): string[] {
    if (cmd === 'Z' || cmd === 'WS') {
      this.echo = true;
      this.headers = false;
      this.spaces = true;
      return ['', 'ELM327 v2.2'];
    }
    if (cmd === 'I') return ['ELM327 v2.2'];
    if (cmd === '@1') return ['OpenBimmer demo adapter'];
    if (cmd === 'DPN') return ['A6'];
    if (cmd === 'DP') return ['AUTO, ISO 15765-4 (CAN 11/500)'];
    if (cmd === 'RV') return [`${(14.1 + Math.sin(this.time() / 3) * 0.15).toFixed(1)}V`];
    if (cmd.startsWith('E')) this.echo = cmd === 'E1';
    if (cmd.startsWith('H')) this.headers = cmd === 'H1';
    if (cmd.startsWith('S') && cmd.length === 2) this.spaces = cmd === 'S1';
    return ['OK'];
  }

  private time() {
    return (Date.now() - this.started) / 1000;
  }

  private mode01(pids: number[]): string[] {
    const out = [0x41];
    const state = this.state();
    for (const pid of pids) {
      if (pid % 0x20 === 0) {
        out.push(pid, ...this.bitmask(pid));
        continue;
      }
      if (!SUPPORTED.includes(pid)) continue;
      const value = this.encode(pid, state);
      if (value) out.push(pid, ...value);
    }
    if (out.length === 1) return ['NO DATA'];
    return this.frames(out);
  }

  private bitmask(base: number): number[] {
    const out = [0, 0, 0, 0];
    for (const pid of SUPPORTED) {
      if (pid <= base || pid > base + 0x20) continue;
      const index = pid - base - 1;
      out[index >> 3] |= 0x80 >> (index & 7);
    }
    if (SUPPORTED.some((p) => p > base + 0x20)) out[3] |= 0x01;
    return out;
  }

  private state() {
    const t = this.time();
    const tc = t % CYCLE_LENGTH;
    const index = CYCLE.findIndex((p) => tc < p.until);
    const phase = CYCLE[index];
    const start = index === 0 ? 0 : CYCLE[index - 1].until;
    const progress = (tc - start) / (phase.until - start);
    const redline = this.engine.redline - 200;
    const jitter = (amp: number) => (Math.random() - 0.5) * amp;
    const rpmAt = (kmh: number, g: number) => (kmh * RATIOS[g]) / KMH_PER_RPM_TOP;
    const topOf = (g: number) => (redline * KMH_PER_RPM_TOP) / RATIOS[g];
    let rpm = 780;
    let speed = 0;
    let throttle = 14;
    let load = 22;
    if (phase.kind === 'pull') {
      const from = phase.gear === 1 ? 1400 : rpmAt(topOf(phase.gear - 1), phase.gear);
      rpm = from + (redline - from) * Math.pow(progress, phase.gear === 1 ? 1.05 : 0.9);
      speed = phase.gear === 1 && rpm < 2200 ? ((rpm - 1400) / 800) * ((2200 * KMH_PER_RPM_TOP) / RATIOS[1]) : (rpm * KMH_PER_RPM_TOP) / RATIOS[phase.gear];
      throttle = 99;
      load = 92;
    } else if (phase.kind === 'shift') {
      speed = topOf(phase.gear - 1) - progress * 1.5;
      rpm = redline - (redline - rpmAt(speed, phase.gear)) * progress;
      throttle = 20;
      load = 30;
    } else if (phase.kind === 'lift') {
      speed = topOf(3) - 1.5 - (topOf(3) - 1.5 - CRUISE_KMH) * progress;
      rpm = rpmAt(speed, 4);
      throttle = 0;
      load = 10;
    } else if (phase.kind === 'cruise') {
      speed = CRUISE_KMH + Math.sin(tc) * 0.6;
      rpm = rpmAt(speed, 4);
      throttle = 22;
      load = 34;
    } else if (phase.kind === 'decel') {
      speed = CRUISE_KMH * (1 - progress);
      rpm = Math.max(780, rpmAt(speed, 4) * (speed > 25 ? 1 : 0));
      throttle = 0;
      load = 8;
    }
    rpm = Math.max(650, rpm + jitter(30));
    const overrun = phase.kind === 'decel' || phase.kind === 'lift';
    const spool = phase.kind === 'pull' ? Math.min(1, Math.max(0, (rpm - 1700) / 1300)) : 0;
    const taper = rpm > 5800 ? 1 - ((rpm - 5800) / 2000) * 0.25 : 1;
    const peak = this.engine.demoBoost;
    const boost = phase.kind === 'pull' ? peak * spool * taper : phase.kind === 'cruise' ? -0.35 : overrun ? -0.75 : -0.65;
    const baro = 99.8;
    const map = baro + boost * 100 + jitter(1.5);
    const warm = Math.min(1, (t + 600) / 900);
    const torquePct = phase.kind === 'pull' ? 96 * spool * taper + 4 : phase.kind === 'cruise' ? 18 : 0;
    return {
      rpm,
      speed: Math.max(0, speed),
      map,
      boostTarget: baro + (phase.kind === 'pull' ? peak * Math.min(1, spool * 1.15) * taper : 0) * 100,
      baro,
      throttle,
      pedal: phase.kind === 'pull' ? 100 : throttle * 0.9,
      load: load + jitter(2),
      timing: phase.kind === 'pull' ? 4 + spool * 3 + jitter(1.5) : overrun ? 0 : 24 + jitter(2),
      coolant: 40 + 64 * warm + jitter(0.4),
      oil: 35 + 72 * warm + jitter(0.3),
      iat: 28 + (phase.kind === 'pull' ? spool * 9 : 0) + jitter(0.4),
      ambient: 17,
      maf: 3.5 + (rpm / 1000) * (phase.kind === 'pull' ? 38 * (0.4 + spool) : 4),
      rail: phase.kind === 'pull' ? 200 + spool * 150 : 55 + jitter(4),
      lambda: phase.kind === 'pull' ? 0.82 + jitter(0.01) : overrun ? 1.99 : 1.0 + jitter(0.012),
      lambdaTarget: phase.kind === 'pull' ? 0.82 : 1.0,
      stft: jitter(4),
      ltft: 1.6,
      catTemp: 520 + (phase.kind === 'pull' ? 220 * spool : 0),
      voltage: 14.1 + jitter(0.1),
      fuelLevel: 63,
      torquePct,
      refTorque: this.engine.torqueNm,
      runtime: t + 420,
    };
  }

  private encode(pid: number, s: ReturnType<DemoTransport['state']>): number[] | null {
    const c = (v: number, lo = 0, hi = 255) => Math.round(Math.min(hi, Math.max(lo, v)));
    const w = (v: number) => {
      const n = c(v, 0, 65535);
      return [n >> 8, n & 0xff];
    };
    const pct = (v: number) => c((v * 255) / 100);
    const trimByte = (v: number) => c((v * 128) / 100 + 128);
    switch (pid) {
      case 0x01: {
        const count = this.stored.length;
        return [(count > 0 ? 0x80 : 0) | count, 0x07, 0xe5, this.warmup > 3 ? 0x00 : 0x61];
      }
      case 0x04:
        return [pct(s.load)];
      case 0x05:
        return [c(s.coolant + 40)];
      case 0x06:
        return [trimByte(s.stft)];
      case 0x07:
        return [trimByte(s.ltft)];
      case 0x0b:
        return [c(s.map)];
      case 0x0c:
        return w(s.rpm * 4);
      case 0x0d:
        return [c(s.speed)];
      case 0x0e:
        return [c((s.timing + 64) * 2)];
      case 0x0f:
        return [c(s.iat + 40)];
      case 0x10:
        return w(s.maf * 100);
      case 0x11:
        return [pct(s.throttle)];
      case 0x1f:
        return w(s.runtime);
      case 0x23:
        return w((s.rail * 100) / 10);
      case 0x24:
        return [...w((s.lambda * 65536) / 2), 0x80, 0x00];
      case 0x2f:
        return [pct(s.fuelLevel)];
      case 0x31:
        return w(this.stored.length ? 1840 : 0);
      case 0x33:
        return [c(s.baro)];
      case 0x3c:
        return w((s.catTemp + 40) * 10);
      case 0x42:
        return w(s.voltage * 1000);
      case 0x43:
        return w((s.load * 1.1 * 255) / 100);
      case 0x44:
        return w((s.lambdaTarget * 65536) / 2);
      case 0x45:
        return [pct(s.throttle * 0.95)];
      case 0x46:
        return [c(s.ambient + 40)];
      case 0x49:
        return [pct(s.pedal)];
      case 0x4c:
        return [pct(s.throttle)];
      case 0x5c:
        return [c(s.oil + 40)];
      case 0x62:
        return [c(s.torquePct + 125)];
      case 0x63:
        return w(s.refTorque);
      case 0x70:
        return [0x03, ...w(s.boostTarget * 32), ...w(s.map * 32), 0, 0, 0, 0, 0];
      default:
        return null;
    }
  }

  private dtcReply(service: number, codes: string[]): string[] {
    const bytes = [service, codes.length];
    for (const code of codes) {
      const letter = ['P', 'C', 'B', 'U'].indexOf(code[0]);
      const a = (letter << 6) | (parseInt(code[1], 16) << 4) | parseInt(code[2], 16);
      bytes.push(a, parseInt(code.slice(3), 16));
    }
    return this.frames(bytes);
  }

  private frames(payload: number[]): string[] {
    const hex = (b: number[]) => b.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(this.spaces ? ' ' : '');
    const id = '7E8';
    const join = (parts: string[]) => parts.join(this.spaces ? ' ' : '');
    if (!this.headers) {
      if (payload.length <= 7) return [hex(payload)];
      const lines = [payload.length.toString(16).toUpperCase().padStart(3, '0')];
      lines.push(`0: ${hex(payload.slice(0, 6))}`);
      let seq = 1;
      for (let i = 6; i < payload.length; i += 7) lines.push(`${(seq++ % 16).toString(16).toUpperCase()}: ${hex(payload.slice(i, i + 7))}`);
      return lines;
    }
    const pad = (b: number[]) => [...b, ...Array(Math.max(0, 8 - b.length)).fill(0xaa)];
    if (payload.length <= 7) return [join([id, hex(pad([payload.length, ...payload]))])];
    const lines = [join([id, hex([0x10 | (payload.length >> 8), payload.length & 0xff, ...payload.slice(0, 6)])])];
    let seq = 1;
    for (let i = 6; i < payload.length; i += 7) {
      lines.push(join([id, hex(pad([0x20 | (seq++ % 16), ...payload.slice(i, i + 7)]))]));
    }
    return lines;
  }
}
