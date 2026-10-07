import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Label, tap } from '@/components/ui';
import { convertChannel } from '@/lib/units';
import { useConnection } from '@/obd/session';
import { CHANNELS, type ChannelDef, type ChannelId, channelSupported } from '@/obd/pids';
import { useSettings } from '@/store/settings';
import { colors, radius, space, type } from '@/theme';

const GROUPS: { title: string; ids: ChannelId[] }[] = [
  { title: 'Engine', ids: ['rpm', 'speed', 'load', 'absLoad', 'throttle', 'pedal', 'timing', 'torque', 'power'] },
  { title: 'Air and boost', ids: ['boost', 'boostTarget', 'map', 'baro', 'maf'] },
  { title: 'Fuel', ids: ['lambda', 'lambdaTarget', 'afr', 'rail', 'stft1', 'ltft1', 'stft2', 'ltft2', 'fuelRate', 'fuelLevel'] },
  { title: 'Temperatures', ids: ['coolant', 'oil', 'iat', 'cac', 'ambient', 'catTemp'] },
  { title: 'Other', ids: ['voltage', 'runtime', 'odometer', 'clearDistance'] },
];

export default function ChannelPicker() {
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const hero = useSettings((s) => s.hero);
  const tiles = useSettings((s) => s.tiles);
  const units = useSettings((s) => s.units);
  const setHero = useSettings((s) => s.setHero);
  const setTile = useSettings((s) => s.setTile);
  const supportedList = useConnection((s) => s.supported);
  const supported = useMemo(() => new Set(supportedList), [supportedList]);
  const current = slot === 'hero' ? hero : tiles[Number(slot)];
  const byId = useMemo(() => Object.fromEntries(CHANNELS.map((c) => [c.id, c])) as Record<ChannelId, ChannelDef>, []);

  const choose = (id: ChannelId) => {
    tap();
    if (slot === 'hero') setHero(id);
    else setTile(Number(slot), id);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[type.headline, { color: colors.text }]}>{slot === 'hero' ? 'Main gauge' : `Tile ${Number(slot) + 1}`}</Text>
      <Text style={[type.callout, { color: colors.textSecondary, marginTop: 2 }]}>
        {supported.size > 0 ? 'Values your car does not report are dimmed.' : 'Connect an adapter to see which values your car reports.'}
      </Text>
      {GROUPS.map((group) => (
        <View key={group.title} style={{ gap: space.sm, marginTop: space.xl }}>
          <Label>{group.title}</Label>
          <View style={styles.chips}>
            {group.ids.map((id) => {
              const channel = byId[id];
              const active = id === current;
              const available = channelSupported(channel, supported);
              return (
                <Pressable
                  key={id}
                  onPress={() => choose(id)}
                  accessibilityRole="button"
                  accessibilityLabel={channel.label}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && { backgroundColor: colors.surfacePressed },
                    !available && { opacity: 0.4 },
                  ]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                      {channel.label}
                    </Text>
                    <Text style={[type.caption, { color: colors.textTertiary }]}>{convertChannel(channel, 0, units).unit || ' '}</Text>
                  </View>
                  {active ? <Icon name="check" size={15} color={colors.accentStrong} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl },
  chips: { gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
