import {
  catalogs,
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGES,
  type Language,
} from '@plantcircle/copy';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { setDateLocale } from './dates';
import { appStorage } from './storage';

const STORAGE_KEY = 'pc.language';

/** Formatting locale when the device does not use this language itself. */
const FALLBACK_FORMAT: Record<Language, string> = { en: 'en-GB', de: 'de-DE' };

/** First device locale we have a catalogue for, in the person's own order of preference. */
function deviceLanguage(): Language {
  for (const locale of getLocales()) {
    if (isLanguage(locale.languageCode)) return locale.languageCode;
  }
  return DEFAULT_LANGUAGE;
}

/** Dates follow the device's regional conventions when it speaks the active language. */
function formatLocale(language: Language): string {
  const match = getLocales().find((locale) => locale.languageCode === language);
  return match?.languageTag ?? FALLBACK_FORMAT[language];
}

export async function initI18n(): Promise<void> {
  let stored: string | null = null;
  try {
    stored = await appStorage.get(STORAGE_KEY);
  } catch {
    // Unreadable storage: fall back to the device language.
  }
  const language = isLanguage(stored) ? stored : deviceLanguage();
  setDateLocale(formatLocale(language));
  await i18n.use(initReactI18next).init({
    resources: Object.fromEntries(
      LANGUAGES.map((code) => [code, { translation: catalogs[code] }]),
    ),
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    // React Native renders text, not HTML: nothing to escape.
    interpolation: { escapeValue: false },
  });
}

export const currentLanguage = (): Language =>
  isLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;

/** An explicit choice overrides the device language and is remembered. */
export async function setLanguage(language: Language): Promise<void> {
  setDateLocale(formatLocale(language));
  await i18n.changeLanguage(language);
  appStorage.set(STORAGE_KEY, language).catch(() => {
    // Not persisted: the choice still applies until the app restarts.
  });
}
