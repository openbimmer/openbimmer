import type { Transport } from './transport';

export type ElmErrorCode =
  | 'timeout'
  | 'no-data'
  | 'unable-to-connect'
  | 'bus-error'
  | 'unknown-command'
  | 'stopped'
  | 'buffer-full'
  | 'closed';

export class ElmError extends Error {
  constructor(
    public code: ElmErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

type Pending = {
  command: string;
  accept: (lines: string[]) => boolean;
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const NOISE = [/^SEARCHING/, /^BUS INIT/, /^OK$/];

const ERRORS: [RegExp, ElmErrorCode][] = [
  [/NO DATA/, 'no-data'],
  [/UNABLE TO CONNECT/, 'unable-to-connect'],
  [/(CAN ERROR|BUS ERROR|BUS BUSY|FB ERROR|DATA ERROR|<RX ERROR|ERR\d+|LV RESET)/, 'bus-error'],
  [/^\?$/, 'unknown-command'],
  [/STOPPED/, 'stopped'],
  [/BUFFER FULL/, 'buffer-full'],
];

export type CommandLog = { at: number; dir: 'tx' | 'rx'; text: string };

const compact = (s: string) => s.replace(/\s/g, '').toUpperCase();

export class Elm327 {
  private buffer = '';
  private pending: Pending | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private resync = false;
  private closed = false;
  private echo = false;
  private unsubscribe: (() => void)[] = [];
  private logListener: ((entry: CommandLog) => void) | null = null;

  constructor(private transport: Transport) {
    this.unsubscribe.push(transport.onData((chunk) => this.receive(chunk)));
    this.unsubscribe.push(
      transport.onClose(() => {
        this.closed = true;
        const pending = this.pending;
        this.clearPending();
        pending?.reject(new ElmError('closed', 'Adapter disconnected'));
      }),
    );
  }

  get name() {
    return this.transport.name;
  }

  get kind() {
    return this.transport.kind;
  }

  setLogListener(listener: ((entry: CommandLog) => void) | null) {
    this.logListener = listener;
  }

  setEchoMatching(on: boolean) {
    this.echo = on;
  }

  send(command: string, timeoutMs = 2000): Promise<string[]> {
    const run = () => this.exec(command, timeoutMs);
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  async close() {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [];
    this.closed = true;
    const pending = this.pending;
    this.clearPending();
    pending?.reject(new ElmError('closed'));
    await this.transport.close();
  }

  private async exec(command: string, timeoutMs: number): Promise<string[]> {
    if (this.closed) throw new ElmError('closed', 'Adapter disconnected');
    if (this.resync) {
      this.resync = false;
      this.buffer = '';
      await this.raw('ATI', 1500, (lines) => lines.some((l) => /ELM|STN|OBD/i.test(l) && !/STOPPED/i.test(l))).catch(
        () => undefined,
      );
    }
    const echo = compact(command);
    const accept = this.echo ? (lines: string[]) => lines.some((l) => compact(l) === echo) : () => true;
    const lines = await this.raw(command, timeoutMs, accept);
    return clean(command, lines);
  }

  private raw(command: string, timeoutMs: number, accept: (lines: string[]) => boolean): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      this.buffer = '';
      const timer = setTimeout(() => {
        if (this.pending?.timer !== timer) return;
        this.clearPending();
        this.resync = true;
        reject(new ElmError('timeout', `No answer to ${command}`));
      }, timeoutMs);
      this.pending = { command, accept, resolve, reject, timer };
      this.logListener?.({ at: Date.now(), dir: 'tx', text: command });
      this.transport.write(`${command}\r`).catch((error) => {
        if (this.pending?.timer !== timer) return;
        this.clearPending();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private receive(chunk: string) {
    this.buffer += chunk;
    let prompt = this.buffer.indexOf('>');
    while (prompt !== -1) {
      const body = this.buffer.slice(0, prompt);
      this.buffer = this.buffer.slice(prompt + 1);
      const lines = body
        .replace(/\0/g, '')
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      const pending = this.pending;
      if (pending && pending.accept(lines)) {
        this.logListener?.({ at: Date.now(), dir: 'rx', text: lines.join(' | ') });
        this.clearPending();
        pending.resolve(lines);
      } else {
        this.logListener?.({ at: Date.now(), dir: 'rx', text: `(discarded) ${lines.join(' | ')}` });
      }
      prompt = this.buffer.indexOf('>');
    }
  }

  private clearPending() {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}

function clean(command: string, lines: string[]): string[] {
  const echo = compact(command);
  const isAt = command.toUpperCase().startsWith('AT');
  const out = lines.filter((line) => {
    if (compact(line) === echo && echo.length > 0) return false;
    if (!isAt && NOISE.some((n) => n.test(line.toUpperCase()))) return false;
    return true;
  });
  const hasData = out.some((l) => /^[0-9A-F\s:]+$/i.test(l));
  for (const line of out) {
    const upper = line.toUpperCase();
    for (const [pattern, code] of ERRORS) {
      if (!pattern.test(upper)) continue;
      if (code === 'no-data' && hasData) continue;
      if (isAt && code !== 'unknown-command') continue;
      throw new ElmError(code, line);
    }
  }
  return out;
}
