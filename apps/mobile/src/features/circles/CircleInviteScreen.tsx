import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { EmptyState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { useAuth } from '../auth/useAuth';
import { themeLabel } from '../cooks/challengeThemes';
import { useCircleWeekPublic } from '../cooks/queries';
import { welcomePhoto } from '../plans/planImage';
import { useCircle } from '../plans/queries';
import { track, whenAnalyticsReady } from '../../lib/analytics';
import { circleMeta } from './circleRules';

/**
 * Where a Circle invite link lands (`/c/{id}`), with or without the app or an account: the
 * Circle, this week's theme, and one honest action (Join for open Circles, Ask to join for the
 * others). Joining itself happens on the Circle, under its usual rules. Invite-only, closed or
 * unknown Circles show nothing about themselves.
 */
export default function CircleInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useScreenInsets();
  const { session } = useAuth();
  const circle = useCircle(id);
  const week = useCircleWeekPublic(id);
  // Counted only for a member who said yes; a link opened before settings load waits for it.
  useEffect(() => {
    whenAnalyticsReady(() => {
      track('circle_invite_opened', {});
    });
  }, []);

  const findOthers = () => {
    router.replace('/explore');
  };

  if (circle.isPending || week.isPending) {
    return (
      <View
        role="status"
        aria-busy
        accessibilityLabel={t('common.loading')}
        style={styles.screen}
      >
        <Skeleton width="100%" height={420} radius={0} />
      </View>
    );
  }
  const gone =
    errorCode(circle.error) === 'not_found' ||
    errorCode(week.error) === 'not_found' ||
    circle.data?.access === 'invite';
  if (gone || circle.isError || week.isError) {
    return (
      <EmptyState
        title={gone ? t('circles.inviteGone') : t('errors.serverTitle')}
        text={gone ? t('circles.inviteGoneText') : t('errors.serverText')}
        actions={
          gone ? (
            <Button label={t('cooks.findCircle')} onPress={findOthers} />
          ) : (
            <Button
              label={t('common.retry')}
              onPress={() => {
                void circle.refetch();
                void week.refetch();
              }}
            />
          )
        }
      />
    );
  }

  const data = circle.data;
  const open = data.access === 'open';
  // Already in it: the link simply opens the Circle.
  const member = data.viewerRole !== null;
  const toCircle = () => {
    if (session) router.replace({ pathname: '/circle/[id]', params: { id: data.id } });
    else router.push({ pathname: '/sign-up', params: { next: `/circle/${data.id}` } });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <View style={styles.hero}>
          <Photo source={welcomePhoto} />
          <LinearGradient
            colors={[
              'rgba(0,0,0,0.25)',
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0.88)',
              'rgba(0,0,0,0.94)',
            ]}
            locations={[0, 0.25, 0.65, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroText, { paddingTop: insets.headerTop }]}>
            <Text
              maxFontSizeMultiplier={2.0}
              style={[type(13, 'bold', { color: extra.onInkMuted, tracking: 1 }), styles.upper]}
            >
              {t('circles.inviteEyebrow')}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              accessibilityRole="header"
              style={type(34, 'bold', { color: '#FFFFFF', tracking: -1.1, leading: 1.04 })}
            >
              {data.name}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={type(15, 'medium', { color: '#FFFFFF' })}>
              {circleMeta(t, data)}
            </Text>
            <View style={styles.theme}>
              <Text maxFontSizeMultiplier={2.0} style={type(15, 'semibold')}>
                {t('circles.inviteTheme', {
                  theme: themeLabel(t, week.data.theme, week.data.weekStart),
                })}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {data.tagline ? (
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(17, 'regular', { color: extra.bodyText, leading: 1.5 })}
            >
              {data.tagline}
            </Text>
          ) : null}
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}
          >
            {t('circles.inviteLead')}
          </Text>
          <Button
            label={
              member
                ? t('circles.inviteOpen')
                : open
                  ? t('circles.inviteJoin')
                  : t('circles.inviteAsk')
            }
            onPress={toCircle}
          />
          {member ? null : (
            <Button
              variant="outline"
              label={t('circles.inviteLook')}
              onPress={() => {
                router.replace({ pathname: '/circle/[id]', params: { id: data.id } });
              }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  hero: { minHeight: 420, backgroundColor: color.ink, justifyContent: 'flex-end' },
  heroText: { paddingHorizontal: 24, paddingBottom: 28, gap: 10 },
  upper: { textTransform: 'uppercase' },
  theme: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
  },
  body: { paddingHorizontal: 24, paddingTop: 24, gap: 14 },
});
