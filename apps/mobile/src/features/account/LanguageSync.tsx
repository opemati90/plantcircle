import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings, useUpdateSettings } from './queries';

/**
 * Keeps the member's language on the server equal to the app's, so pushes arrive in it
 * (functions/push-dispatch renders them from the copy catalogues). Renders nothing.
 */
export function LanguageSync() {
  const { i18n } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const stored = settings.data?.language;
  useEffect(() => {
    if (!stored || stored === language || update.isPending) return;
    update.mutate({ language });
    // The mutation object changes identity each render; what matters is the pair of languages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, language]);
  return null;
}
