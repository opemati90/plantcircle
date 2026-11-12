import type { City } from '../../lib/backend/types';
import { countryNameResolver, filterCities, groupCitiesByCountry } from './cityGroups';

const city = (name: string, countryCode: string): City => ({
  id: name.toLowerCase(),
  name,
  countryCode,
  timezone: 'UTC',
});

describe('groupCitiesByCountry', () => {
  const cities = [
    city('Munich', 'DE'),
    city('Lisbon', 'PT'),
    city('Berlin', 'DE'),
    city('Hamburg', 'DE'),
  ];

  it('groups cities under their country, with cities in name order', () => {
    const groups = groupCitiesByCountry(cities, 'en');
    expect(groups.map((g) => g.countryCode)).toEqual(['DE', 'PT']);
    expect(groups[0]?.cities.map((c) => c.name)).toEqual(['Berlin', 'Hamburg', 'Munich']);
  });

  it('names countries in the reader’s language', () => {
    expect(groupCitiesByCountry(cities, 'de').map((g) => g.countryName)).toEqual([
      'Deutschland',
      'Portugal',
    ]);
    expect(groupCitiesByCountry(cities, 'en').map((g) => g.countryName)).toEqual([
      'Germany',
      'Portugal',
    ]);
  });

  it('keeps an empty list empty', () => {
    expect(groupCitiesByCountry([], 'en')).toEqual([]);
  });
});

describe('filterCities', () => {
  const names = countryNameResolver('en', { DE: 'Germany', PT: 'Portugal', BR: 'Brazil' });
  const cities = [
    city('Berlin', 'DE'),
    city('Munich', 'DE'),
    city('Lisbon', 'PT'),
    city('São Paulo', 'BR'),
  ];

  it('finds a city by part of its name, ignoring case', () => {
    expect(filterCities(cities, 'LIS', names).map((c) => c.name)).toEqual(['Lisbon']);
  });

  it('ignores accents, so "sao" finds São Paulo', () => {
    expect(filterCities(cities, 'sao', names).map((c) => c.name)).toEqual(['São Paulo']);
  });

  it('finds a city by a country that the catalogue does not list, as the heading shows it', () => {
    const sydney = [city('Sydney', 'AU')];
    const plain = countryNameResolver('en', {});
    expect(plain('AU')).toBe('Australia');
    expect(filterCities(sydney, 'australia', plain)).toHaveLength(1);
  });

  it('finds every city of a country by the country name', () => {
    expect(filterCities(cities, 'germ', names).map((c) => c.name)).toEqual([
      'Berlin',
      'Munich',
    ]);
  });

  it('needs every word to match, in any order', () => {
    expect(filterCities(cities, 'paulo brazil', names).map((c) => c.name)).toEqual([
      'São Paulo',
    ]);
    expect(filterCities(cities, 'paulo lisbon', names)).toEqual([]);
  });

  it('shows everything for an empty query', () => {
    expect(filterCities(cities, '  ', names)).toHaveLength(4);
  });
});
