import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { currentLanguage } from '../../lib/i18n';
import { useRecipe } from './queries';
import { allergenNames, formatQuantity, recipeMeta, scaleQuantity } from './recipeRules';
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
  const [servings, setServings] = useState<number | null>(null);

  const back = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/explore');
      }}
    />
  );

  if (recipe.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
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
          title={missing ? t('learn.notFound') : t('errors.serverTitle')}
          text={missing ? t('errors.notFoundText') : t('errors.serverText')}
          actions={
            missing ? (
              <Button
                variant="outline"
                label={t('common.back')}
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/explore');
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
      {back}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16, paddingBottom: 40 + insets.bottom },
        ]}
      >
        {data.cuisine ? (
          <Text style={type(13, 'semibold', { color: color.secondary, tracking: 0.6 })}>
            {data.cuisine.toUpperCase()}
          </Text>
        ) : null}
        <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
          {data.title}
        </Text>
        <Text style={type(15, 'regular', { color: color.secondary })}>
          {t('learn.byline', {
            name: data.authorName ?? t('circles.requests.someone'),
            circle: data.circleName,
          })}
        </Text>
        <Text style={type(15, 'regular', { color: color.secondary })}>{recipeMeta(t, data)}</Text>
        {data.intro ? (
          <Text style={type(17, 'regular', { color: color.ink, leading: 1.5 })}>{data.intro}</Text>
        ) : null}

        <View style={styles.allergens}>
          <Text style={type(15, 'semibold', { color: data.allergensConfirmed ? color.ink : color.danger })}>
            {data.allergensConfirmed
              ? t('learn.detail.declared', { allergens: allergenNames(t, data.allergens) })
              : t('learn.detail.unconfirmed')}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text accessibilityRole="header" style={type(20, 'semibold', { tracking: -0.4 })}>
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
                : [formatQuantity(amount, language), ingredient.unit].filter(Boolean).join(' ');
            return (
              <View key={`${ingredient.name}-${ingredient.unit ?? ''}`} style={styles.ingredient}>
                <Text style={[type(17, 'regular'), styles.ingredientName]}>{ingredient.name}</Text>
                {quantity ? (
                  <Text style={type(17, 'regular', { color: color.secondary })}>{quantity}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={type(20, 'semibold', { tracking: -0.4 })}>
            {t('learn.method')}
          </Text>
          {data.steps.map((step, index) => (
            <View key={`${index}-${step.slice(0, 12)}`} style={styles.step}>
              <Text style={type(15, 'semibold', { color: color.brand })}>{index + 1}</Text>
              <Text style={[type(17, 'regular', { leading: 1.5 }), styles.stepText]}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  content: { paddingHorizontal: 24, gap: 12 },
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
