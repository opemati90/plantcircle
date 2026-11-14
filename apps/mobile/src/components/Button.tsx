import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { color, extra, radius, size, type } from './theme';

type Variant = 'primary' | 'outline' | 'ghost' | 'inverse';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ReactNode;
  disabled?: boolean;
  /** Replaces the label with a spinner and keeps the width. */
  loading?: boolean;
  /** Screen-reader name when it must say more than the visible label. */
  accessibilityLabel?: string;
  /** A toggle (upvote, follow): announced as pressed or not. */
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
}

const LABEL_COLOR: Record<Variant, string> = {
  primary: color.surface,
  outline: color.ink,
  ghost: color.secondary,
  inverse: color.ink,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  accessibilityLabel,
  pressed: toggled,
  style,
}: ButtonProps) {
  const inactive = Boolean(disabled) || Boolean(loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={inactive}
      aria-busy={Boolean(loading)}
      aria-pressed={toggled}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={LABEL_COLOR[variant]} />
      ) : (
        <>
          {icon}
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(
              variant === 'ghost' ? 15 : 17,
              variant === 'ghost' ? 'medium' : 'semibold',
              {
                color: LABEL_COLOR[variant],
                tracking: -0.2,
              },
            )}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

interface IconButtonProps {
  label: string;
  onPress: () => void;
  children: ReactNode;
  /** `glass` sits on photos. */
  variant?: 'fill' | 'glass';
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  label,
  onPress,
  children,
  variant = 'fill',
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        variant === 'glass' && styles.glass,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: size.buttonHeight,
    paddingHorizontal: 20,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: { backgroundColor: color.ink },
  inverse: { backgroundColor: color.surface },
  outline: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.borderControl,
  },
  ghost: { minHeight: size.touchMin, backgroundColor: 'transparent' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
  icon: {
    width: size.touchMin,
    height: size.touchMin,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    backgroundColor: extra.glassDark,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
});
