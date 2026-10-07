import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, type Characteristic, type Device, State, type Subscription } from 'react-native-ble-plx';

import { type Transport, TransportEmitter } from './transport';

let manager: BleManager | null = null;

export function bleManager() {
  if (!manager) manager = new BleManager();
  return manager;
}

export type BluetoothState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown';

function mapState(state: State): BluetoothState {
  switch (state) {
    case State.PoweredOn:
      return 'on';
    case State.PoweredOff:
      return 'off';
    case State.Unauthorized:
      return 'unauthorized';
    case State.Unsupported:
      return 'unsupported';
    default:
      return 'unknown';
  }
}

export function watchBluetoothState(listener: (state: BluetoothState) => void): () => void {
  const sub = bleManager().onStateChange((s) => listener(mapState(s)), true);
  return () => sub.remove();
}

export async function ensureBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  if (api >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
  }
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

const OBD_NAME = /obd|elm|vgate|icar|v-?link|vlinker|veepeak|konnwei|kw\d{3}|obdlink|carista|bimmer|thinkcar|lelink|panlong|zurich|foxwell|topdon|ancel|bluedriver|autophix|iobd|car ?scanner|ios-|android-/i;

export type ScannedAdapter = {
  id: string;
  name: string;
  rssi: number | null;
  likelyObd: boolean;
};

export function scanAdapters(onFound: (adapter: ScannedAdapter) => void, onError: (message: string) => void): () => void {
  const ble = bleManager();
  ble.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
    if (error) {
      onError(error.message);
      return;
    }
    if (!device) return;
    const name = device.name ?? device.localName ?? '';
    if (!name) return;
    onFound({ id: device.id, name, rssi: device.rssi, likelyObd: OBD_NAME.test(name) });
  });
  return () => {
    ble.stopDeviceScan();
  };
}

const short = (uuid: string) => {
  const u = uuid.toLowerCase();
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/.exec(u);
  return m ? m[1] : u;
};

const KNOWN: { service: string; notify: string; write: string }[] = [
  { service: 'fff0', notify: 'fff1', write: 'fff2' },
  { service: 'ffe0', notify: 'ffe1', write: 'ffe1' },
  { service: '18f0', notify: '2af0', write: '2af1' },
  {
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    notify: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  },
];

const IGNORED_SERVICES = new Set(['1800', '1801', '180a', '180f', '1805', 'fe59', '00001530-1212-efde-1523-785feabcd123']);

type Endpoint = { service: string; notify: Characteristic; write: Characteristic };

async function findEndpoint(device: Device): Promise<Endpoint | null> {
  const services = await device.services();
  const all: { service: string; chars: Characteristic[] }[] = [];
  for (const service of services) {
    if (IGNORED_SERVICES.has(short(service.uuid))) continue;
    all.push({ service: service.uuid, chars: await service.characteristics() });
  }
  for (const known of KNOWN) {
    const entry = all.find((s) => short(s.service) === known.service);
    if (!entry) continue;
    const notify = entry.chars.find((c) => short(c.uuid) === known.notify && (c.isNotifiable || c.isIndicatable));
    const write = entry.chars.find(
      (c) => short(c.uuid) === known.write && (c.isWritableWithoutResponse || c.isWritableWithResponse),
    );
    if (notify && write) return { service: entry.service, notify, write };
  }
  for (const entry of all) {
    const notify = entry.chars.find((c) => c.isNotifiable || c.isIndicatable);
    const write = entry.chars.find((c) => c.isWritableWithoutResponse || c.isWritableWithResponse);
    if (notify && write) return { service: entry.service, notify, write };
  }
  return null;
}

function toBase64(text: string) {
  return btoa(text);
}

function fromBase64(value: string) {
  return atob(value);
}

export class BleTransport implements Transport {
  readonly kind = 'ble' as const;
  private emitter = new TransportEmitter();
  private subscriptions: Subscription[] = [];
  private closing = false;

  private constructor(
    private device: Device,
    private endpoint: Endpoint,
    readonly name: string,
  ) {}

  static async connect(id: string, name: string): Promise<BleTransport> {
    const ble = bleManager();
    ble.stopDeviceScan();
    let device = await ble.connectToDevice(id, {
      timeout: 12000,
      requestMTU: Platform.OS === 'android' ? 185 : undefined,
    });
    try {
      device = await device.discoverAllServicesAndCharacteristics();
      const endpoint = await findEndpoint(device);
      if (!endpoint) throw new Error('This device has no serial characteristic. Is it an ELM327 Bluetooth LE adapter?');
      const transport = new BleTransport(device, endpoint, name);
      transport.start();
      return transport;
    } catch (error) {
      await ble.cancelDeviceConnection(id).catch(() => undefined);
      throw error;
    }
  }

  private start() {
    const { notify } = this.endpoint;
    this.subscriptions.push(
      this.device.monitorCharacteristicForService(notify.serviceUUID, notify.uuid, (error, characteristic) => {
        if (error) {
          if (this.closing) return;
          this.closing = true;
          this.cleanup();
          bleManager()
            .cancelDeviceConnection(this.device.id)
            .catch(() => undefined);
          this.emitter.emitClose('lost');
          return;
        }
        if (characteristic?.value) this.emitter.emitData(fromBase64(characteristic.value));
      }),
    );
    this.subscriptions.push(
      this.device.onDisconnected(() => {
        this.cleanup();
        this.emitter.emitClose(this.closing ? 'closed' : 'lost');
      }),
    );
  }

  async write(data: string) {
    const { write } = this.endpoint;
    const withoutResponse = write.isWritableWithoutResponse;
    for (let i = 0; i < data.length; i += 20) {
      const chunk = toBase64(data.slice(i, i + 20));
      if (withoutResponse) {
        await this.device.writeCharacteristicWithoutResponseForService(write.serviceUUID, write.uuid, chunk);
      } else {
        await this.device.writeCharacteristicWithResponseForService(write.serviceUUID, write.uuid, chunk);
      }
    }
  }

  onData(listener: (chunk: string) => void) {
    return this.emitter.onData(listener);
  }

  onClose(listener: (reason?: string) => void) {
    return this.emitter.onClose(listener);
  }

  async close() {
    this.closing = true;
    await bleManager()
      .cancelDeviceConnection(this.device.id)
      .catch(() => undefined);
    this.cleanup();
    this.emitter.emitClose('closed');
  }

  private cleanup() {
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
  }
}
