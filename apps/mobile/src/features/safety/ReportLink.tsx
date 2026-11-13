import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { color, size, type } from '../../components/theme';
import type { ReportTarget } from '../../lib/backend/types';

/**
 * "Report this Plan" and its siblings: the quiet link at the end of a page that opens the report
 * flow for that thing. `userId` names the person behind it when known, so the receipt can offer
 * to block them too.
 */
export function ReportLink({
  targetType,
  targetId,
  name,
  userId,
}: {
  targetType: Exclude<ReportTarget, 'app'>;
  targetId: string;
  name: string;
  userId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const label = t(`safety.report.${targetType}`);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => {
        router.push({
          pathname: '/report',
          params: { type: targetType, id: targetId, name, ...(userId ? { userId } : {}) },
        });
      }}
      style={styles.link}
    >
      <Text style={type(15, 'semibold', { color: color.secondary })}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: size.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
