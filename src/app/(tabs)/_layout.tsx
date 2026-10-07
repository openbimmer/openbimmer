import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { colors } from '@/theme';

const android = Platform.OS === 'android';

export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={colors.accentStrong}
      minimizeBehavior="onScrollDown"
      backgroundColor={android ? colors.surface : undefined}
      indicatorColor={android ? colors.accentSoft : undefined}
      iconColor={android ? { default: colors.textSecondary, selected: colors.accentStrong } : undefined}
      labelStyle={android ? { default: { color: colors.textSecondary }, selected: { color: colors.text } } : undefined}
      rippleColor={android ? colors.accentSoft : undefined}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Garage</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'car', selected: 'car.fill' }} md="directions_car" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gauge.with.dots.needle.67percent" md="speed" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="logs">
        <NativeTabs.Trigger.Label>Logs</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.xyaxis.line" md="monitoring" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="diagnose">
        <NativeTabs.Trigger.Label>Diagnose</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="stethoscope" md="stethoscope" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
