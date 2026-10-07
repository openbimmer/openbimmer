import { StyleSheet, Text, View } from 'react-native';

import { type EngineId, ENGINES, powerLabel } from '@/data/engines';
import { colors, fonts, radius, space, type } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { tap } from './ui';

export function EngineGrid({ value, onChange }: { value: EngineId | null; onChange: (id: EngineId) => void }) {
  return (
    <View style={styles.grid}>
      {ENGINES.map((engine) => {
        const active = engine.id === value;
        return (
          <PressableScale
            key={engine.id}
            onPress={() => {
              tap();
              onChange(engine.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${engine.code} ${engine.series}, ${engine.title}`}
            style={[styles.cell, active && styles.cellActive]}>
            <View style={styles.top}>
              <Text style={[styles.code, { color: active ? colors.text : colors.text }]}>{engine.code}</Text>
              {active ? (
                <View style={styles.check}>
                  <Icon name="check" size={11} color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <Text style={[type.label, { color: active ? colors.accentStrong : colors.textTertiary }]}>{engine.series}</Text>
            <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {engine.layout} · {(engine.displacement / 1000).toFixed(1)} L · {powerLabel(engine)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: {
    width: '48.8%',
    flexGrow: 1,
    padding: space.md,
    paddingTop: space.sm,
    gap: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cellActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontFamily: fonts.numBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.3 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
