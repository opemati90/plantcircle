import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { BottomSheet, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { shortWhen } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../plans/queries';
import { useDeleteAccount, useRequestDataExport, useSettings } from './queries';

/**
 * Account and data, as the DeleteAccount design has it: a copy of your data on request, then what
 * deleting removes, releases and keeps, and the two-step delete ("Delete for good?").
 */
export default function AccountScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const settings = useSettings();
  const exportRequest = useRequestDataExport();
  const remove = useDeleteAccount();
  const [confirm, setConfirm] = useState(false);
  const [exportKey] = useState(newIdempotencyKey);
  const [deleteKey] = useState(newIdempotencyKey);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };

  const facts = [
    { title: t('account.removed'), note: t('account.removedNote') },
    { title: t('account.released'), note: t('account.releasedNote') },
    { title: t('account.kept'), note: t('account.keptNote') },
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
          {t('profile.accountData')}
        </Text>
        {session === null ? (
          <InlineState
            title={t('people.signedOut.title')}
            text={t('account.signedOut')}
            action={
              <Button
                variant="outline"
                label={t('home.signIn')}
                onPress={() => {
                  router.push({ pathname: '/sign-up', params: { next: '/profile/account' } });
                }}
              />
            }
          />
        ) : (
          <>
            <View style={styles.section}>
              <Text
                maxFontSizeMultiplier={2.0}
                accessibilityRole="header"
                style={type(13, 'semibold', { color: color.secondary, tracking: 0.5 })}
              >
                {t('account.yourData').toUpperCase()}
              </Text>
              <View style={styles.card}>
                <View style={styles.rowHead}>
                  <View style={styles.grow}>
                    <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold')}>
                      {t('account.downloadTitle')}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
                    >
                      {settings.isPending
                        ? t('common.loading')
                        : settings.data?.exportRequestedAt
                          ? t('account.downloadRequested', {
                              when: shortWhen(settings.data.exportRequestedAt, 'UTC'),
                            })
                          : t('account.downloadNote')}
                    </Text>
                  </View>
                  {settings.isPending ? (
                    <Skeleton width={90} height={44} radius={radius.pill} />
                  ) : (
                    <Button
                      variant="outline"
                      label={
                        settings.data?.exportRequestedAt
                          ? t('account.requested')
                          : t('account.request')
                      }
                      disabled={
                        Boolean(settings.data?.exportRequestedAt) || exportRequest.isPending
                      }
                      loading={exportRequest.isPending}
                      onPress={() => {
                        exportRequest.mutate(exportKey);
                      }}
                    />
                  )}
                </View>
                {exportRequest.isError || settings.isError ? (
                  <Text
                    maxFontSizeMultiplier={2.0}
                    role="alert"
                    style={type(14, 'regular', { color: color.danger })}
                  >
                    {t('account.error')}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text
                maxFontSizeMultiplier={2.0}
                accessibilityRole="header"
                style={type(13, 'semibold', { color: color.secondary, tracking: 0.5 })}
              >
                {t('account.deleteTitle').toUpperCase()}
              </Text>
              <View style={styles.card}>
                {facts.map((fact, index) => (
                  <View key={fact.title} style={[styles.fact, index > 0 && styles.factBorder]}>
                    <Text maxFontSizeMultiplier={2.0} style={type(16, 'semibold')}>
                      {fact.title}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
                    >
                      {fact.note}
                    </Text>
                  </View>
                ))}
              </View>
              <Button
                variant="outline"
                label={t('account.deleteButton')}
                onPress={() => {
                  setConfirm(true);
                }}
              />
            </View>
          </>
        )}
      </ScrollView>

      <BottomSheet
        open={confirm}
        onClose={() => {
          if (!remove.isPending) setConfirm(false);
        }}
        title={t('account.confirmTitle')}
        lead={t('account.confirmLead')}
      >
        <View style={styles.sheet}>
          {remove.isError ? (
            <Text
              maxFontSizeMultiplier={2.0}
              role="alert"
              style={type(14, 'regular', { color: color.danger })}
            >
              {t('account.error')}
            </Text>
          ) : null}
          <Button
            label={t('account.deleteButton')}
            loading={remove.isPending}
            onPress={() => {
              remove.mutate(deleteKey, {
                onSuccess: () => {
                  setConfirm(false);
                  router.replace('/welcome');
                },
              });
            }}
          />
          <Button
            variant="outline"
            label={t('account.keep')}
            disabled={remove.isPending}
            onPress={() => {
              setConfirm(false);
            }}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 24 },
  section: { gap: 10 },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 8,
  },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  fact: { paddingVertical: 12, gap: 2 },
  factBorder: { borderTopWidth: 1, borderTopColor: extra.cardBorder },
  sheet: { gap: 10 },
});
