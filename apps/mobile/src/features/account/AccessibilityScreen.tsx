import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';

/** Reports about the app itself carry this id; the database accepts the pair ('app', nil). */
export const APP_TARGET_ID = '00000000-0000-0000-0000-000000000000';
const RIGHTS_URL = 'https://plantcircle.app/legal/accessibility';
/** [date] until the first audit is logged; listed in docs/16-open-questions.md. */
const LAST_CHECKED = '[date]';

/**
 * The accessibility statement, as the AccessibilityStatement design has it: the standard we hold
 * to, the known gaps, how to report a problem, and where the enforcement body is.
 */
export default function AccessibilityScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const [linkFailed, setLinkFailed] = useState(false);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };
  const gaps = [
    { title: t('account.gapWaitlistTitle'), note: t('account.gapWaitlistNote') },
    { title: t('account.gapUploadsTitle'), note: t('account.gapUploadsNote') },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel={t('common.back')} onBack={back} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('profile.accessibility')}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}
        >
          {t('account.a11yLead')}
        </Text>

        <View style={styles.card}>
          <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold')}>
            {t('account.a11yStandard')}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary })}
          >
            {t('account.a11yChecked', { date: LAST_CHECKED })}
          </Text>
        </View>

        {gaps.map((gap) => (
          <View key={gap.title} style={styles.gap}>
            <Text maxFontSizeMultiplier={2.0} style={type(16, 'semibold')}>
              {gap.title}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
            >
              {gap.note}
            </Text>
          </View>
        ))}

        <View style={styles.card}>
          <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold')}>
            {t('account.a11yProblemTitle')}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
          >
            {t('account.a11yProblemNote')}
          </Text>
          <Button
            variant="outline"
            label={t('account.a11yReport')}
            onPress={() => {
              router.push({
                pathname: '/report/details',
                params: {
                  type: 'app',
                  id: APP_TARGET_ID,
                  name: 'PlantCircle',
                  category: 'accessibility',
                },
              });
            }}
          />
        </View>

        <Pressable
          accessibilityRole="link"
          onPress={() => {
            Linking.openURL(RIGHTS_URL)
              .then(() => {
                setLinkFailed(false);
              })
              .catch(() => {
                setLinkFailed(true);
              });
          }}
          style={styles.link}
        >
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'semibold', { color: color.brand })}
          >
            {t('account.a11yRights')}
          </Text>
        </Pressable>
        {linkFailed ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(14, 'regular', { color: color.danger })}
          >
            {t('account.linkError', { url: RIGHTS_URL })}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 14 },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  gap: {
    gap: 3,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  link: { minHeight: size.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
