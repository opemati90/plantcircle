import type { City } from '../../lib/backend/types';

/**
 * The name shown for a country: the copy catalogue first, then the platform's list, then the
 * code. Grouping and search both use it, so what is shown is always what can be found.
 */
export function countryNameResolver(
  language: string,
  catalogNames: Record<string, string>,
): (code: string) => string {
  const names =
    typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames([language], { type: 'region' })
      : null;
  return (code) => catalogNames[code] ?? names?.of(code) ?? code;
}

export interface CityGroup {
  countryCode: string;
  countryName: string;
  cities: City[];
}

/**
 * Cities grouped by country, sorted in the language the person reads. Country names come from
 * the copy catalogue; the platform's list is only a fallback for countries not yet in it.
 */
export function groupCitiesByCountry(
  cities: City[],
  language: string,
  catalogNames: Record<string, string> = {},
): CityGroup[] {
  const countryName = countryNameResolver(language, catalogNames);
  const collator = new Intl.Collator(language);
  const groups = new Map<string, CityGroup>();
  for (const city of cities) {
    const group = groups.get(city.countryCode) ?? {
      countryCode: city.countryCode,
      countryName: countryName(city.countryCode),
      cities: [],
    };
    group.cities.push(city);
    groups.set(city.countryCode, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      cities: [...group.cities].sort((a, b) => collator.compare(a.name, b.name)),
    }))
    .sort((a, b) => collator.compare(a.countryName, b.countryName));
}

/**
 * Cities whose name or country matches every word typed (case and accents ignored), so
 * "sao" finds São Paulo and "germ" finds every German city.
 */
export function filterCities(
  cities: City[],
  query: string,
  countryName: (code: string) => string,
): City[] {
  const words = normalizeWords(query);
  if (words.length === 0) return cities;
  return cities.filter((city) => {
    const haystack = normalizeWords(
      `${city.name} ${countryName(city.countryCode)} ${city.countryCode}`,
    ).join(' ');
    return words.every((word) => haystack.includes(word));
  });
}

function normalizeWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}
