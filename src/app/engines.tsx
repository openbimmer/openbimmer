import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card, Label } from '@/components/ui';
import { ENGINES, powerLabel } from '@/data/engines';
import { useSettings } from '@/store/settings';
import { colors, fonts, radius, space, type } from '@/theme';

export default function Engines() {
  const current = useSettings((s) => s.engineId);
  return (
    <Screen underHeader>
      <Text style={[type.body, { color: colors.textSecondary, marginTop: space.md, marginBottom: space.lg }]}>
        All live data comes from standard OBD-II, so every engine below works with the same adapter. The profile sets gauge ranges and
        warning limits.
      </Text>
      <View style={{ gap: space.md }}>
        {ENGINES.map((e) => (
          <Card key={e.id} style={[styles.card, e.id === current && { borderColor: colors.accent }]}>
            <View style={styles.head}>
              <Text style={styles.code}>{e.code}</Text>
              <View style={{ flex: 1 }}>
                <Label color={colors.accentStrong}>{e.series}</Label>
                <Text style={[type.bodyStrong, { color: colors.text }]}>{e.title.split('·')[1]?.trim()}</Text>
                <Text style={[type.caption, { color: colors.textTertiary }]}>{e.years}</Text>
              </View>
            </View>
            <View style={styles.specs}>
              <Spec label="Displacement" value={`${e.displacement} cc`} />
              <Spec label="Power" value={powerLabel(e)} />
              <Spec label="Torque" value={`up to ${e.torqueNm} Nm`} />
              <Spec label="Redline" value={`${e.redline} rpm`} />
            </View>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{e.induction}</Text>
            <Text style={[type.caption, { color: colors.textTertiary }]}>{e.models.join(' · ')}</Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spec}>
      <Text style={[type.label, { color: colors.textTertiary, fontSize: 10 }]}>{label}</Text>
      <Text style={[type.mono, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  code: { fontFamily: fonts.numBold, fontSize: 44, lineHeight: 48, color: colors.text, minWidth: 78 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  spec: { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, gap: 1 },
});
