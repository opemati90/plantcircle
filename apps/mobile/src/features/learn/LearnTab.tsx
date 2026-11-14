import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Photo } from '../../components/Photo';
import { recipePhoto } from '../plans/planImage';
import { Button } from '../../components/Button';
import { OfflineIcon } from '../../components/icons';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { errorCode } from '../../lib/backend/backend';
import type { Recipe } from '../../lib/backend/types';
import { useRecipes } from './queries';
import { allergenLine, recipeMeta } from './recipeRules';

/** Recipes shared into your Circles: search them, open one, or share your own. */
export function LearnTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const recipes = useRecipes(query);

  if (recipes.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.list}
      >
        <Skeleton width="100%" height={112} radius={radius.card} />
        <Skeleton width="100%" height={112} radius={radius.card} />
      </View>
    );
  }
  if (recipes.isError) {
    const offline = errorCode(recipes.error) === 'network';
    return (
      <EmptyState
        onSavedPlans={() => {
          router.push('/my-plans');
        }}
        title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
        text={offline ? t('errors.offlineText') : t('errors.serverText')}
        {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
        actions={<Button label={t('common.tryAgain')} onPress={() => void recipes.refetch()} />}
      />
    );
  }

  const share = (
    <Button
      variant="outline"
      label={t('learn.share')}
      onPress={() => {
        router.push('/recipe/new');
      }}
    />
  );
  const open = (recipe: Recipe) => {
    router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } });
  };

  return (
    <View style={styles.list}>
      {share}
      {recipes.data.length === 0 ? (
        query.trim() ? (
          <InlineState
            title={t('learn.noResults', { query: query.trim() })}
            text={t('learn.empty.text')}
          />
        ) : (
          <InlineState title={t('learn.empty.title')} text={t('learn.empty.text')} />
        )
      ) : (
        <View style={styles.grid}>
          {recipes.data.map((recipe) => (
            <Pressable
              key={recipe.id}
              accessibilityRole="link"
              accessibilityLabel={`${recipe.title}. ${recipeMeta(t, recipe)}. ${allergenLine(t, recipe)}`}
              onPress={() => {
                open(recipe);
              }}
              style={styles.tile}
            >
              <View style={styles.photo}>
                <Photo source={recipePhoto(recipe.id)} />
              </View>
              <Text numberOfLines={2} style={type(16, 'semibold', { tracking: -0.3 })}>
                {recipe.title}
              </Text>
              <Text numberOfLines={1} style={type(14, 'regular', { color: color.secondary })}>
                {t('learn.byline', {
                  name: recipe.authorName ?? t('circles.requests.someone'),
                  circle: recipe.circleName,
                })}
              </Text>
              <Text
                numberOfLines={2}
                style={type(13, 'semibold', {
                  color: recipe.allergensConfirmed ? color.secondary : color.danger,
                })}
              >
                {allergenLine(t, recipe)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tile: { width: '47%', gap: 6 },
  photo: {
    height: 140,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: extra.skeleton,
  },
});
