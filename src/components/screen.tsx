import { forwardRef, type ReactNode } from 'react';
import { Platform, ScrollView, type ScrollViewProps, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space, type } from '@/theme';

type Props = ScrollViewProps & { children: ReactNode; padded?: boolean };

export const Screen = forwardRef<ScrollView, Props>(function Screen(
  { children, contentContainerStyle, padded = true, ...rest },
  ref,
) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        {
          paddingTop: Platform.OS === 'ios' ? space.sm : insets.top + space.md,
          paddingBottom: Platform.OS === 'ios' ? space.xxxl : insets.bottom + 96,
        },
        padded && { paddingHorizontal: space.lg },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      indicatorStyle="white"
      {...rest}>
      {children}
    </ScrollView>
  );
});

export function Header({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Text style={[type.label, { color: colors.textTertiary }]}>{eyebrow}</Text> : null}
        <Text style={[type.title, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.lg,
    minHeight: 52,
  },
});
