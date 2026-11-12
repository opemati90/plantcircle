import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from '../../components/icons';
import { DateTile } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import type { Plan } from '../../lib/backend/types';

export type PillTone = 'positive' | 'neutral' | 'attention';

export interface StatusPill {
  label: string;
  tone: PillTone;
}

const TONE: Record<PillTone, { background: string; text: string }> = {
  positive: { background: color.brandTint, text: color.brand },
  neutral: { background: color.fill, text: color.secondary },
  attention: { background: color.warningTint, text: color.warning },
};

/** One Plan in a list: date tile, title, when and where, and an optional status chip. */
export function PlanListItem({
  plan,
  when,
  pill,
  onPress,
}: {
  plan: Plan;
  when: string;
  pill?: StatusPill;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.row}>
      <View style={styles.top}>
        <DateTile iso={plan.startsAt} timeZone={plan.timezone} />
        <View style={styles.text}>
          <Text style={type(17, 'semibold', { tracking: -0.3 })}>{plan.title}</Text>
          <Text style={type(15, 'regular', { color: color.secondary })}>{when}</Text>
        </View>
        <ChevronRightIcon size={16} strokeWidth={2.4} color={color.borderControl} />
      </View>
      {pill ? (
        <View style={styles.pills}>
          <View style={[styles.pill, { backgroundColor: TONE[pill.tone].background }]}>
            <Text style={type(14, 'semibold', { color: TONE[pill.tone].text })}>
              {pill.label}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: size.touchMin - 14,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
});
