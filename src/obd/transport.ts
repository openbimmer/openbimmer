export type TransportKind = 'ble' | 'demo';

export interface Transport {
  readonly kind: TransportKind;
  readonly name: string;
  write(data: string): Promise<void>;
  onData(listener: (chunk: string) => void): () => void;
  onClose(listener: (reason?: string) => void): () => void;
  close(): Promise<void>;
}

export class TransportEmitter {
  private dataListeners = new Set<(chunk: string) => void>();
  private closeListeners = new Set<(reason?: string) => void>();

  onData(listener: (chunk: string) => void) {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  onClose(listener: (reason?: string) => void) {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  emitData(chunk: string) {
    this.dataListeners.forEach((l) => l(chunk));
  }

  emitClose(reason?: string) {
    this.closeListeners.forEach((l) => l(reason));
    this.closeListeners.clear();
    this.dataListeners.clear();
  }
}
