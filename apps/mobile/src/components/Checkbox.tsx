import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from './icons';
import { color, size, type } from './theme';

type KeyEvent = { key: string; preventDefault: () => void };

/**
 * A drawn checkbox with the checkbox role, name and state, 44 pt tall. On the web, Space toggles
 * it like a native checkbox (the Pressable only handles Space for buttons).
 */
export function Checkbox({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const toggle = () => {
    if (!disabled) onValueChange(!value);
  };
  const web =
    Platform.OS === 'web'
      ? {
          onKeyDown: (event: KeyEvent) => {
            if (event.key === ' ') {
              event.preventDefault();
              toggle();
            }
          },
        }
      : {};
  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={value}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={toggle}
      style={styles.row}
      {...(web as object)}
    >
      <View style={[styles.box, value && styles.boxChecked]}>
        {value ? <CheckIcon size={16} strokeWidth={3} color="#FFFFFF" /> : null}
      </View>
      <Text style={[type(16, 'medium', { leading: 1.4 }), styles.label]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: size.touchMin,
    paddingVertical: 4,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: color.borderControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: color.ink, borderColor: color.ink },
  label: { flex: 1 },
});
