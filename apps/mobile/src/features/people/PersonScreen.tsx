import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ChevronRightIcon, VerifiedIcon } from '../../components/icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { BottomSheet, EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { PersonProfile } from '../../lib/backend/types';
import { currentLanguage } from '../../lib/i18n';
import { useAuth } from '../auth/useAuth';
import { useDirectRequests, useRespondDirect } from '../chat/queries';
import { newIdempotencyKey } from '../plans/queries';
import { useBlockUser } from '../safety/queries';
import { useConnectWithPerson, usePerson } from './queries';
import { features } from '../../lib/features';

/**
 * Someone from a shared Circle, before you connect or answer their message request. Shows who
 * they are in the community (level, recipes, Plans hosted, Plans together), never where they live
 * exactly or how to reach them.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const person = usePerson(id);
  const { session } = useAuth();

  const back = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/explore');
      }}
    />
  );

  if (session === null) {
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={t('people.signedOut.title')}
          text={t('people.signedOut.text')}
          actions={
            <Button
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: `/person/${id}` } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (person.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        {back}
        <View style={styles.content}>
          <Skeleton width={72} height={72} radius={36} />
          <Skeleton width="60%" height={30} radius={8} />
          <Skeleton width="100%" height={88} radius={radius.card} />
        </View>
      </View>
    );
  }
  if (person.isError) {
    const code = errorCode(person.error);
    const gone = code === 'person_not_found' || code === 'not_found' || code === 'blocked';
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={gone ? t('person.notFoundTitle') : t('errors.serverTitle')}
          text={gone ? t('person.notFoundText') : t('errors.serverText')}
          actions={
            gone ? (
              <Button
                label={t('common.back')}
                onPress={() => {
                  router.replace('/explore');
                }}
              />
            ) : (
              <Button label={t('common.retry')} onPress={() => void person.refetch()} />
            )
          }
        />
      </View>
    );
  }
  return <PersonView person={person.data} back={back} />;
}

function PersonView({ person, back }: { person: PersonProfile; back: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useScreenInsets();
  const connect = useConnectWithPerson();
  const requests = useDirectRequests();
  const respond = useRespondDirect();
  const block = useBlockUser();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockKey] = useState(newIdempotencyKey);
  const request = requests.data?.find((r) => r.fromId === person.userId) ?? null;

  const joined = new Intl.DateTimeFormat(currentLanguage(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(person.memberSince));
  const levelName = t(`hosting.levelName_${String(person.level)}` as 'hosting.levelName_0');

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <View style={styles.identity}>
          <View
            aria-hidden
            style={[styles.avatar, { backgroundColor: extra.tints[1].background }]}
          >
            <Text
              allowFontScaling={false}
              style={type(30, 'bold', { color: extra.tints[1].text })}
            >
              {person.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text
              maxFontSizeMultiplier={2.0}
              accessibilityRole="header"
              style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
            >
              {person.displayName}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}
            >
              {[person.city, t('person.joined', { date: joined })].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {person.verified || features.hostingLevels ? (
          <View style={styles.levelRow}>
            {person.verified ? <VerifiedIcon /> : null}
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'semibold', { color: color.brand })}
            >
              {person.verified
                ? t('person.verified')
                : t('person.levelLine', { name: levelName, level: person.level })}
            </Text>
          </View>
        ) : null}

        {features.recipes ? (
          <View style={styles.stats}>
            <Stat value={person.recipes} label={t('person.statRecipes')} />
            <Stat value={person.hosted} label={t('person.statHosted')} />
            <Stat value={person.upvotes} label={t('person.statUpvotes')} />
          </View>
        ) : null}

        <Text maxFontSizeMultiplier={2.0} style={type(15, 'regular', { leading: 1.5 })}>
          {person.plansTogether > 0
            ? t('person.together', { count: person.plansTogether })
            : t('person.togetherNone')}
        </Text>

        <Text
          maxFontSizeMultiplier={2.0}
          accessibilityRole="header"
          aria-level={2}
          style={styles.section}
        >
          {t('person.sharedCircles')}
        </Text>
        <View style={styles.chips}>
          {person.circleNames.map((name) => (
            <View key={name} style={styles.chip}>
              <Text maxFontSizeMultiplier={2.0} style={type(14, 'semibold')}>
                {name}
              </Text>
            </View>
          ))}
        </View>

        {features.recipes && person.recentRecipes.length > 0 ? (
          <>
            <Text
              maxFontSizeMultiplier={2.0}
              accessibilityRole="header"
              aria-level={2}
              style={styles.section}
            >
              {t('person.recipesTitle')}
            </Text>
            <View>
              {person.recentRecipes.map((recipe) => (
                <Pressable
                  key={recipe.id}
                  accessibilityRole="link"
                  onPress={() => {
                    router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } });
                  }}
                  style={styles.recipe}
                >
                  <View style={styles.grow}>
                    <Text maxFontSizeMultiplier={2.0} style={type(16, 'semibold')}>
                      {recipe.title}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(14, 'regular', { color: color.secondary })}
                    >
                      {t('person.votes', { count: recipe.votes })}
                    </Text>
                  </View>
                  <ChevronRightIcon size={16} strokeWidth={2.4} color={color.secondary} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text
          maxFontSizeMultiplier={2.0}
          style={[type(14, 'regular', { color: color.secondary, leading: 1.5 }), styles.note]}
        >
          {t('person.privacy')}
        </Text>

        {request ? (
          <View style={styles.request}>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(13, 'semibold', { color: color.secondary })}
            >
              {t('person.wantsToMessage')}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={type(16, 'regular', { leading: 1.5 })}>
              {request.firstMessage}
            </Text>
            <View style={styles.row}>
              <Button
                label={t('direct.accept')}
                accessibilityLabel={`${t('direct.accept')} ${person.displayName}`}
                loading={respond.isPending && respond.variables.accept}
                disabled={respond.isPending}
                onPress={() => {
                  respond.mutate(
                    { requestId: request.id, accept: true },
                    {
                      onSuccess: (status) => {
                        if (status === 'accepted') {
                          router.replace({
                            pathname: '/chat/direct/[id]',
                            params: { id: person.userId },
                          });
                        }
                      },
                    },
                  );
                }}
              />
              <Button
                variant="outline"
                label={t('direct.decline')}
                accessibilityLabel={`${t('direct.decline')} ${person.displayName}`}
                disabled={respond.isPending}
                onPress={() => {
                  respond.mutate(
                    { requestId: request.id, accept: false },
                    {
                      onSuccess: () => {
                        if (router.canGoBack()) router.back();
                      },
                    },
                  );
                }}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          {!features.people && person.connection !== 'connected' ? null : person.connection ===
            'none' ? (
            <Button
              label={t('people.connect')}
              accessibilityLabel={t('people.connectWith', { name: person.displayName })}
              loading={connect.isPending}
              onPress={() => {
                connect.mutate({ userId: person.userId, key: newIdempotencyKey() });
              }}
            />
          ) : person.connection === 'requested_by_them' ? (
            <Button
              label={t('people.connectBack')}
              accessibilityLabel={t('people.connectBackWith', { name: person.displayName })}
              loading={connect.isPending}
              onPress={() => {
                connect.mutate({ userId: person.userId, key: newIdempotencyKey() });
              }}
            />
          ) : person.connection === 'connected' ? (
            <Button
              label={t('direct.messageButton')}
              onPress={() => {
                router.push({ pathname: '/chat/direct/[id]', params: { id: person.userId } });
              }}
            />
          ) : (
            <Text
              maxFontSizeMultiplier={2.0}
              role="status"
              style={[type(15, 'semibold', { color: color.secondary }), styles.center]}
            >
              {t('people.requested')}
            </Text>
          )}
          {connect.isError || respond.isError || block.isError ? (
            <Text
              maxFontSizeMultiplier={2.0}
              role="alert"
              style={type(15, 'regular', { color: color.danger })}
            >
              {t('people.error')}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Button
              variant="ghost"
              label={t('safety.reportName', { name: person.displayName })}
              onPress={() => {
                router.push({
                  pathname: '/report',
                  params: {
                    type: 'person',
                    id: person.userId,
                    name: person.displayName,
                    userId: person.userId,
                  },
                });
              }}
            />
            <Button
              variant="ghost"
              label={t('person.blockName', { name: person.displayName })}
              onPress={() => {
                setConfirmBlock(true);
              }}
            />
          </View>
        </View>
      </ScrollView>

      <BottomSheet
        open={confirmBlock}
        onClose={() => {
          setConfirmBlock(false);
        }}
        title={t('person.blockName', { name: person.displayName })}
        lead={t('safety.alsoBlockNote')}
      >
        <Button
          label={t('person.block')}
          loading={block.isPending}
          onPress={() => {
            block.mutate(
              { userId: person.userId, key: blockKey },
              {
                onSuccess: () => {
                  setConfirmBlock(false);
                  router.replace('/explore');
                },
              },
            );
          }}
        />
      </BottomSheet>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text maxFontSizeMultiplier={2.0} style={type(22, 'bold', { tracking: -0.5 })}>
        {new Intl.NumberFormat(currentLanguage()).format(value)}
      </Text>
      <Text
        maxFontSizeMultiplier={2.0}
        style={type(13, 'regular', { color: color.secondary, leading: 1.35 })}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 16, gap: 14 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1, gap: 4 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    gap: 2,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  section: { ...type(20, 'semibold', { tracking: -0.4 }), marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  recipe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  grow: { flex: 1, gap: 2 },
  note: { marginTop: 8 },
  request: {
    gap: 8,
    padding: 16,
    marginTop: 8,
    borderRadius: radius.card,
    backgroundColor: color.brandTint,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
  actions: { gap: 10, paddingTop: 12 },
  center: { textAlign: 'center' },
});
