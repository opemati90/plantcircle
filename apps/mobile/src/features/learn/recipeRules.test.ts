import type { TFunction } from 'i18next';
import type { Recipe } from '../../lib/backend/types';
import { allergenLine, formatQuantity, recipeMeta, scaleQuantity } from './recipeRules';

// The rules only read keys and their values, so a simple stand-in translator is enough here.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

const recipe: Recipe = {
  id: 'r1',
  title: 'Soup',
  cuisine: null,
  serves: 4,
  minutes: 30,
  intro: null,
  allergens: [],
  allergensConfirmed: false,
  circleId: 'c1',
  circleName: 'Kitchen',
  authorName: 'Ama',
  createdAt: '2026-11-10T10:00:00Z',
};

describe('scaleQuantity', () => {
  it('rescales an amount to the servings chosen', () => {
    expect(scaleQuantity(500, 4, 8)).toBe(1000);
    expect(scaleQuantity(200, 4, 2)).toBe(100);
  });

  it('keeps an amount that was never given as none', () => {
    expect(scaleQuantity(null, 4, 8)).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('formats numbers for the reader’s language', () => {
    expect(formatQuantity(1000, 'en')).toBe('1,000');
    expect(formatQuantity(12.6, 'en')).toBe('13');
  });

  it('never shows a small positive amount as zero', () => {
    expect(formatQuantity(0.01, 'en')).toBe('0.01');
    expect(formatQuantity(0.0025, 'en')).toBe('0.0025');
    expect(formatQuantity(1.25, 'en')).toBe('1.25');
  });
});

describe('recipeMeta', () => {
  it('leaves out minutes the poster did not give', () => {
    expect(recipeMeta(t, recipe)).toContain('learn.serves');
    expect(recipeMeta(t, { ...recipe, minutes: null })).not.toContain('learn.minutes');
  });
});

describe('allergenLine', () => {
  it('says "not confirmed" rather than assuming none', () => {
    expect(allergenLine(t, recipe)).toBe('learn.allergens.unconfirmed');
  });

  it('shows the poster’s declared allergens once confirmed', () => {
    const confirmed = { ...recipe, allergens: ['none' as const], allergensConfirmed: true };
    expect(allergenLine(t, confirmed)).toContain('learn.allergens.declared');
  });
});
