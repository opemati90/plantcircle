import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, extra, radius, size, type } from './theme';

/** A number with minus and plus. Each step is a 44pt target; the ends are disabled, not silent. */
export function Stepper({
  value,
  min,
  max,
  label,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (next: number) => void;
}) {
  return (
    <View accessibilityLabel={label} style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        disabled={value <= min}
        onPress={() => {
          onChange(Math.max(min, value - 1));
        }}
        style={[styles.button, value <= min && styles.disabled]}
      >
        <Text style={type(20, 'semibold', { color: color.ink })}>−</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={type(17, 'semibold', { tracking: -0.3 })}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        disabled={value >= max}
        onPress={() => {
          onChange(Math.min(max, value + 1));
        }}
        style={[styles.button, value >= max && styles.disabled]}
      >
        <Text style={type(20, 'semibold', { color: color.ink })}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    width: size.touchMin,
    height: size.touchMin,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
