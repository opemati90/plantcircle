import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.list}>
        <Skeleton width="100%" height={112} radius={radius.card} />
        <Skeleton width="100%" height={112} radius={radius.card} />
      </View>
    );
  }
  if (recipes.isError) {
    const offline = errorCode(recipes.error) === 'network';
    return (
      <EmptyState
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
        recipes.data.map((recipe) => (
          <Pressable
            key={recipe.id}
            accessibilityRole="link"
            onPress={() => {
              open(recipe);
            }}
            style={styles.row}
          >
            <Text style={type(17, 'semibold', { tracking: -0.3 })}>{recipe.title}</Text>
            <Text style={type(15, 'regular', { color: color.secondary })}>
              {t('learn.byline', {
                name: recipe.authorName ?? t('circles.requests.someone'),
                circle: recipe.circleName,
              })}
            </Text>
            <Text style={type(15, 'regular', { color: color.secondary })}>
              {recipeMeta(t, recipe)}
            </Text>
            <Text
              style={type(14, 'semibold', {
                color: recipe.allergensConfirmed ? color.secondary : color.danger,
              })}
            >
              {allergenLine(t, recipe)}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  row: {
    gap: 4,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
});
