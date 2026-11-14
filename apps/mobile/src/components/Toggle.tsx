import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, size, type } from './theme';

/**
 * A labelled on/off switch. The whole row is the one control, so assistive tech gets one switch
 * with its state and name, and the drawn track is hidden from it.
 */
export function Toggle({
  label,
  note,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  /** A line under the label; part of the switch's accessible description. */
  note?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={note}
      aria-checked={value}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => {
        onValueChange(!value);
      }}
      style={styles.row}
    >
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold', { tracking: -0.3 })}>
          {label}
        </Text>
        {note ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary })}
          >
            {note}
          </Text>
        ) : null}
      </View>
      <View
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[styles.track, value && styles.trackOn]}
      >
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.touchMin },
  text: { flex: 1, minWidth: 0, gap: 2 },
  track: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    justifyContent: 'center',
    backgroundColor: color.fill,
  },
  trackOn: { backgroundColor: color.brand },
  knob: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  knobOn: { transform: [{ translateX: 20 }] },
});
