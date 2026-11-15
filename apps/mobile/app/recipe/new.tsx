import { Redirect } from 'expo-router';
import Screen from '../../src/features/learn/CreateRecipeScreen';
import { features } from '../../src/lib/features';

/** Recipes are switched off at launch (src/lib/features.ts): their links lead home. */
export default function Route() {
  return features.recipes ? <Screen /> : <Redirect href="/home" />;
}
