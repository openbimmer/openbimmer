export type Message = { ecu: string; data: number[] };

export type FrameFormat = 'can11' | 'can29' | 'plain';

export function hexToBytes(hex: string): number[] | null {
  const clean = hex.replace(/\s/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(clean)) return null;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

export function parseMessages(lines: string[], format: FrameFormat): Message[] {
  if (format === 'plain') {
    return lines
      .map((l) => l.replace(/\s/g, '').replace(/^[0-9A-F]:/i, ''))
      .map((l) => hexToBytes(l))
      .filter((b): b is number[] => !!b)
      .map((data) => ({ ecu: 'ECU', data }));
  }

  const idLength = format === 'can11' ? 3 : 8;
  const streams = new Map<string, { length: number; data: number[]; next: number; broken: boolean }>();
  const order: string[] = [];

  for (const raw of lines) {
    const line = raw.replace(/\s/g, '');
    if (line.length <= idLength) continue;
    const ecu = line.slice(0, idLength).toUpperCase();
    const bytes = hexToBytes(line.slice(idLength));
    if (!bytes || bytes.length === 0) continue;
    const pci = bytes[0] >> 4;
    if (pci === 0) {
      const length = bytes[0] & 0x0f;
      streams.set(ecu, { length, data: bytes.slice(1, 1 + length), next: 1, broken: false });
      if (!order.includes(ecu)) order.push(ecu);
    } else if (pci === 1) {
      const length = ((bytes[0] & 0x0f) << 8) | bytes[1];
      streams.set(ecu, { length, data: bytes.slice(2), next: 1, broken: false });
      if (!order.includes(ecu)) order.push(ecu);
    } else if (pci === 2) {
      const stream = streams.get(ecu);
      if (!stream) continue;
      if ((bytes[0] & 0x0f) !== stream.next) stream.broken = true;
      stream.next = (stream.next + 1) & 0x0f;
      stream.data.push(...bytes.slice(1));
    }
  }

  return order
    .map((ecu) => streams.get(ecu)!)
    .map((stream, i) => ({ ecu: order[i], stream }))
    .filter(({ stream }) => !stream.broken && stream.data.length >= stream.length)
    .map(({ ecu, stream }) => ({ ecu, data: stream.data.slice(0, stream.length) }));
}

export function pickMessage(messages: Message[], service: number, preferred = ['7E8', '18DAF110']): Message | undefined {
  const reply = service + 0x40;
  const matching = messages.filter((m) => m.data[0] === reply);
  return matching.find((m) => preferred.includes(m.ecu)) ?? matching[0];
}

export function negativeResponse(messages: Message[], service: number): number | undefined {
  const neg = messages.find((m) => m.data[0] === 0x7f && m.data[1] === service);
  return neg?.data[2];
}
