import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius, space, type } from '@/theme';

import { Icon } from './icon';
import type { IconName } from './icon-names';
import { PressableScale } from './pressable-scale';

export function tap() {
  Haptics.selectionAsync().catch(() => undefined);
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function Label({ children, style, color }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string }) {
  return <Text style={[type.label, { color: color ?? colors.textTertiary }, style]}>{children}</Text>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <Label>{title}</Label>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={action}>
          <Text style={[type.caption, { color: colors.accentStrong }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: '#FFFFFF', border: 'transparent' },
    secondary: { bg: colors.surfaceRaised, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.accentStrong, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  }[variant];
  return (
    <PressableScale
      onPress={() => {
        if (disabled || loading) return;
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={compact ? 15 : 17} color={palette.fg} /> : null}
          <Text style={[compact ? type.callout : type.bodyStrong, { color: palette.fg, fontFamily: fonts.semibold }]}>{title}</Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tint = colors.text,
  background = colors.surfaceRaised,
  size = 40,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tint?: string;
  background?: string;
  size?: number;
}) {
  return (
    <PressableScale
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      <Icon name={icon} size={size * 0.45} color={tint} />
    </PressableScale>
  );
}

export function Row({
  icon,
  iconTint = colors.textSecondary,
  title,
  subtitle,
  value,
  onPress,
  chevron,
  toggle,
  onToggle,
  destructive,
  last,
}: {
  icon?: IconName;
  iconTint?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  toggle?: boolean;
  onToggle?: (value: boolean) => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const content = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={17} color={destructive ? colors.danger : iconTint} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[type.bodyStrong, { color: destructive ? colors.danger : colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[type.callout, { color: colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {toggle !== undefined ? (
        <Switch
          value={toggle}
          onValueChange={(v) => {
            tap();
            onToggle?.(v);
          }}
          trackColor={{ true: colors.accent, false: colors.track }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.track}
        />
      ) : null}
      {chevron ? <Icon name="chevronRight" size={13} color={colors.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      android_ripple={{ color: colors.surfacePressed }}
      style={({ pressed }) => [pressed && { backgroundColor: colors.surfacePressed }]}>
      {content}
    </Pressable>
  );
}

export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.group, style]}>{children}</View>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (active) return;
              tap();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[type.callout, { color: active ? colors.text : colors.textSecondary, fontFamily: fonts.semibold }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({ label, tint, background, icon }: { label: string; tint: string; background: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      {icon ? <Icon name={icon} size={11} color={tint} /> : <View style={[styles.dot, { backgroundColor: tint }]} />}
      <Text style={[type.caption, { color: tint, fontFamily: fonts.semibold }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.textSecondary} />
      </View>
      <Text style={[type.headline, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>{body}</Text>
      {action}
    </View>
  );
}

export function Notice({ tone = 'info', title, body }: { tone?: 'info' | 'warn' | 'danger'; title: string; body: string }) {
  const tint = tone === 'warn' ? colors.warn : tone === 'danger' ? colors.danger : colors.accentStrong;
  const bg = tone === 'warn' ? colors.warnSoft : tone === 'danger' ? colors.dangerSoft : colors.accentSoft;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Icon name={tone === 'info' ? 'info' : 'warning'} size={16} color={tint} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyStrong, { color: colors.text }]}>{title}</Text>
        <Text style={[type.callout, { color: colors.textSecondary }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardPadded: { padding: space.lg },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  button: {
    height: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonCompact: { height: 38, paddingHorizontal: space.md, borderRadius: radius.sm },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    minHeight: 54,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 1 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: { flex: 1, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surfacePressed },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  notice: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.md, alignItems: 'flex-start' },
});
