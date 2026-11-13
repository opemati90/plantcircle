import type { ImageSource } from 'expo-image';
import type { Plan } from '../../lib/backend/types';

/** Photos shipped with the app (welcome hero and development sample Plans). */
const BUNDLED: Record<string, number> = {
  '/images/cooking-together.jpg':
    require('../../../assets/images/cooking-together.jpg') as number,
  '/images/potluck-spread.jpg': require('../../../assets/images/potluck-spread.jpg') as number,
  '/images/pantry-jars.jpg': require('../../../assets/images/pantry-jars.jpg') as number,
};

export const welcomePhoto = BUNDLED['/images/cooking-together.jpg'] as number;

/** Recipes carry no cover photo yet (docs/16-open-questions.md): a bundled photo chosen by id. */
export function recipePhoto(recipeId: string): number {
  const photos = Object.values(BUNDLED);
  const sum = Array.from(recipeId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return photos[sum % photos.length] ?? welcomePhoto;
}

export function planImage(plan: Plan): ImageSource | number | null {
  if (!plan.imagePath) return null;
  if (plan.imagePath.startsWith('https://')) return { uri: plan.imagePath };
  return BUNDLED[plan.imagePath] ?? null;
}

/** "38% center" → horizontal focal point for cropping. */
export function imageFocus(plan: Plan): { left: `${number}%`; top: '50%' } {
  const percent = Number(/^(\d{1,3})%/.exec(plan.imageFocus ?? '')?.[1] ?? 50);
  return { left: `${percent}%`, top: '50%' };
}
