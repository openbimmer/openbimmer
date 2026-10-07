import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, Label, Pill } from '@/components/ui';
import { ENGINE_MAP } from '@/data/engines';
import { type DtcKind, dtcSystem, isManufacturerSpecific } from '@/obd/dtc';
import { DTC_KIND_INFO, describeDtc, isDtcKind } from '@/obd/dtc-codes';
import { useSettings } from '@/store/settings';
import { colors, radius, space, type } from '@/theme';

const KIND_TONE: Record<DtcKind, { tint: string; background: string }> = {
  stored: { tint: colors.danger, background: colors.dangerSoft },
  pending: { tint: colors.warn, background: colors.warnSoft },
  permanent: { tint: colors.textSecondary, background: colors.surfacePressed },
};

const STEPS = [
  'Check the freeze frame and related live data to see the conditions when the code was set.',
  'Inspect the wiring and connectors of the affected circuit for damage, corrosion or loose pins.',
  'Clear the code, complete a drive cycle and scan again to see whether it comes back.',
];

export default function DtcDetail() {
  const params = useLocalSearchParams<{ code: string; kind?: string }>();
  const code = String(params.code ?? '').trim().toUpperCase();
  const kind = isDtcKind(params.kind) ? params.kind : null;
  const engineId = useSettings((s) => s.engineId);
  const engine = engineId ? ENGINE_MAP[engineId] : null;
  const insets = useSafeAreaInsets();

  const description = describeDtc(code);
  const manufacturer = isManufacturerSpecific(code);
  const steps = manufacturer
    ? [...STEPS, 'Manufacturer-specific codes need BMW documentation or a BMW-capable diagnostic tool for the exact meaning.']
    : STEPS;
  const query = ['BMW', engine?.code, code].filter(Boolean).join(' ');

  const search = () => {
    WebBrowser.openBrowserAsync(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
      controlsColor: colors.accentStrong,
      toolbarColor: colors.background,
      dismissButtonStyle: 'close',
    }).catch(() => {
      Alert.alert('Browser not available', `Search for "${query}" in your browser instead.`);
    });
  };

  return (
    <View style={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label>Fault code</Label>
          <View style={styles.codeLine}>
            <Text style={[type.display, { color: colors.text }]} selectable>
              {code}
            </Text>
            {kind ? (
              <View>
                <Pill label={DTC_KIND_INFO[kind].label} tint={KIND_TONE[kind].tint} background={KIND_TONE[kind].background} />
              </View>
            ) : null}
          </View>
        </View>
        <IconButton icon="close" label="Close" onPress={() => router.back()} size={34} background={colors.surfaceRaised} />
      </View>

      <View style={{ gap: space.xs }}>
        <Text style={[type.headline, { color: description ? colors.text : colors.textSecondary }]}>
          {description ?? (manufacturer ? 'Manufacturer-specific code' : 'No description available')}
        </Text>
        {kind ? <Text style={[type.callout, { color: colors.textSecondary }]}>{DTC_KIND_INFO[kind].detail}</Text> : null}
      </View>

      <View style={styles.facts}>
        <View style={styles.fact}>
          <Label>System</Label>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{dtcSystem(code)}</Text>
        </View>
        <View style={styles.factDivider} />
        <View style={styles.fact}>
          <Label>Definition</Label>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{manufacturer ? 'Manufacturer' : 'Generic SAE'}</Text>
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <Label>What to do</Label>
        {steps.map((step, i) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={[type.mono, { color: colors.textSecondary }]}>{i + 1}</Text>
            </View>
            <Text style={[type.callout, { color: colors.textSecondary, flex: 1 }]}>{step}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Button title="Search the web" icon="globe" variant="secondary" onPress={search} />
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: 'center' }]}>Searches for "{query}"</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingTop: space.xxl, gap: space.xl },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  codeLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  facts: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fact: { flex: 1, gap: 4, padding: space.md },
  factDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
