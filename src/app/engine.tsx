import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { EngineGrid } from '@/components/engine-grid';
import { useSettings } from '@/store/settings';
import { colors, space, type } from '@/theme';

export default function EnginePicker() {
  const engineId = useSettings((s) => s.engineId);
  const setEngine = useSettings((s) => s.setEngine);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[type.headline, { color: colors.text }]}>Engine</Text>
      <Text style={[type.callout, { color: colors.textSecondary, marginTop: 2, marginBottom: space.lg }]}>
        Sets gauge ranges, the shift light and warning limits.
      </Text>
      <EngineGrid
        value={engineId}
        onChange={(id) => {
          setEngine(id);
          setTimeout(() => router.back(), 180);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl },
});
