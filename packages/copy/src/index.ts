import { de } from './de';
import { en } from './en';

export type { Catalog } from './en';

/** Locales are data: add a catalogue here and it becomes selectable. */
export const catalogs = { en, de } as const;
export type Language = keyof typeof catalogs;
export const LANGUAGES = Object.keys(catalogs) as Language[];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && value in catalogs;
