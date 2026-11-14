import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { Toggle } from '../../components/Toggle';
import { useScreenInsets } from '../../components/useScreenInsets';
import { safeNextPath } from '../auth/authRules';
import { useAuth } from '../auth/useAuth';
import { useSettings, useUpdateSettings } from './queries';

const PRIVACY_URL = 'https://plantcircle.app/legal/privacy';

/**
 * Your privacy choices, as the PrivacyChoices design has it: what is needed is always on, the two
 * optional ones start off, and "Only needed" carries the same weight as "Save choices". Shown once
 * after sign-up (`next` says where to go after) and again from Profile → Privacy.
 */
export default function PrivacyChoicesScreen() {
  const { next: rawNext, from } = useLocalSearchParams<{ next?: string; from?: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const settings = useSettings();
  const update = useUpdateSettings();
  // The switches start from the saved choices once those are known, then follow the person.
  const [draft, setDraft] = useState<{ analytics: boolean; personal: boolean } | null>(null);
  const analytics = draft?.analytics ?? settings.data?.analyticsConsent ?? false;
  const personal = draft?.personal ?? settings.data?.personalisationConsent ?? false;
  const setAnalytics = (v: boolean) => {
    setDraft({ analytics: v, personal });
  };
  const setPersonal = (v: boolean) => {
    setDraft({ analytics, personal: v });
  };
  const onboarding = from !== 'profile';
  const next = safeNextPath(rawNext);

  // Already answered (a later sign-in): straight on to where the person was going.
  useEffect(() => {
    if (onboarding && settings.data?.consentDecidedAt) router.dismissTo(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding, settings.data?.consentDecidedAt]);
  const [linkFailed, setLinkFailed] = useState(false);

  const leave = () => {
    // After sign-up the screen that asked for sign-in is still below; go back to it, not onto a copy.
    if (onboarding) router.dismissTo(next);
    else if (router.canGoBack()) router.back();
    else router.replace('/profile/privacy');
  };
  const save = (analyticsConsent: boolean, personalisationConsent: boolean) => {
    update.mutate({ analyticsConsent, personalisationConsent }, { onSuccess: leave });
  };
  const header = onboarding ? null : (
    <ScreenHeader backLabel={t('common.back')} onBack={leave} />
  );

  if (session === null) {
    return (
      <View style={styles.screen}>
        <ScreenHeader
          backLabel={t('common.back')}
          onBack={() => {
            router.replace('/home');
          }}
        />
        <InlineState
          title={t('people.signedOut.title')}
          text={t('account.signedOut')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/privacy-choices' } });
              }}
            />
          }
        />
      </View>
    );
  }

  const rows = [
    {
      title: t('account.neededTitle'),
      note: t('account.neededNote'),
      control: 'always' as const,
    },
    {
      title: t('account.analyticsTitle'),
      note: t('account.analyticsNote'),
      control: 'analytics' as const,
    },
    {
      title: t('account.personalTitle'),
      note: t('account.personalNote'),
      control: 'personal' as const,
    },
  ];

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: onboarding ? insets.headerTop + 24 : 8,
            paddingBottom: 40 + insets.bottom,
          },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('account.privacyChoicesTitle')}
        </Text>
        <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>
          {t('account.privacyChoicesLead')}
        </Text>

        {settings.isPending ? (
          <Skeleton width="100%" height={200} radius={radius.card} />
        ) : settings.isError ? (
          <InlineState
            title={t('errors.serverTitle')}
            text={t('errors.serverText')}
            action={
              <Button
                variant="outline"
                label={t('common.retry')}
                onPress={() => void settings.refetch()}
              />
            }
          />
        ) : (
          <View style={styles.card}>
            {rows.map((row, index) => (
              <View key={row.control} style={[styles.row, index > 0 && styles.rowBorder]}>
                {row.control === 'always' ? (
                  <View style={styles.rowText}>
                    <View style={styles.rowHead}>
                      <Text style={[type(17, 'semibold'), styles.grow]}>{row.title}</Text>
                      <Text
                        style={[
                          type(12, 'bold', { color: color.brand, tracking: 0.4 }),
                          styles.pill,
                        ]}
                      >
                        {t('account.alwaysOn').toUpperCase()}
                      </Text>
                    </View>
                    <Text
                      style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
                    >
                      {row.note}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.rowText}>
                    <Toggle
                      label={row.title}
                      value={row.control === 'analytics' ? analytics : personal}
                      disabled={update.isPending}
                      onValueChange={(v) => {
                        if (row.control === 'analytics') setAnalytics(v);
                        else setPersonal(v);
                      }}
                    />
                    <Text
                      style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
                    >
                      {row.note}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        <Pressable
          accessibilityRole="link"
          onPress={() => {
            Linking.openURL(PRIVACY_URL)
              .then(() => {
                setLinkFailed(false);
              })
              .catch(() => {
                setLinkFailed(true);
              });
          }}
          style={styles.link}
        >
          <Text style={type(15, 'semibold', { color: color.brand })}>
            {t('account.readPrivacy')}
          </Text>
        </Pressable>

        {linkFailed ? (
          <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
            {t('account.linkError', { url: PRIVACY_URL })}
          </Text>
        ) : null}
        {update.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('account.error')}
          </Text>
        ) : null}

        <View style={styles.buttons}>
          <View style={styles.grow}>
            <Button
              variant="outline"
              label={t('account.onlyNeeded')}
              disabled={settings.isPending || update.isPending}
              onPress={() => {
                save(false, false);
              }}
            />
          </View>
          <View style={styles.grow}>
            <Button
              label={t('account.saveChoices')}
              disabled={settings.isPending}
              loading={update.isPending}
              onPress={() => {
                save(analytics, personal);
              }}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, gap: 14 },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  row: { paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: extra.cardBorder },
  rowText: { gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: size.touchMin },
  grow: { flex: 1, minWidth: 0 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.brandTint,
    overflow: 'hidden',
  },
  link: { minHeight: size.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  buttons: { flexDirection: 'row', gap: 10, paddingTop: 8 },
});
