import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Button, Group, Label, Notice, Row, tap } from '@/components/ui';
import { connectDemo, DEMO_ADAPTER_ID } from '@/lib/auto-connect';
import {
  type BluetoothState,
  ensureBluetoothPermission,
  type ScannedAdapter,
  scanAdapters,
  watchBluetoothState,
} from '@/obd/ble-transport';
import { session, useConnection } from '@/obd/session';
import { useSettings } from '@/store/settings';
import { colors, fonts, radius, space, type } from '@/theme';

const SCAN_MS = 15000;

function signal(rssi: number | null) {
  if (rssi === null) return 0;
  if (rssi > -60) return 3;
  if (rssi > -75) return 2;
  return 1;
}

export default function Connect() {
  const status = useConnection((s) => s.status);
  const step = useConnection((s) => s.step);
  const error = useConnection((s) => s.error);
  const adapter = useConnection((s) => s.adapter);
  const hz = useConnection((s) => s.hz);
  const vin = useConnection((s) => s.vin);
  const lastAdapter = useSettings((s) => s.lastAdapter);
  const rememberAdapter = useSettings((s) => s.rememberAdapter);

  const [bt, setBt] = useState<BluetoothState>('unknown');
  const [permission, setPermission] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedAdapter[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const busy = status === 'connecting' || status === 'initializing';

  useEffect(() => watchBluetoothState(setBt), []);

  const stopScan = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    const granted = await ensureBluetoothPermission();
    setPermission(granted);
    if (!granted) return;
    stopRef.current?.();
    setDevices([]);
    setScanError(null);
    setScanning(true);
    const stop = scanAdapters(
      (found) =>
        setDevices((list) => {
          const index = list.findIndex((d) => d.id === found.id);
          if (index === -1) return [...list, found];
          const next = [...list];
          next[index] = found;
          return next;
        }),
      (message) => {
        setScanError(message);
        setScanning(false);
      },
    );
    stopRef.current = stop;
    setTimeout(() => {
      if (stopRef.current === stop) {
        stop();
        stopRef.current = null;
        setScanning(false);
      }
    }, SCAN_MS);
  }, []);

  useEffect(() => {
    if (bt === 'on' && status !== 'connected' && !busy) startScan();
    if (bt !== 'on') stopScan();
  }, [bt]);

  useEffect(() => () => stopScan(), [stopScan]);

  useEffect(() => {
    if (status === 'connected' && target) {
      rememberAdapter(target);
      const timer = setTimeout(() => {
        if (router.canGoBack()) router.back();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [status, target, rememberAdapter]);

  const connect = (device: { id: string; name: string }) => {
    stopScan();
    setTarget(device);
    if (device.id === DEMO_ADAPTER_ID) connectDemo();
    else session.connectBle(device.id, device.name);
  };

  const obd = devices.filter((d) => d.likelyObd).sort((a, b) => (b.rssi ?? -200) - (a.rssi ?? -200));
  const others = devices.filter((d) => !d.likelyObd).sort((a, b) => (b.rssi ?? -200) - (a.rssi ?? -200));

  if (status === 'connected' && adapter) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeIn} style={styles.connectedHero}>
          <View style={[styles.statusIcon, { backgroundColor: colors.goodSoft }]}>
            <Icon name="checkCircle" size={26} color={colors.good} />
          </View>
          <Text style={[type.headline, { color: colors.text }]}>Connected</Text>
          <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]}>
            {adapter.name} · {adapter.version}
          </Text>
        </Animated.View>
        <Group style={styles.sheetGroup}>
          <Row icon="antenna" title="Adapter" value={adapter.kind === 'demo' ? 'Simulated' : 'Bluetooth LE'} />
          <Row icon="link" title="Protocol" value={adapter.protocolName.replace('ISO 15765-4 ', '')} />
          <Row icon="car" title="VIN" value={vin ?? 'Not reported'} />
          <Row icon="bars" title="Update rate" value={hz > 0 ? `${hz.toFixed(1)} Hz` : 'Idle'} last />
        </Group>
        <Button title="Disconnect" variant="danger" icon="unlink" onPress={() => session.disconnect()} />
      </ScrollView>
    );
  }

  if (busy) {
    return (
      <View style={[styles.content, styles.center]}>
        <ActivityIndicator color={colors.accentStrong} size="large" />
        <Text style={[type.headline, { color: colors.text, marginTop: space.lg }]}>{target?.name ?? 'Adapter'}</Text>
        <Animated.Text key={step} entering={FadeIn} exiting={FadeOut} style={[type.callout, { color: colors.textSecondary }]}>
          {step || 'Connecting'}
        </Animated.Text>
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: space.md, maxWidth: 280 }]}>
          Keep the ignition on. The first connection can take up to 15 seconds while the adapter detects the protocol.
        </Text>
        <Button title="Cancel" variant="secondary" style={{ marginTop: space.xl, alignSelf: 'stretch' }} onPress={() => session.disconnect()} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: colors.text }]}>Connect adapter</Text>
          <Text style={[type.callout, { color: colors.textSecondary }]}>Plug the adapter into the OBD port and switch the ignition on.</Text>
        </View>
      </View>

      {error ? <Notice tone="danger" title="Connection failed" body={error} /> : null}

      {bt === 'off' ? (
        <Notice tone="warn" title="Bluetooth is off" body="Turn on Bluetooth to find your adapter." />
      ) : bt === 'unauthorized' || !permission ? (
        <View style={{ gap: space.sm }}>
          <Notice tone="warn" title="Bluetooth permission needed" body="OpenBimmer needs Bluetooth access to talk to your OBD adapter." />
          <Button title="Open settings" variant="secondary" onPress={() => Linking.openSettings()} />
        </View>
      ) : bt === 'unsupported' ? (
        <Notice tone="warn" title="Bluetooth LE not available" body="This device does not support Bluetooth LE. You can still explore the app with the demo adapter." />
      ) : null}

      {lastAdapter && lastAdapter.id !== DEMO_ADAPTER_ID ? (
        <View style={{ gap: space.sm }}>
          <Label>Last used</Label>
          <Group style={styles.sheetGroup}>
            <Row icon="antenna" iconTint={colors.accentStrong} title={lastAdapter.name} subtitle="Tap to reconnect" chevron onPress={() => connect(lastAdapter)} last />
          </Group>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <View style={styles.sectionRow}>
          <Label>OBD adapters nearby</Label>
          {scanning ? (
            <View style={styles.scanning}>
              <ActivityIndicator size="small" color={colors.textTertiary} />
              <Text style={[type.caption, { color: colors.textTertiary }]}>Scanning</Text>
            </View>
          ) : bt === 'on' ? (
            <Pressable onPress={startScan} hitSlop={10} accessibilityRole="button" accessibilityLabel="Scan again">
              <Text style={[type.caption, { color: colors.accentStrong, fontFamily: fonts.semibold }]}>Scan again</Text>
            </Pressable>
          ) : null}
        </View>
        <Animated.View layout={LinearTransition}>
          {obd.length > 0 ? (
            <Group style={styles.sheetGroup}>
              {obd.map((d, i) => (
                <DeviceRow key={d.id} device={d} last={i === obd.length - 1} onPress={() => connect(d)} />
              ))}
            </Group>
          ) : (
            <View style={styles.placeholder}>
              <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]}>
                {scanning ? 'Looking for ELM327 Bluetooth LE adapters…' : scanError ?? 'No OBD adapter found yet.'}
              </Text>
              {Platform.OS === 'ios' ? (
                <Text style={[type.caption, { color: colors.textTertiary, textAlign: 'center' }]}>
                  iPhone only works with Bluetooth LE adapters. Classic Bluetooth adapters do not show up here.
                </Text>
              ) : null}
            </View>
          )}
        </Animated.View>
        {others.length > 0 ? (
          <Pressable
            onPress={() => {
              tap();
              setShowAll((v) => !v);
            }}
            style={styles.toggle}>
            <Text style={[type.caption, { color: colors.textSecondary }]}>
              {showAll ? 'Hide' : 'Show'} {others.length} other Bluetooth {others.length === 1 ? 'device' : 'devices'}
            </Text>
            <Icon name="chevronDown" size={12} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        {showAll && others.length > 0 ? (
          <Group style={styles.sheetGroup}>
            {others.map((d, i) => (
              <DeviceRow key={d.id} device={d} last={i === others.length - 1} onPress={() => connect(d)} />
            ))}
          </Group>
        ) : null}
      </View>

      <View style={{ gap: space.sm }}>
        <Label>No adapter yet?</Label>
        <Group style={styles.sheetGroup}>
          <Row
            icon="sparkle"
            iconTint={colors.accentStrong}
            title="Try the demo adapter"
            subtitle="Simulated engine with realistic pulls"
            chevron
            onPress={() => connect({ id: DEMO_ADAPTER_ID, name: 'Demo adapter' })}
          />
          <Row icon="cart" title="Which adapter should I buy?" chevron onPress={() => router.push('/adapters')} last />
        </Group>
      </View>
    </ScrollView>
  );
}

function DeviceRow({ device, onPress, last }: { device: ScannedAdapter; onPress: () => void; last: boolean }) {
  const bars = signal(device.rssi);
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${device.name}`}
      android_ripple={{ color: colors.surfacePressed }}
      style={({ pressed }) => [styles.device, !last && styles.deviceBorder, pressed && { backgroundColor: colors.surfacePressed }]}>
      <View style={styles.deviceIcon}>
        <Icon name="antenna" size={17} color={device.likelyObd ? colors.accentStrong : colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {device.name}
        </Text>
        <Text style={[type.caption, { color: colors.textTertiary }]}>{device.rssi !== null ? `${device.rssi} dBm` : 'Signal unknown'}</Text>
      </View>
      <View style={styles.bars}>
        {[1, 2, 3].map((b) => (
          <View key={b} style={[styles.bar, { height: 4 + b * 4, backgroundColor: b <= bars ? colors.text : colors.track }]} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetGroup: { backgroundColor: colors.surfaceRaised },
  content: { padding: space.xl, paddingTop: space.xxl, gap: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeholder: {
    padding: space.xl,
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: space.xs },
  device: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  deviceBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  deviceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surfacePressed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, borderRadius: 1 },
  connectedHero: { alignItems: 'center', gap: space.xs, paddingVertical: space.md },
  statusIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
