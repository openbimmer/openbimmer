import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Header, Screen } from '@/components/screen';
import { Group, Row, SectionTitle, Segmented } from '@/components/ui';
import { ENGINE_MAP } from '@/data/engines';
import { ISSUES_URL, PRIVACY_URL, REPO_URL } from '@/lib/links';
import { session, useConnection } from '@/obd/session';
import { useSettings } from '@/store/settings';
import { colors, fonts, space, type } from '@/theme';

export default function More() {
  const s = useSettings();
  const status = useConnection((st) => st.status);
  const adapter = useConnection((st) => st.adapter);
  const [name, setName] = useState(s.nickname);
  const engine = ENGINE_MAP[s.engineId ?? 'b58'];

  return (
    <Screen>
      <Header eyebrow="Settings" title="More" />

      <SectionTitle title="Vehicle" />
      <Group>
        <View style={styles.inputRow}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={() => s.setNickname(name.trim())}
            placeholder="My BMW"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            returnKeyType="done"
            maxLength={28}
          />
        </View>
        <Row icon="engine" title="Engine" value={`${engine.code} · ${engine.series}`} chevron onPress={() => router.push('/engine')} last />
      </Group>

      <SectionTitle title="Adapter" />
      <Group>
        <Row
          icon="antenna"
          title={status === 'connected' ? adapter?.name ?? 'Connected' : 'Connect adapter'}
          subtitle={status === 'connected' ? adapter?.version : s.lastAdapter ? `Last used: ${s.lastAdapter.name}` : undefined}
          chevron
          onPress={() => router.push('/connect')}
        />
        <Row icon="refresh" title="Reconnect on launch" toggle={s.autoConnect} onToggle={() => s.toggle('autoConnect')} />
        <Row icon="terminal" title="Adapter console" subtitle="Raw ELM327 traffic for troubleshooting" chevron onPress={() => router.push('/console')} />
        <Row icon="cart" title="Recommended adapters" chevron onPress={() => router.push('/adapters')} last />
      </Group>

      <SectionTitle title="Units" />
      <View style={{ gap: space.sm }}>
        <Segmented
          options={[
            { value: 'kmh', label: 'km/h' },
            { value: 'mph', label: 'mph' },
          ]}
          value={s.units.speed}
          onChange={(v) => s.setUnit('speed', v)}
        />
        <Segmented
          options={[
            { value: 'c', label: '°C' },
            { value: 'f', label: '°F' },
          ]}
          value={s.units.temperature}
          onChange={(v) => s.setUnit('temperature', v)}
        />
        <Segmented
          options={[
            { value: 'bar', label: 'bar' },
            { value: 'psi', label: 'psi' },
            { value: 'kpa', label: 'kPa' },
          ]}
          value={s.units.pressure}
          onChange={(v) => s.setUnit('pressure', v)}
        />
        <Segmented
          options={[
            { value: 'nm', label: 'Nm' },
            { value: 'lbft', label: 'lb-ft' },
          ]}
          value={s.units.torque}
          onChange={(v) => s.setUnit('torque', v)}
        />
        <Segmented
          options={[
            { value: 'ps', label: 'PS' },
            { value: 'hp', label: 'hp' },
            { value: 'kw', label: 'kW' },
          ]}
          value={s.units.power}
          onChange={(v) => s.setUnit('power', v)}
        />
      </View>

      <SectionTitle title="Live screen" />
      <Group>
        <Row icon="bolt" title="Shift light" subtitle={`Lights up toward ${engine.redline.toLocaleString('en-US')} rpm`} toggle={s.shiftLight} onToggle={() => s.toggle('shiftLight')} />
        <Row icon="sparkle" title="Haptic feedback" toggle={s.haptics} onToggle={() => s.toggle('haptics')} />
        <Row icon="lock" title="Keep screen on while connected" toggle={s.keepAwake} onToggle={() => s.toggle('keepAwake')} last />
      </Group>

      <SectionTitle title="OpenBimmer" />
      <Group>
        <Row icon="engine" title="Supported engines" chevron onPress={() => router.push('/engines')} />
        <Row icon="code" title="Source code on GitHub" subtitle="Free and open source, MIT license" chevron onPress={() => WebBrowser.openBrowserAsync(REPO_URL)} />
        <Row icon="question" title="Report a problem" chevron onPress={() => WebBrowser.openBrowserAsync(ISSUES_URL)} />
        <Row icon="lock" title="Privacy policy" chevron onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
        <Row icon="info" title="About and disclaimer" chevron onPress={() => router.push('/about')} last />
      </Group>

      <SectionTitle title="Reset" />
      <Group>
        <Row
          icon="trash"
          title="Reset all settings"
          destructive
          onPress={() =>
            Alert.alert('Reset settings?', 'Units, gauges and the saved adapter go back to their defaults. Logs and results stay.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: async () => {
                  await session.disconnect();
                  s.reset();
                },
              },
            ])
          }
          last
        />
      </Group>

      <Text style={[type.caption, styles.version]}>
        OpenBimmer {Application.nativeApplicationVersion ?? '1.0.0'} ({Application.nativeBuildVersion ?? '1'})
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    minHeight: 54,
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  input: { flex: 1, textAlign: 'right', color: colors.text, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 12 },
  version: { color: colors.textTertiary, textAlign: 'center', marginTop: space.xxl },
});
