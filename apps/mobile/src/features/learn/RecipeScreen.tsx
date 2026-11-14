import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { ChevronLeftIcon } from '../../components/icons';
import { Photo } from '../../components/Photo';
import { recipePhoto } from '../plans/planImage';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { ReportLink } from '../safety/ReportLink';
import { errorCode } from '../../lib/backend/backend';
import { currentLanguage } from '../../lib/i18n';
import { useAuth } from '../auth/useAuth';
import { useRecipe, useSetFollow, useSetRecipeVote } from './queries';
import { allergenNames, formatQuantity, scaleQuantity } from './recipeRules';
import { Stepper } from '../../components/Stepper';

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 50;

/** One recipe: the servings stepper rescales the amounts; allergens say what the poster declared. */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const recipe = useRecipe(id);
  const { session } = useAuth();
  const vote = useSetRecipeVote();
  const follow = useSetFollow();
  const [servings, setServings] = useState<number | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/explore');
  };
  const back = <ScreenHeader backLabel={t('common.back')} onBack={goBack} />;

  if (recipe.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="70%" height={34} radius={8} />
        <Skeleton width="100%" height={140} radius={radius.card} />
      </View>
    );
  }
  if (recipe.isError) {
    const missing = errorCode(recipe.error) === 'not_found';
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          {...(missing
            ? {}
            : {
                onSavedPlans: () => {
                  router.push('/my-plans');
                },
              })}
          title={missing ? t('learn.notFound') : t('errors.serverTitle')}
          text={missing ? t('learn.notFoundText') : t('errors.serverText')}
          actions={
            missing ? (
              <Button
                label={t('learn.notFoundAction')}
                onPress={() => {
                  router.replace('/explore');
                }}
              />
            ) : (
              <Button label={t('common.retry')} onPress={() => void recipe.refetch()} />
            )
          }
        />
      </View>
    );
  }

  const data = recipe.data;
  const language = currentLanguage();
  const shown = servings ?? data.serves;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <View style={styles.hero}>
          <Photo source={recipePhoto(data.id)} />
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
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(13, 'semibold', { color: 'rgba(255,255,255,0.8)', tracking: 0.6 })}
            >
              {data.cuisine
                ? `${t('learn.eyebrow')} · ${data.cuisine.toUpperCase()}`
                : t('learn.eyebrow')}
            </Text>
            <Text
              maxFontSizeMultiplier={1.4}
              accessibilityRole="header"
              style={type(34, 'bold', { color: '#FFFFFF', tracking: -1.2, leading: 1.02 })}
            >
              {data.title}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(16, 'regular', { color: 'rgba(255,255,255,0.88)' })}
            >
              {t('learn.byline', {
                name: data.authorName ?? t('circles.requests.someone'),
                circle: data.circleName,
              })}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.chips}>
            {data.minutes !== null ? (
              <View style={styles.chip}>
                <Text maxFontSizeMultiplier={2.0} style={type(14, 'semibold')}>
                  {t('learn.minutes', { minutes: data.minutes })}
                </Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <Text maxFontSizeMultiplier={2.0} style={type(14, 'semibold')}>
                {t('learn.serves', { servings: data.serves })}
              </Text>
            </View>
          </View>
          {session ? (
            <Button
              label={t('learn.cookTogether')}
              onPress={() => {
                router.push({ pathname: '/create', params: { recipe: data.id } });
              }}
            />
          ) : null}
          {session && data.authorId !== session.userId ? (
            <View style={styles.actions}>
              <Button
                variant={data.voted ? 'primary' : 'outline'}
                label={`${data.voted ? t('hosting.upvoted') : t('hosting.upvote')} · ${t('hosting.votes', { count: data.votes })}`}
                accessibilityLabel={`${t('hosting.upvote')}, ${t('hosting.votes', { count: data.votes })}`}
                pressed={data.voted}
                disabled={vote.isPending}
                onPress={() => {
                  vote.mutate({ recipeId: data.id, on: !data.voted });
                }}
              />
              {data.authorId ? (
                <Button
                  variant={data.followingAuthor ? 'primary' : 'outline'}
                  label={
                    data.followingAuthor
                      ? t('hosting.following')
                      : t('hosting.follow', { name: data.authorName ?? '' })
                  }
                  accessibilityLabel={
                    data.followingAuthor
                      ? t('hosting.unfollow', { name: data.authorName ?? '' })
                      : t('hosting.follow', { name: data.authorName ?? '' })
                  }
                  pressed={data.followingAuthor}
                  disabled={follow.isPending}
                  onPress={() => {
                    follow.mutate({ userId: data.authorId ?? '', on: !data.followingAuthor });
                  }}
                />
              ) : null}
            </View>
          ) : !session ? (
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(14, 'regular', { color: color.secondary })}
            >
              {t('hosting.votes', { count: data.votes })}
            </Text>
          ) : null}
          {vote.isError || follow.isError ? (
            <Text
              maxFontSizeMultiplier={2.0}
              role="alert"
              style={type(14, 'regular', { color: color.danger })}
            >
              {errorCode(vote.error ?? follow.error) === 'own_recipe'
                ? t('hosting.errorOwnRecipe')
                : t('hosting.errorAction')}
            </Text>
          ) : null}
          {data.intro ? (
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(17, 'regular', { color: extra.bodyText, leading: 1.55 })}
            >
              {data.intro}
            </Text>
          ) : null}

          <View style={styles.allergens}>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'semibold', {
                color: data.allergensConfirmed ? color.ink : color.danger,
              })}
            >
              {data.allergensConfirmed
                ? t('learn.detail.declared', { allergens: allergenNames(t, data.allergens) })
                : t('learn.detail.unconfirmed')}
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text
                maxFontSizeMultiplier={1.6}
                accessibilityRole="header"
                style={type(20, 'semibold', { tracking: -0.4 })}
              >
                {t('learn.ingredients')}
              </Text>
              <Stepper
                value={shown}
                min={MIN_SERVINGS}
                max={MAX_SERVINGS}
                label={t('learn.servings')}
                decreaseLabel={t('learn.fewer')}
                increaseLabel={t('learn.more')}
                onChange={setServings}
              />
            </View>
            {data.ingredients.map((ingredient) => {
              const amount = scaleQuantity(ingredient.qty, data.serves, shown);
              const quantity =
                amount === null
                  ? null
                  : [formatQuantity(amount, language), ingredient.unit]
                      .filter(Boolean)
                      .join(' ');
              return (
                <View
                  key={`${ingredient.name}-${ingredient.unit ?? ''}`}
                  style={styles.ingredient}
                >
                  <Text
                    maxFontSizeMultiplier={2.0}
                    style={[type(17, 'regular'), styles.ingredientName]}
                  >
                    {ingredient.name}
                  </Text>
                  {quantity ? (
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(17, 'regular', { color: color.secondary })}
                    >
                      {quantity}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <Text
              maxFontSizeMultiplier={1.6}
              accessibilityRole="header"
              style={type(20, 'semibold', { tracking: -0.4 })}
            >
              {t('learn.method')}
            </Text>
            {data.steps.map((step, index) => (
              <View key={`${index}-${step.slice(0, 12)}`} style={styles.step}>
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(15, 'semibold', { color: color.brand })}
                >
                  {index + 1}
                </Text>
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={[type(17, 'regular', { leading: 1.5 }), styles.stepText]}
                >
                  {step}
                </Text>
              </View>
            ))}
          </View>
          <ReportLink targetType="recipe" targetId={data.id} name={data.title} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  hero: { height: 400, backgroundColor: color.ink },
  heroText: { position: 'absolute', left: 24, right: 24, bottom: 30, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  content: { paddingHorizontal: 24, paddingTop: 24, gap: 14 },
  allergens: {
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  section: { gap: 12, paddingTop: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ingredient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  ingredientName: { flex: 1 },
  step: { flexDirection: 'row', gap: 14 },
  stepText: { flex: 1 },
});
