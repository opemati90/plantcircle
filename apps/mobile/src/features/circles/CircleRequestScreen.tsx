import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, FloatingActionBar, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey, useCircle, useJoinCircle } from '../plans/queries';

const ANSWER_MAX = 300;

/**
 * Request to join, as the CircleRequest design has it: the Circle's line and place, that its
 * posts and Plans appear once approved, how many are in it and who moderates it, the moderators'
 * question with a 300-character answer, and the bar ("Free to join · We'll notify you").
 */
export default function CircleRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const circle = useCircle(id);
  const join = useJoinCircle(id);
  const [answer, setAnswer] = useState('');
  const [key] = useState(newIdempotencyKey);
  const length = Array.from(answer.trim()).length;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/circle/[id]', params: { id } });
  };
  const header = <ScreenHeader backLabel={t('common.back')} onBack={back} />;

  if (session === null) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('people.signedOut.title')}
          text={t('circles.signUpLead')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({
                  pathname: '/sign-up',
                  params: { next: `/circle/${id}/request` },
                });
              }}
            />
          }
        />
      </View>
    );
  }
  if (circle.isPending || session === undefined) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        {header}
        <View style={styles.content}>
          <Skeleton width="100%" height={200} radius={radius.card} />
        </View>
      </View>
    );
  }
  if (circle.isError) {
    const missing = errorCode(circle.error) === 'not_found';
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          title={missing ? t('circles.notFound') : t('errors.serverTitle')}
          text={missing ? t('errors.notFoundText') : t('errors.serverText')}
          actions={
            missing ? (
              <Button label={t('common.back')} onPress={back} />
            ) : (
              <Button label={t('common.retry')} onPress={() => void circle.refetch()} />
            )
          }
        />
      </View>
    );
  }

  const data = circle.data;
  const where = data.isGlobal ? t('circles.globalWhere') : (data.city ?? '');
  // Already in, already waiting, or no approval needed: the Circle page says what to do.
  if (
    data.viewerRole !== null ||
    data.viewerRequestPending ||
    data.access !== 'request' ||
    join.isSuccess
  ) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          title={data.viewerRole !== null ? t('circles.member') : t('circles.requestSentTitle')}
          text={
            data.viewerRole !== null
              ? t('circles.memberLead')
              : t('circles.requestSentText', { name: data.name })
          }
          actions={
            <Button
              label={t('circles.openCircle')}
              onPress={() => {
                router.replace({ pathname: '/circle/[id]', params: { id } });
              }}
            />
          }
        />
      </View>
    );
  }

  const send = () => {
    if (length > ANSWER_MAX) return;
    join.mutate({ answer: answer.trim() || null, key });
  };

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]}
      >
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(13, 'semibold', { color: color.secondary, tracking: 0.6 })}
        >
          {`${data.isGlobal ? t('circles.eyebrowGlobal') : t('circles.eyebrowLocal')} · ${t('circles.approvalNeeded')}`.toUpperCase()}
        </Text>
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {data.name}
        </Text>
        {where ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'regular', { color: color.secondary })}
          >
            {where}
          </Text>
        ) : null}
        {data.tagline ? (
          <Text maxFontSizeMultiplier={2.0} style={type(17, 'regular', { leading: 1.5 })}>
            {data.tagline}
          </Text>
        ) : null}

        <View style={styles.card}>
          <Text maxFontSizeMultiplier={2.0} style={type(16, 'semibold')}>
            {t('circles.privateTitle')}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
          >
            {t('circles.privateText')}
          </Text>
        </View>

        <View style={styles.facts}>
          <Text maxFontSizeMultiplier={2.0} style={type(16, 'semibold')}>
            {t('circles.memberCount', { count: data.memberCount })}
          </Text>
          {data.ownerName ? (
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'regular', { color: color.secondary })}
            >
              {t('circles.moderatedBy', { name: data.ownerName })}
            </Text>
          ) : null}
        </View>

        <Text
          maxFontSizeMultiplier={2.0}
          style={[
            type(13, 'semibold', { color: color.secondary, tracking: 0.4 }),
            styles.askLabel,
          ]}
        >
          {t('circles.moderatorsAsk').toUpperCase()}
        </Text>
        <Text maxFontSizeMultiplier={1.6} style={type(18, 'semibold')}>
          {data.joinQuestion ?? t('circles.requestLead')}
        </Text>
        <TextInput
          maxFontSizeMultiplier={2.0}
          accessibilityLabel={data.joinQuestion ?? t('circles.answerLabel')}
          value={answer}
          onChangeText={setAnswer}
          multiline
          textAlignVertical="top"
          style={[styles.answer, type(17, 'regular', { leading: 1.4 })]}
        />
        <Text
          maxFontSizeMultiplier={2.0}
          style={[
            type(13, 'regular', {
              color: length > ANSWER_MAX ? color.danger : color.secondary,
            }),
            styles.counter,
          ]}
        >
          {`${length} / ${ANSWER_MAX}`}
        </Text>
        {join.isError ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(15, 'regular', { color: color.danger })}
          >
            {t('circles.genericError')}
          </Text>
        ) : null}
      </ScrollView>
      <FloatingActionBar style={styles.bar}>
        <View style={styles.barText}>
          <Text maxFontSizeMultiplier={2.0} style={type(16, 'semibold')}>
            {t('circles.freeToJoin')}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary })}
          >
            {t('circles.notifyYou')}
          </Text>
        </View>
        <Button
          label={t('circles.requestJoin')}
          disabled={length > ANSWER_MAX}
          loading={join.isPending}
          onPress={send}
        />
      </FloatingActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 10 },
  card: {
    gap: 4,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: color.fill,
    marginTop: 8,
  },
  facts: {
    gap: 3,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  askLabel: { marginTop: 14 },
  answer: {
    minHeight: 120,
    padding: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  counter: { alignSelf: 'flex-end' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 10,
    paddingLeft: 20,
    paddingRight: 10,
    minHeight: size.touchMin,
  },
  barText: { flex: 1, minWidth: 0, gap: 1 },
});
