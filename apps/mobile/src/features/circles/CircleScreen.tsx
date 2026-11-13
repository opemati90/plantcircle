import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { ChevronLeftIcon } from '../../components/icons';
import { BottomSheet, EmptyState, InlineState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { Circle, CircleRequest } from '../../lib/backend/types';
import { shortWhen } from '../../lib/dates';
import { ProviderButtons } from '../auth/ProviderButtons';
import { useAuth } from '../auth/useAuth';
import { useRecipes } from '../learn/queries';
import { PlanListItem } from '../plans/PlanListItem';
import { welcomePhoto } from '../plans/planImage';
import {
  newIdempotencyKey,
  useCircle,
  useCircleRequests,
  useExplorePlans,
  useJoinCircle,
  useRespondToCircleRequest,
} from '../plans/queries';
import { circleMeta } from './circleRules';

const TABS = ['plans', 'posts', 'about'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY: Record<Tab, 'tabPlans' | 'tabPosts' | 'tabAbout'> = {
  plans: 'tabPlans',
  posts: 'tabPosts',
  about: 'tabAbout',
};

/**
 * A Circle, laid out as the design has it: a photo hero with the eyebrow, name, members and the
 * join action; then the one-line description and the Plans / Posts / About tabs.
 *
 * Circles carry no cover photo yet (docs/16-open-questions.md), so the hero uses the app's own
 * photo until covers exist.
 */
export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const circle = useCircle(id);
  const join = useJoinCircle(id);
  const canModerate =
    circle.data?.viewerRole === 'owner' || circle.data?.viewerRole === 'moderator';
  const requests = useCircleRequests(id, canModerate);
  const respond = useRespondToCircleRequest();
  const [tab, setTab] = useState<Tab>('plans');
  const [asking, setAsking] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [answer, setAnswer] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [decisionKeys, setDecisionKeys] = useState<Record<string, string>>({});

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/explore');
  };

  if (circle.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        <Skeleton width="100%" height={360} radius={0} />
      </View>
    );
  }
  if (circle.isError) {
    const missing = errorCode(circle.error) === 'not_found';
    return (
      <View style={styles.screen}>
        <IconButton
          label={t('common.back')}
          onPress={goBack}
          style={[styles.back, { top: insets.headerTop }]}
        >
          <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
        </IconButton>
        <EmptyState
          title={missing ? t('circles.notFound') : t('errors.serverTitle')}
          text={missing ? t('errors.notFoundText') : t('errors.serverText')}
          actions={
            <>
              {missing ? null : (
                <Button label={t('common.retry')} onPress={() => void circle.refetch()} />
              )}
              <Button variant="outline" label={t('common.back')} onPress={goBack} />
            </>
          }
        />
      </View>
    );
  }

  const data = circle.data;
  const requested = data.viewerRequestPending;
  const member = data.viewerRole !== null;
  const needsAccount = !session;

  const joinNow = () => {
    if (needsAccount) {
      setSigningUp(true);
      return;
    }
    join.mutate(
      { answer: null, key },
      {
        onSuccess: () => {
          setKey(newIdempotencyKey());
        },
      },
    );
  };
  const startAsk = () => {
    if (needsAccount) setSigningUp(true);
    else setAsking(true);
  };
  const sendRequest = () => {
    join.mutate(
      { answer: answer.trim() || null, key },
      {
        onSuccess: () => {
          setAsking(false);
          setKey(newIdempotencyKey());
        },
      },
    );
  };
  // A retry of the same decision reuses its key, so a lost response cannot make it look failed.
  const decide = (request: CircleRequest, approve: boolean) => {
    const decision = `${request.id}:${approve}`;
    const decisionKey = decisionKeys[decision] ?? newIdempotencyKey();
    setDecisionKeys((keys) => ({ ...keys, [decision]: decisionKey }));
    respond.mutate(
      { requestId: request.id, approve, key: decisionKey },
      {
        onSuccess: () => {
          setDecisionKeys((keys) =>
            Object.fromEntries(Object.entries(keys).filter(([name]) => name !== decision)),
          );
        },
      },
    );
  };

  const heroAction = member ? (
    <Button
      variant="inverse"
      label={t('chat.openCircle')}
      onPress={() => {
        router.push({ pathname: '/chat/circle/[id]', params: { id: data.id } });
      }}
    />
  ) : data.access === 'open' ? (
    <Button variant="inverse" label={t('circles.join')} loading={join.isPending} onPress={joinNow} />
  ) : requested ? (
    <Button variant="inverse" label={t('circles.requested')} disabled onPress={() => undefined} />
  ) : (
    <Button variant="inverse" label={t('circles.askToJoin')} onPress={startAsk} />
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        {...(Platform.OS === 'web' ? { tabIndex: 0 as const } : {})}
      >
        <View style={styles.hero}>
          <Photo source={welcomePhoto} />
          <LinearGradient
            colors={[
              'rgba(0,0,0,0.35)',
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0.9)',
              'rgba(0,0,0,0.94)',
            ]}
            locations={[0, 0.18, 0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
          <IconButton
            variant="glass"
            label={t('common.back')}
            onPress={goBack}
            style={[styles.back, { top: insets.headerTop }]}
          >
            <ChevronLeftIcon strokeWidth={2.2} color="#FFFFFF" />
          </IconButton>
          <View style={styles.heroText}>
            <Text style={type(13, 'semibold', { color: '#FFFFFF', tracking: 0.3 })}>
              {data.isGlobal ? t('circles.eyebrowGlobal') : t('circles.eyebrowLocal')}
            </Text>
            <Text
              accessibilityRole="header"
              style={type(32, 'bold', { color: '#FFFFFF', tracking: -1, leading: 1.04 })}
            >
              {data.name}
            </Text>
            <View style={styles.members}>
              <View aria-hidden style={styles.avatars}>
                {extra.tints.map((tint, index) => (
                  <View
                    key={tint.background}
                    style={[
                      styles.avatar,
                      { backgroundColor: tint.background, marginLeft: index === 0 ? 0 : -9 },
                    ]}
                  />
                ))}
              </View>
              <Text style={type(14, 'medium', { color: '#FFFFFF' })}>{circleMeta(t, data)}</Text>
            </View>
            {heroAction}
          </View>
        </View>

        <View style={styles.body}>
          {data.tagline ? (
            <Text style={type(16, 'regular', { color: extra.bodyText, leading: 1.5 })}>
              {data.tagline}
            </Text>
          ) : null}
          {member ? (
            <Text role="status" style={type(15, 'semibold', { color: color.brand })}>
              {t('circles.member')}
            </Text>
          ) : null}
          {join.isError && !asking ? (
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('circles.genericError')}
            </Text>
          ) : null}

          <View accessibilityRole="tablist" style={styles.tabs}>
            {TABS.map((name) => {
              const selected = tab === name;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  aria-selected={selected}
                  onPress={() => {
                    setTab(name);
                  }}
                  style={[styles.tab, selected && styles.tabSelected]}
                >
                  <Text
                    style={type(15, 'semibold', { color: selected ? color.ink : color.secondary })}
                  >
                    {t(`circles.${TAB_KEY[name]}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'plans' ? <PlansTab circle={data} /> : null}
          {tab === 'posts' ? <PostsTab circleId={data.id} /> : null}
          {tab === 'about' ? (
            <View style={styles.about}>
              <Text style={type(15, 'regular', { color: extra.bodyText, leading: 1.5 })}>
                {data.access === 'open'
                  ? t('circles.aboutAccessOpen')
                  : t('circles.aboutAccessRequest')}
              </Text>
              <Text style={type(15, 'regular', { color: extra.bodyText, leading: 1.5 })}>
                {t('circles.aboutRules')}
              </Text>
              {canModerate && data.access === 'request' ? (
                <View style={styles.requests}>
                  <Text accessibilityRole="header" style={type(17, 'semibold', { tracking: -0.3 })}>
                    {t('circles.moderatorRequests', { count: requests.data?.length ?? 0 })}
                  </Text>
                  {requests.isError ? (
                    <InlineState
                      title={t('errors.serverTitle')}
                      text={t('errors.serverText')}
                      action={
                        <Button
                          variant="outline"
                          label={t('common.retry')}
                          onPress={() => void requests.refetch()}
                        />
                      }
                    />
                  ) : requests.isPending ? (
                    <Skeleton width="100%" height={88} radius={radius.card} />
                  ) : requests.data.length === 0 ? (
                    <Text style={type(15, 'regular', { color: color.secondary })}>
                      {t('circles.requests.empty')}
                    </Text>
                  ) : (
                    requests.data.map((request) => (
                      <View key={request.id} style={styles.request}>
                        <Text style={type(17, 'semibold', { tracking: -0.3 })}>
                          {request.displayName ?? t('circles.requests.someone')}
                        </Text>
                        {request.answer ? (
                          <Text
                            style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}
                          >
                            {`“${request.answer}”`}
                          </Text>
                        ) : null}
                        <View style={styles.decisions}>
                          <View style={styles.decision}>
                            <Button
                              variant="outline"
                              label={t('circles.requests.decline')}
                              disabled={respond.isPending}
                              onPress={() => {
                                decide(request, false);
                              }}
                            />
                          </View>
                          <View style={styles.decision}>
                            <Button
                              label={t('circles.requests.approve')}
                              disabled={respond.isPending}
                              onPress={() => {
                                decide(request, true);
                              }}
                            />
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                  {respond.isError ? (
                    <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                      {t('circles.genericError')}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <BottomSheet
        open={signingUp}
        onClose={() => {
          setSigningUp(false);
        }}
        title={t('circles.signUpTitle')}
        lead={t('circles.signUpLead')}
      >
        <ProviderButtons
          gap={14}
          onSignedIn={() => {
            setSigningUp(false);
          }}
        />
        <Button
          variant="outline"
          label={t('plan.sheet.useEmail')}
          onPress={() => {
            setSigningUp(false);
            router.push({ pathname: '/sign-up', params: { next: `/circle/${data.id}` } });
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={asking}
        onClose={() => {
          setAsking(false);
        }}
        title={t('circles.requestTitle', { name: data.name })}
        lead={data.joinQuestion ?? t('circles.requestLead')}
      >
        <View style={styles.sheet}>
          <Text style={type(14, 'semibold', { color: color.secondary })}>
            {t('circles.answerLabel')}
          </Text>
          <TextInput
            accessibilityLabel={t('circles.answerLabel')}
            value={answer}
            onChangeText={setAnswer}
            multiline
            maxLength={300}
            style={[styles.answer, type(17)]}
          />
          {join.isError ? (
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('circles.genericError')}
            </Text>
          ) : null}
          <Button label={t('circles.send')} loading={join.isPending} onPress={sendRequest} />
        </View>
      </BottomSheet>
    </View>
  );
}

/** Upcoming Plans where this Circle is: its city, or online Plans for a global Circle. */
function PlansTab({ circle }: { circle: Circle }) {
  const { t } = useTranslation();
  const router = useRouter();
  const plans = useExplorePlans(circle.isGlobal || !circle.cityId ? null : [circle.cityId]);
  if (plans.isPending) return <Skeleton width="100%" height={96} radius={radius.card} />;
  if (plans.isError) {
    return (
      <InlineState
        title={t('errors.serverTitle')}
        text={t('errors.serverText')}
        action={
          <Button variant="outline" label={t('common.retry')} onPress={() => void plans.refetch()} />
        }
      />
    );
  }
  const shown = circle.isGlobal ? plans.data.filter((p) => p.format === 'online') : plans.data;
  if (shown.length === 0) {
    return (
      <Text style={type(15, 'regular', { color: color.secondary })}>{t('circles.plansEmpty')}</Text>
    );
  }
  return (
    <View style={styles.list}>
      {shown.slice(0, 6).map((plan) => (
        <PlanListItem
          key={plan.id}
          plan={plan}
          when={`${shortWhen(plan.startsAt, plan.timezone)} · ${plan.areaName}`}
          onPress={() => {
            router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
          }}
        />
      ))}
    </View>
  );
}

/** Recipes shared into this Circle, visible to its members as the Learn tab shows them. */
function PostsTab({ circleId }: { circleId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const recipes = useRecipes('');
  if (recipes.isPending) return <Skeleton width="100%" height={72} radius={radius.card} />;
  if (recipes.isError) {
    return (
      <InlineState
        title={t('errors.serverTitle')}
        text={t('errors.serverText')}
        action={
          <Button variant="outline" label={t('common.retry')} onPress={() => void recipes.refetch()} />
        }
      />
    );
  }
  const shown = recipes.data.filter((r) => r.circleId === circleId);
  if (shown.length === 0) {
    return (
      <Text style={type(15, 'regular', { color: color.secondary })}>{t('circles.postsEmpty')}</Text>
    );
  }
  return (
    <View style={styles.list}>
      {shown.map((recipe) => (
        <Pressable
          key={recipe.id}
          accessibilityRole="link"
          onPress={() => {
            router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } });
          }}
          style={styles.post}
        >
          <Text style={type(13, 'regular', { color: color.secondary })}>
            {t('learn.byline', {
              name: recipe.authorName ?? t('circles.requests.someone'),
              circle: recipe.circleName,
            })}
          </Text>
          <Text style={type(16, 'semibold', { tracking: -0.3 })}>{recipe.title}</Text>
          {recipe.intro ? (
            <Text numberOfLines={2} style={type(14, 'regular', { color: color.secondary })}>
              {recipe.intro}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  hero: { height: 360, backgroundColor: color.ink },
  heroText: { position: 'absolute', left: 22, right: 22, bottom: 24, gap: 10 },
  members: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  body: { paddingHorizontal: 22, paddingTop: 20, gap: 18 },
  tabs: {
    flexDirection: 'row',
    gap: 22,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: { borderBottomColor: color.ink },
  list: { gap: 12 },
  post: { gap: 3, paddingVertical: 6 },
  about: { gap: 12 },
  requests: { gap: 12, paddingTop: 8 },
  request: {
    gap: 10,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  decisions: { flexDirection: 'row', gap: 10 },
  decision: { flex: 1 },
  sheet: { gap: 12 },
  answer: {
    minHeight: 110,
    padding: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    textAlignVertical: 'top',
    color: color.ink,
  },
});
