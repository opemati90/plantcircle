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
  progress,
}: {
  backLabel: string;
  onBack: () => void;
  caption?: string;
  /** Progress through a flow: filled segments out of the total, drawn beside the back circle. */
  progress?: { step: number; total: number };
}) {
  const insets = useScreenInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.headerTop }]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          hitSlop={8}
          style={styles.back}
        >
          <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
        </Pressable>
        {progress ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={caption}
            accessibilityValue={{ min: 0, max: progress.total, now: progress.step }}
            style={styles.segments}
          >
            {Array.from({ length: progress.total }, (_, index) => (
              <View
                key={index}
                style={[styles.segment, index < progress.step && styles.segmentDone]}
              />
            ))}
          </View>
        ) : null}
      </View>
      {caption && !progress ? (
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(14, 'semibold', { color: color.secondary })}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingBottom: 8, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  segments: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 3, borderRadius: 3, backgroundColor: color.fill },
  segmentDone: { backgroundColor: color.ink },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
