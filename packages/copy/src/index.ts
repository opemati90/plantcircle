import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { nl } from './nl';
import { pl } from './pl';
import { pt } from './pt';

export type { Catalog } from './en';

/** Locales are data: add a catalogue here and it becomes selectable. */
export const catalogs = { en, de, es, pt, fr, pl, it, nl } as const;
export type Language = keyof typeof catalogs;
export const LANGUAGES = Object.keys(catalogs) as Language[];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && value in catalogs;
