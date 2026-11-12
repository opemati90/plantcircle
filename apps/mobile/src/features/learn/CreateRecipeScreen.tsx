import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { ChevronLeftIcon } from '../../components/icons';
import { InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { RECIPE_ALLERGENS, type RecipeAllergen } from '../../lib/backend/types';
import { newIdempotencyKey, useMyCircles } from '../plans/queries';
import { useCreateRecipe } from './queries';
import { Stepper } from '../../components/Stepper';

const MAX_INGREDIENTS = 40;
const MAX_STEPS = 30;
const MIN_SERVINGS = 1;
const MAX_SERVINGS = 50;
const MAX_MINUTES = 1440;

interface IngredientRow {
  id: string;
  name: string;
  qty: string;
  unit: string;
}

/** A quantity typed with a comma or a dot; empty or not a number means "no amount". */
function parseQuantity(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Share a recipe into one of your Circles. Allergens must be chosen, or explicitly skipped. */
export default function CreateRecipeScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const circles = useMyCircles();
  const create = useCreateRecipe();
  const memberOf = circles.data ?? [];
  const [chosenCircle, setChosenCircle] = useState<string | null>(null);
  const circleId = chosenCircle ?? (memberOf.length === 1 ? (memberOf[0]?.id ?? null) : null);
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [intro, setIntro] = useState('');
  const [serves, setServes] = useState(4);
  const [minutes, setMinutes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { id: newIdempotencyKey(), name: '', qty: '', unit: '' },
  ]);
  const [steps, setSteps] = useState<{ id: string; body: string }[]>([
    { id: newIdempotencyKey(), body: '' },
  ]);
  const [allergens, setAllergens] = useState<RecipeAllergen[]>([]);
  const [skipped, setSkipped] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);

  const cleanIngredients = ingredients
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      qty: parseQuantity(row.qty),
      unit: row.unit.trim() || null,
    }));
  const cleanSteps = steps.map((row) => row.body.trim()).filter(Boolean);
  const minutesValue = Number.parseInt(minutes, 10);
  const allergensAnswered = skipped || allergens.length > 0;
  const valid =
    circleId !== null &&
    title.trim().length >= 2 &&
    cleanIngredients.length > 0 &&
    cleanSteps.length > 0 &&
    allergensAnswered;

  // A changed recipe is a new one, so the key follows the content. A retry keeps it.
  const payload = JSON.stringify({
    circleId,
    title,
    cuisine,
    intro,
    serves,
    minutes,
    ingredients: cleanIngredients,
    steps: cleanSteps,
    allergens,
    skipped,
  });
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [payload]);

  const back = (
    <IconButton
      label={t('common.back')}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/explore');
      }}
      style={[styles.back, { top: insets.top + 8 }]}
    >
      <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
    </IconButton>
  );

  const toggleAllergen = (allergen: RecipeAllergen) => {
    setSkipped(false);
    setAllergens((current) => {
      if (current.includes(allergen)) return current.filter((a) => a !== allergen);
      // "None" stands alone: choosing it clears the others, and choosing another clears "None".
      if (allergen === 'none') return ['none'];
      return [...current.filter((a) => a !== 'none'), allergen];
    });
  };

  const publish = () => {
    if (circleId === null || !valid) return;
    create.mutate(
      {
        key,
        recipe: {
          circleId,
          title: title.trim(),
          cuisine: cuisine.trim() || null,
          serves,
          minutes: Number.isFinite(minutesValue) && minutesValue > 0 ? minutesValue : null,
          intro: intro.trim() || null,
          allergens: skipped ? [] : allergens,
          allergensConfirmed: !skipped,
          ingredients: cleanIngredients,
          steps: cleanSteps,
        },
      },
      {
        onSuccess: (id) => {
          router.replace({ pathname: '/recipe/[id]', params: { id } });
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 64, paddingBottom: 40 + insets.bottom },
        ]}
      >
        <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
          {t('learn.create.title')}
        </Text>

        <Text style={label}>{t('learn.create.circleLabel')}</Text>
        {circles.isPending ? (
          <Skeleton width="100%" height={64} radius={radius.card} />
        ) : circles.isError ? (
          <InlineState
            title={t('errors.serverTitle')}
            text={t('errors.serverText')}
            action={
              <Button
                variant="outline"
                label={t('common.retry')}
                onPress={() => {
                  void circles.refetch();
                }}
              />
            }
          />
        ) : memberOf.length === 0 ? (
          <View style={styles.notice}>
            <Text style={type(15, 'regular', { color: color.secondary })}>
              {t('learn.create.circleEmpty')}
            </Text>
            <Button
              variant="outline"
              label={t('circles.create')}
              onPress={() => {
                router.replace('/circle/new');
              }}
            />
          </View>
        ) : (
          <View accessibilityRole="radiogroup" accessibilityLabel={t('learn.create.circleLabel')} style={styles.options}>
            {memberOf.map((circle) => {
              const selected = circleId === circle.id;
              return (
                <Pressable
                  key={circle.id}
                  accessibilityRole="radio"
                  aria-checked={selected}
                  onPress={() => {
                    setChosenCircle(circle.id);
                  }}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <Text style={type(17, 'semibold', { tracking: -0.3 })}>{circle.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={label}>{t('learn.create.titleLabel')}</Text>
        <TextInput
          accessibilityLabel={t('learn.create.titleLabel')}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          style={[styles.field, type(17)]}
        />

        <Text style={label}>{t('learn.create.cuisineLabel')}</Text>
        <TextInput
          accessibilityLabel={t('learn.create.cuisineLabel')}
          value={cuisine}
          onChangeText={setCuisine}
          maxLength={40}
          style={[styles.field, type(17)]}
        />

        <Text style={label}>{t('learn.create.introLabel')}</Text>
        <TextInput
          accessibilityLabel={t('learn.create.introLabel')}
          value={intro}
          onChangeText={setIntro}
          multiline
          maxLength={500}
          style={[styles.area, type(17)]}
        />

        <View style={styles.inlineRow}>
          <View style={styles.inlineItem}>
            <Text style={label}>{t('learn.create.servesLabel')}</Text>
            <Stepper
              value={serves}
              min={MIN_SERVINGS}
              max={MAX_SERVINGS}
              label={t('learn.create.servesLabel')}
              decreaseLabel={t('learn.fewer')}
              increaseLabel={t('learn.more')}
              onChange={setServes}
            />
          </View>
          <View style={styles.inlineItem}>
            <Text style={label}>{t('learn.create.minutesLabel')}</Text>
            <TextInput
              accessibilityLabel={t('learn.create.minutesLabel')}
              value={minutes}
              onChangeText={(text) => {
                // The database keeps a recipe to a day at most; a longer entry clamps to that.
                const digits = text.replace(/\D/g, '');
                setMinutes(digits ? String(Math.min(Number(digits), MAX_MINUTES)) : '');
              }}
              keyboardType="number-pad"
              style={[styles.field, type(17)]}
            />
          </View>
        </View>

        <Text style={label}>{t('learn.create.ingredientsLabel')}</Text>
        {ingredients.map((row, index) => (
          <View key={row.id} style={styles.ingredientRow}>
            <TextInput
              accessibilityLabel={`${t('learn.create.ingredientName')} ${index + 1}`}
              value={row.name}
              onChangeText={(text) => {
                setIngredients((rows) => rows.map((r) => (r.id === row.id ? { ...r, name: text } : r)));
              }}
              maxLength={120}
              style={[styles.field, styles.grow, type(17)]}
            />
            <TextInput
              accessibilityLabel={`${t('learn.create.ingredientQty')} ${index + 1}`}
              value={row.qty}
              onChangeText={(text) => {
                setIngredients((rows) => rows.map((r) => (r.id === row.id ? { ...r, qty: text } : r)));
              }}
              keyboardType="decimal-pad"
              maxLength={10}
              style={[styles.field, styles.small, type(17)]}
            />
            <TextInput
              accessibilityLabel={`${t('learn.create.ingredientUnit')} ${index + 1}`}
              value={row.unit}
              onChangeText={(text) => {
                setIngredients((rows) => rows.map((r) => (r.id === row.id ? { ...r, unit: text } : r)));
              }}
              maxLength={20}
              style={[styles.field, styles.small, type(17)]}
            />
          </View>
        ))}
        <View style={styles.rowButtons}>
          <Button
            variant="outline"
            label={t('learn.create.addIngredient')}
            disabled={ingredients.length >= MAX_INGREDIENTS}
            onPress={() => {
              setIngredients((rows) => [...rows, { id: newIdempotencyKey(), name: '', qty: '', unit: '' }]);
            }}
          />
          {ingredients.length > 1 ? (
            <Button
              variant="outline"
              label={t('learn.create.removeIngredient')}
              onPress={() => {
                setIngredients((rows) => rows.slice(0, -1));
              }}
            />
          ) : null}
        </View>

        <Text style={label}>{t('learn.create.stepsLabel')}</Text>
        {steps.map((row, index) => (
          <View key={row.id} style={styles.stepRow}>
            <Text style={type(15, 'semibold', { color: color.brand })}>{index + 1}</Text>
            <TextInput
              accessibilityLabel={t('learn.create.stepLabel', { number: index + 1 })}
              value={row.body}
              onChangeText={(text) => {
                setSteps((rows) => rows.map((r) => (r.id === row.id ? { ...r, body: text } : r)));
              }}
              multiline
              maxLength={1000}
              style={[styles.area, styles.grow, type(17)]}
            />
          </View>
        ))}
        <View style={styles.rowButtons}>
          <Button
            variant="outline"
            label={t('learn.create.addStep')}
            disabled={steps.length >= MAX_STEPS}
            onPress={() => {
              setSteps((rows) => [...rows, { id: newIdempotencyKey(), body: '' }]);
            }}
          />
          {steps.length > 1 ? (
            <Button
              variant="outline"
              label={t('learn.create.removeStep')}
              onPress={() => {
                setSteps((rows) => rows.slice(0, -1));
              }}
            />
          ) : null}
        </View>

        <Text style={label}>{t('learn.create.allergensLabel')}</Text>
        <Text style={type(15, 'regular', { color: color.secondary })}>
          {t('learn.create.allergensHelp')}
        </Text>
        <View style={styles.chips}>
          {RECIPE_ALLERGENS.map((allergen) => {
            const selected = !skipped && allergens.includes(allergen);
            return (
              <Pressable
                key={allergen}
                accessibilityRole="checkbox"
                aria-checked={selected}
                onPress={() => {
                  toggleAllergen(allergen);
                }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={type(15, 'semibold', { color: selected ? color.brand : color.ink })}>
                  {t(`allergen.${allergen}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button
          variant="outline"
          label={t('learn.create.skipAllergens')}
          onPress={() => {
            setSkipped(true);
            setAllergens([]);
          }}
        />
        {skipped ? (
          <Text style={type(15, 'regular', { color: color.secondary })}>
            {t('learn.create.skippedNote')}
          </Text>
        ) : null}
        {!allergensAnswered ? (
          <Text role="status" style={type(15, 'regular', { color: color.secondary })}>
            {t('learn.create.choose')}
          </Text>
        ) : null}

        {create.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('learn.create.error')}
          </Text>
        ) : null}

        <Button
          label={t('learn.create.publish')}
          disabled={!valid}
          loading={create.isPending}
          onPress={publish}
        />
      </ScrollView>
    </View>
  );
}

const label = { ...type(14, 'semibold', { color: color.secondary }), marginTop: 4 };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  content: { paddingHorizontal: 20, gap: 12 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  area: {
    minHeight: 96,
    padding: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    textAlignVertical: 'top',
    color: color.ink,
  },
  grow: { flex: 1 },
  small: { width: 84 },
  inlineRow: { flexDirection: 'row', gap: 16 },
  inlineItem: { flex: 1, gap: 8 },
  ingredientRow: { flexDirection: 'row', gap: 8 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowButtons: { flexDirection: 'row', gap: 10 },
  options: { gap: 10 },
  option: {
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  optionSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  chipSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  notice: { gap: 12 },
});
