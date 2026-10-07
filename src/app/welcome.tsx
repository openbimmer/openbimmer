import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EngineGrid } from '@/components/engine-grid';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { Logo } from '@/components/logo';
import { Button, Notice } from '@/components/ui';
import type { EngineId } from '@/data/engines';
import { useSettings } from '@/store/settings';
import { colors, space, type } from '@/theme';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'gauge', title: 'Live gauges', body: 'Boost, timing, temperatures, lambda and more, updated many times per second.' },
  { icon: 'chart', title: 'Data logs', body: 'Record pulls, review them on a chart and export CSV for datazap.' },
  { icon: 'stethoscope', title: 'Diagnose', body: 'Read and clear engine fault codes and check readiness monitors.' },
  { icon: 'timer', title: 'Performance', body: '0–100 km/h, 100–200 km/h and quarter mile with GPS or OBD speed.' },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1>(0);
  const [engine, setEngine] = useState<EngineId | null>(useSettings.getState().engineId);
  const setEngineId = useSettings((s) => s.setEngine);
  const accept = useSettings((s) => s.acceptNotice);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {step === 0 ? (
          <Animated.View entering={FadeIn.duration(400)} key="intro" style={{ gap: space.xl }}>
            <Logo size={68} />
            <View style={{ gap: space.sm }}>
              <Text style={[type.title, styles.headline]}>Know what your engine is doing.</Text>
              <Text style={[type.body, { color: colors.textSecondary }]}>
                OpenBimmer turns a Bluetooth OBD adapter into a live dashboard and data logger for BMW turbo engines. Free and
                open source.
              </Text>
            </View>
            <View style={{ gap: space.lg }}>
              {FEATURES.map((f, i) => (
                <Animated.View key={f.title} entering={FadeInDown.delay(120 + i * 70).duration(380)} style={styles.feature}>
                  <View style={styles.featureIcon}>
                    <Icon name={f.icon} size={18} color={colors.accentStrong} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]}>{f.title}</Text>
                    <Text style={[type.callout, { color: colors.textSecondary }]}>{f.body}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
            <Notice
              tone="warn"
              title="Read-only and at your own risk"
              body="OpenBimmer only reads standard OBD-II data and never writes software to your car. Never use the app while driving; let a passenger operate it."
            />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(350)} key="engine" style={{ gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <Text style={[type.label, { color: colors.textTertiary }]}>Step 2 of 2</Text>
              <Text style={[type.title, styles.headline]}>Which engine do you drive?</Text>
              <Text style={[type.body, { color: colors.textSecondary }]}>
                Gauge ranges, warning limits and the demo adapter follow this profile. You can change it any time.
              </Text>
            </View>
            <EngineGrid value={engine} onChange={setEngine} />
          </Animated.View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {step === 0 ? (
          <Button title="I understand, continue" onPress={() => setStep(1)} />
        ) : (
          <>
            <Button
              title="Start"
              disabled={!engine}
              onPress={() => {
                if (!engine) return;
                setEngineId(engine);
                accept();
              }}
            />
            <Button title="Back" variant="ghost" onPress={() => setStep(0)} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: space.xl, paddingBottom: space.xl },
  headline: { color: colors.text, fontSize: 34, lineHeight: 40 },
  feature: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: space.xl, gap: space.xs, paddingTop: space.sm },
});
