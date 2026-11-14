import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { BottomSheet } from '../../components/parts';
import { color, radius, size, type } from '../../components/theme';
import {
  NO_FILTERS,
  PRICE_OPTIONS,
  WHEN_OPTIONS,
  WHERE_OPTIONS,
  type PlanFilters,
} from './exploreRules';

/** The Filters sheet, as the design has it: When, Where, Price as segmented choices, Reset, Show results. */
export function FiltersSheet({
  open,
  draft,
  resultCount,
  onChange,
  onClose,
  onApply,
}: {
  open: boolean;
  draft: PlanFilters;
  resultCount: number;
  onChange: (next: PlanFilters) => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const group = <K extends keyof PlanFilters>(key: K, options: readonly PlanFilters[K][]) => (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={type(15, 'semibold')}>
        {t(`explore.filters.${key}` as 'explore.filters.when')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t(`explore.filters.${key}` as 'explore.filters.when')}
        style={styles.segments}
      >
        {options.map((option, index) => {
          const selected = draft[key] === option;
          const pick = (next: PlanFilters[K]) => {
            onChange({ ...draft, [key]: next });
          };
          // On the web a radio group moves with the arrow keys and Space, like a native one.
          const web =
            Platform.OS === 'web'
              ? {
                  onKeyDown: (event: { key: string; preventDefault: () => void }) => {
                    const step =
                      event.key === 'ArrowRight' || event.key === 'ArrowDown'
                        ? 1
                        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                          ? -1
                          : 0;
                    if (step !== 0) {
                      event.preventDefault();
                      pick(options[(index + step + options.length) % options.length] ?? option);
                    } else if (event.key === ' ') {
                      event.preventDefault();
                      pick(option);
                    }
                  },
                }
              : {};
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                pick(option);
              }}
              style={[styles.segment, selected && styles.segmentSelected]}
              {...(web as object)}
            >
              <Text
                style={type(14, selected ? 'semibold' : 'medium', {
                  color: selected ? color.ink : color.secondary,
                })}
              >
                {t(
                  `explore.filters.${key}Options.${option}` as 'explore.filters.whenOptions.any',
                )}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
  return (
    <BottomSheet open={open} onClose={onClose} title={t('explore.filters.title')}>
      <View style={styles.body}>
        {group('when', WHEN_OPTIONS)}
        {group('where', WHERE_OPTIONS)}
        {group('price', PRICE_OPTIONS)}
        <Text style={type(13, 'regular', { color: color.secondary })}>
          {t('explore.filters.languageLater')}
        </Text>
        <View style={styles.buttons}>
          <View style={styles.grow}>
            <Button
              variant="outline"
              label={t('explore.filters.reset')}
              onPress={() => {
                onChange(NO_FILTERS);
              }}
            />
          </View>
          <View style={styles.grow}>
            <Button
              label={t('explore.filters.show', { count: resultCount })}
              onPress={onApply}
            />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18 },
  group: { gap: 8 },
  segments: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: color.fill,
  },
  segment: {
    flex: 1,
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 6,
  },
  segmentSelected: { backgroundColor: color.surface, borderRadius: radius.control },
  buttons: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
});
