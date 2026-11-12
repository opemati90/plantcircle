import { catalogs, type Language } from '@plantcircle/copy';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...all, [path]: value }
      : { ...all, ...flatten(value, path) };
  }, {});
}

/** `goingCount_one`, `_few`, `_many`… are one message with several forms. */
const PLURAL_FORM = /_(zero|one|two|few|many|other)$/;
const messageKey = (key: string) => key.replace(PLURAL_FORM, '');
const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();

const languages = Object.keys(catalogs) as Language[];
const english = flatten(catalogs.en);

describe('copy catalogues', () => {
  it('have the same messages, with the same placeholders, in every language', () => {
    const expected = [...new Set(Object.keys(english).map(messageKey))].sort();
    for (const language of languages) {
      const flat = flatten(catalogs[language]);
      const messages = [...new Set(Object.keys(flat).map(messageKey))].sort();
      expect({ language, messages }).toEqual({ language, messages: expected });
      for (const [key, text] of Object.entries(flat)) {
        const reference = english[key] ?? english[`${messageKey(key)}_other`] ?? '';
        expect({ language, key, vars: placeholders(text) }).toEqual({
          language,
          key,
          vars: placeholders(reference),
        });
      }
    }
  });

  it('give every plural message an `_other` form in every language', () => {
    for (const language of languages) {
      const flat = flatten(catalogs[language]);
      const plurals = Object.keys(english).filter((key) => key.endsWith('_one'));
      for (const key of plurals) {
        const base = messageKey(key);
        expect({ language, base, other: flat[`${base}_other`] !== undefined }).toEqual({
          language,
          base,
          other: true,
        });
      }
    }
  });

  it('use typographic apostrophes and no empty strings', () => {
    for (const language of languages) {
      for (const [key, text] of Object.entries(flatten(catalogs[language]))) {
        expect({ language, key, straight: text.includes("'") }).toEqual({
          language,
          key,
          straight: false,
        });
        expect({ language, key, empty: text.trim() === '' }).toEqual({
          language,
          key,
          empty: false,
        });
      }
    }
  });

  it('name every language in its own language in every catalogue', () => {
    for (const language of languages) {
      const names = catalogs[language].language;
      for (const code of languages) {
        expect({ language, code, name: names[code] }).toEqual({
          language,
          code,
          name: names[code],
        });
        expect(names[code].length).toBeGreaterThan(0);
      }
    }
  });
});
