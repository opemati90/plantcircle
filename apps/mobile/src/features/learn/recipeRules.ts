import type { TFunction } from 'i18next';
import type { Recipe, RecipeAllergen } from '../../lib/backend/types';

/** A quantity for a different number of servings, from the recipe's own quantity. */
export function scaleQuantity(qty: number | null, serves: number, to: number): number | null {
  return qty === null ? null : (qty * to) / serves;
}

/**
 * Amounts below one keep two significant figures, so a scaled 0.0025 never reads as 0. Amounts
 * below ten keep two decimals; larger ones read as whole numbers.
 */
export function formatQuantity(value: number, language: string): string {
  const options: Intl.NumberFormatOptions =
    value < 1
      ? { maximumSignificantDigits: 2 }
      : value < 10
        ? { maximumFractionDigits: 2 }
        : { maximumFractionDigits: 0 };
  return new Intl.NumberFormat(language, options).format(value);
}

export function allergenNames(t: TFunction, allergens: RecipeAllergen[]): string {
  return allergens.map((allergen) => t(`allergen.${allergen}`)).join(', ');
}

/** Minutes and servings on one line, leaving out what the poster did not give. */
export function recipeMeta(t: TFunction, recipe: Recipe): string {
  const parts = [
    recipe.minutes === null ? null : t('learn.minutes', { minutes: recipe.minutes }),
    t('learn.serves', { servings: recipe.serves }),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** The allergen line: the poster's list, or plainly "not confirmed". Never an assumed "none". */
export function allergenLine(t: TFunction, recipe: Recipe): string {
  return recipe.allergensConfirmed
    ? t('learn.allergens.declared', { allergens: allergenNames(t, recipe.allergens) })
    : t('learn.allergens.unconfirmed');
}
