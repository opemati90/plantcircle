import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { BottomSheet } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { catalogs } from '@plantcircle/copy';
import type { City } from '../../lib/backend/types';
import { currentLanguage } from '../../lib/i18n';
import {
  countryNameResolver,
  filterCities,
  groupCitiesByCountry,
  type CityGroup,
} from './cityGroups';

/** Radio list of cities. Choosing one saves it as the home city and closes the sheet. */
export function CityPickerSheet({
  open,
  onClose,
  cities,
  selectedId,
  failed,
  saving,
  onSelect,
  title,
  lead,
  anywhere,
  loadError,
  onRetry,
  selectedCountryCode,
  onSelectCountry,
}: {
  open: boolean;
  onClose: () => void;
  cities: City[];
  selectedId: string | null;
  /** The last save did not go through; say so and let the person try again. */
  failed: boolean;
  /** A save is in flight: the list locks so an older choice cannot land after a newer one. */
  saving: boolean;
  onSelect: (city: City) => void;
  title?: string;
  lead?: string;
  /** Optional first row for "no city": every city and online Plans. */
  anywhere?: { label: string; selected: boolean; onPress: () => void };
  /** The city list could not be loaded; offer a retry instead of an empty list. */
  loadError?: boolean;
  onRetry?: () => void;
  /** Explore only: choosing a country shows the Plans of all its cities. */
  selectedCountryCode?: string | null;
  onSelectCountry?: (group: CityGroup) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // Each time the sheet opens, start from the full list, not the last search.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);
  const countryName = countryNameResolver(
    currentLanguage(),
    catalogs[currentLanguage()].countries,
  );
  const shown = filterCities(cities, query, countryName);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title ?? t('home.changeCity')}
      lead={lead ?? t('home.cityLead')}
    >
      <ScrollView
        accessibilityRole="radiogroup"
        accessibilityLabel={t('home.changeCity')}
        style={styles.scroll}
        contentContainerStyle={styles.list}
      >
        {anywhere ? (
          <Pressable
            accessibilityRole="radio"
            aria-checked={anywhere.selected}
            disabled={saving}
            onPress={anywhere.onPress}
            style={[styles.row, anywhere.selected && styles.rowSelected]}
          >
            <Text style={type(17, 'semibold', { tracking: -0.3 })}>{anywhere.label}</Text>
            <View style={[styles.dot, anywhere.selected && styles.dotSelected]} />
          </Pressable>
        ) : null}
        {groupCitiesByCountry(
          shown,
          currentLanguage(),
          catalogs[currentLanguage()].countries,
        ).map((group) => (
          <View key={group.countryCode} style={styles.group}>
            <Text
              accessibilityRole="header"
              style={type(13, 'bold', { color: color.secondary, tracking: 0.5 })}
            >
              {group.countryName.toUpperCase()}
            </Text>
            {onSelectCountry ? (
              <Pressable
                accessibilityRole="radio"
                aria-checked={selectedCountryCode === group.countryCode}
                disabled={saving}
                onPress={() => {
                  if (!saving) onSelectCountry(group);
                }}
                style={[
                  styles.row,
                  selectedCountryCode === group.countryCode && styles.rowSelected,
                ]}
              >
                <Text style={type(17, 'semibold', { tracking: -0.3 })}>
                  {t('explore.allInCountry', { country: group.countryName })}
                </Text>
                <View
                  style={[
                    styles.dot,
                    selectedCountryCode === group.countryCode && styles.dotSelected,
                  ]}
                />
              </Pressable>
            ) : null}
            {group.cities.map((city) => {
              const selected = city.id === selectedId;
              return (
                <Pressable
                  key={city.id}
                  accessibilityRole="radio"
                  aria-checked={selected}
                  disabled={saving}
                  aria-disabled={saving}
                  onPress={() => {
                    if (!saving) onSelect(city);
                  }}
                  style={[styles.row, selected && styles.rowSelected]}
                >
                  <Text style={type(17, 'semibold', { tracking: -0.3 })}>{city.name}</Text>
                  <View style={[styles.dot, selected && styles.dotSelected]} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      {cities.length > 0 ? (
        <TextInput
          accessibilityLabel={t('city.searchLabel')}
          placeholder={t('city.searchPlaceholder')}
          placeholderTextColor={color.secondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.search, type(17)]}
        />
      ) : null}
      {cities.length > 0 && shown.length === 0 ? (
        <Text role="status" style={type(16, 'regular', { color: color.secondary })}>
          {t('city.noMatch', { query: query.trim() })}
        </Text>
      ) : null}
      {cities.length === 0 && !loadError ? (
        <Text role="status" style={type(15, 'regular', { color: color.secondary })}>
          {t('city.loading')}
        </Text>
      ) : null}
      {loadError ? (
        <View style={styles.retry}>
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('city.loadError')}
          </Text>
          <Button label={t('common.tryAgain')} variant="outline" onPress={() => onRetry?.()} />
        </View>
      ) : null}
      {failed ? (
        <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
          {t('home.cityFailed')}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Long lists scroll inside the sheet; the limit keeps the heading and close control visible.
  scroll: { maxHeight: 420 },
  search: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    backgroundColor: color.fill,
  },
  list: { gap: 18 },
  group: { gap: 10 },
  retry: { gap: 12, paddingTop: 8 },
  row: {
    minHeight: size.touchMin + 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  rowSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.borderControl,
  },
  dotSelected: { borderColor: color.brand, backgroundColor: color.brand },
});
