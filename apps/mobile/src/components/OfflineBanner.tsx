import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { OfflineIcon } from './icons';
import { type } from './theme';
import { isToday, localTime, shortDate } from '../lib/dates';
import { currentLanguage } from '../lib/i18n';

/**
 * The black offline bar from the Offline design: "You're offline · saved at HH:MM". Shown over
 * cached content; the screen below stays readable and its buttons say why they wait.
 */
export function OfflineBanner({ savedAt }: { savedAt: number | null }) {
  const { t } = useTranslation();
  const iso = savedAt ? new Date(savedAt).toISOString() : null;
  const label = iso
    ? t('offline.bannerSaved', {
        time: isToday(iso, new Date())
          ? localTime(iso)
          : `${shortDate(iso, Intl.DateTimeFormat(currentLanguage()).resolvedOptions().timeZone)} ${localTime(iso)}`,
      })
    : t('offline.banner');
  return (
    <View role="status" accessibilityLiveRegion="polite" style={styles.bar}>
      <OfflineIcon size={16} strokeWidth={2} color="#FFFFFF" />
      <Text maxFontSizeMultiplier={2.0} style={type(14, 'semibold', { color: '#FFFFFF' })}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 16,
    backgroundColor: '#111111',
  },
});
