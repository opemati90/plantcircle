import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { Toggle } from '../../components/Toggle';
import { useScreenInsets } from '../../components/useScreenInsets';
import type { SettingsPatch, UserSettings } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { useSettings, useUpdateSettings } from './queries';

type Row =
  | { key: keyof SettingsPatch & keyof UserSettings; title: string; note: string }
  | { key: 'always'; title: string; note: string };

/**
 * Notifications, as the NotifSettings design has it: Plans, People and Privacy groups of switch
 * rows. Changes and cancellations cannot be turned off. Each switch saves on its own.
 */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const settings = useSettings();
  const update = useUpdateSettings();
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: t('account.groupPlans'),
      rows: [
        {
          key: 'notifReminders',
          title: t('account.remindersTitle'),
          note: t('account.remindersNote'),
        },
        {
          key: 'notifWaitlist',
          title: t('account.waitlistTitle'),
          note: t('account.waitlistNote'),
        },
        { key: 'always', title: t('account.changesTitle'), note: t('account.changesNote') },
      ],
    },
    {
      title: t('account.groupPeople'),
      rows: [
        { key: 'notifDirect', title: t('account.directTitle'), note: t('account.directNote') },
        { key: 'notifChats', title: t('account.chatsTitle'), note: t('account.chatsNote') },
      ],
    },
    {
      title: t('account.groupPrivacy'),
      rows: [
        {
          key: 'quietHours',
          title: t('account.quietTitle', {
            start: pad(settings.data?.quietStart ?? 22),
            end: pad(settings.data?.quietEnd ?? 8),
          }),
          note: t('account.quietNote'),
        },
        { key: 'lockScreenText', title: t('account.lockTitle'), note: t('account.lockNote') },
      ],
    },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel={t('common.back')} onBack={back} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('profile.notifications')}
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
                  router.push({
                    pathname: '/sign-up',
                    params: { next: '/profile/notifications' },
                  });
                }}
              />
            }
          />
        ) : settings.isPending ? (
          <Skeleton width="100%" height={220} radius={radius.card} />
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
          groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text
                accessibilityRole="header"
                style={type(13, 'semibold', { color: color.secondary, tracking: 0.5 })}
              >
                {group.title.toUpperCase()}
              </Text>
              <View style={styles.card}>
                {group.rows.map((row, index) => (
                  <View
                    key={row.key + row.title}
                    style={[styles.row, index > 0 && styles.rowBorder]}
                  >
                    {row.key === 'always' ? (
                      <View style={styles.rowHead}>
                        <View style={styles.grow}>
                          <Text style={type(17, 'semibold')}>{row.title}</Text>
                          <Text
                            style={type(14, 'regular', {
                              color: color.secondary,
                              leading: 1.45,
                            })}
                          >
                            {row.note}
                          </Text>
                        </View>
                        <Text
                          style={[
                            type(12, 'bold', { color: color.brand, tracking: 0.4 }),
                            styles.pill,
                          ]}
                        >
                          {t('account.alwaysOn').toUpperCase()}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Toggle
                          label={row.title}
                          value={Boolean(settings.data[row.key])}
                          disabled={update.isPending}
                          onValueChange={(v) => {
                            update.mutate({ [row.key]: v });
                          }}
                        />
                        <Text
                          style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
                        >
                          {row.note}
                        </Text>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
        {update.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('account.error')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 20 },
  group: { gap: 8 },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    paddingHorizontal: 16,
  },
  row: { paddingVertical: 12, gap: 4 },
  rowBorder: { borderTopWidth: 1, borderTopColor: extra.cardBorder },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: size.touchMin },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: color.brandTint,
    overflow: 'hidden',
  },
});
