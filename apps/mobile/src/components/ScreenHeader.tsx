import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeftIcon } from './icons';
import { color, radius, type } from './theme';
import { useScreenInsets } from './useScreenInsets';

/**
 * The header of a form or detail screen, as the design spec sets it: a back circle (44) on its own
 * row below the status bar, then the screen's own title. The caption, when given, sits under the
 * circle (for example "Step 2 of 6") and never shares the status bar's row.
 */
export function ScreenHeader({
  backLabel,
  onBack,
  caption,
}: {
  backLabel: string;
  onBack: () => void;
  caption?: string;
}) {
  const insets = useScreenInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.headerTop }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        hitSlop={8}
        style={styles.back}
      >
        <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
      </Pressable>
      {caption ? (
        <Text style={type(14, 'semibold', { color: color.secondary })}>{caption}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingBottom: 8, gap: 12 },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
