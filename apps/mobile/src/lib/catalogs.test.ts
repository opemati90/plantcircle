import { catalogs } from '@plantcircle/copy';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...all, [path]: value }
      : { ...all, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('copy catalogues', () => {
  const en = flatten(catalogs.en);
  const de = flatten(catalogs.de);

  it('have the same keys and the same placeholders in every language', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect({ key, vars: placeholders(de[key] ?? '') }).toEqual({
        key,
        vars: placeholders(en[key] ?? ''),
      });
    }
  });

  it('use typographic apostrophes and no empty strings', () => {
    for (const [key, text] of Object.entries({ ...en, ...de })) {
      expect({ key, straight: text.includes("'") }).toEqual({ key, straight: false });
      expect({ key, empty: text.trim() === '' }).toEqual({ key, empty: false });
    }
  });
});
