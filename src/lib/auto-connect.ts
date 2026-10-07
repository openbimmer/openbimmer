import { useEffect, useRef } from 'react';

import { ENGINE_MAP } from '@/data/engines';
import { watchBluetoothState } from '@/obd/ble-transport';
import { session, useConnection } from '@/obd/session';
import { useSettings } from '@/store/settings';

export const DEMO_ADAPTER_ID = 'demo';

export function connectDemo() {
  const { engineId, rememberAdapter } = useSettings.getState();
  rememberAdapter({ id: DEMO_ADAPTER_ID, name: 'Demo adapter' });
  return session.connectDemo(ENGINE_MAP[engineId ?? 'b58']);
}

export function useAutoConnect() {
  const accepted = useSettings((s) => s.acceptedNotice);
  const tried = useRef(false);

  useEffect(() => {
    if (!accepted || tried.current) return;
    const { autoConnect, lastAdapter } = useSettings.getState();
    if (!autoConnect || !lastAdapter) return;
    tried.current = true;
    if (lastAdapter.id === DEMO_ADAPTER_ID) {
      connectDemo();
      return;
    }
    let done = false;
    const stop = watchBluetoothState((state) => {
      if (done || state !== 'on') return;
      done = true;
      if (useConnection.getState().status === 'idle') session.connectBle(lastAdapter.id, lastAdapter.name);
    });
    const timer = setTimeout(() => {
      done = true;
      stop();
    }, 8000);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [accepted]);
}
