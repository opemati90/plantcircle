import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { BottomSheet } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { catalogs } from '@plantcircle/copy';
import type { City } from '../../lib/backend/types';
import { deviceRegionCode } from '../../lib/device';
import { currentLanguage } from '../../lib/i18n';
import {
  countryNameResolver,
  filterCities,
  groupCitiesByCountry,
  sameCityName,
  type CityGroup,
} from './cityGroups';

export interface CityChooserProps {
  cities: City[];
  selectedId: string | null;
  /** A save is in flight: the list locks so an older choice cannot land after a newer one. */
  saving: boolean;
  onSelect: (city: City) => void;
  /** Optional first row for "no city": every city and online Plans. */
  anywhere?: { label: string; selected: boolean; onPress: () => void };
  /** The city list could not be loaded; offer a retry instead of an empty list. */
  loadError?: boolean;
  onRetry?: () => void;
  /** Explore only: choosing a country shows the Plans of all its cities. */
  selectedCountryCode?: string | null;
  onSelectCountry?: (group: CityGroup) => void;
  /** A typed name no known city has: add it (the device's country and time zone), then select. */
  onCreate: (name: string) => void;
  creating: boolean;
  createFailed: boolean;
  /** Reset the search each time this turns true (a sheet opening). */
  resetKey?: boolean;
  autoFocus?: boolean;
}

/**
 * One search field, no prebuilt list (design note §1). Nothing typed: "Anywhere" and the current
 * choice. Typing: matching known cities, country rows where offered, and a last row to use the
 * typed name when no known city has it.
 */
export function CityChooser({
  cities,
  selectedId,
  saving,
  onSelect,
  anywhere,
  loadError,
  onRetry,
  selectedCountryCode,
  onSelectCountry,
  onCreate,
  creating,
  createFailed,
  resetKey,
  autoFocus,
}: CityChooserProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (resetKey) setQuery('');
  }, [resetKey]);
  const language = currentLanguage();
  const countryName = countryNameResolver(language, catalogs[language].countries);
  const typed = query.trim();
  const locked = saving || creating;
  const shown = typed ? filterCities(cities, typed, countryName) : [];
  const groups = groupCitiesByCountry(shown, language, catalogs[language].countries);
  const current = selectedId ? (cities.find((city) => city.id === selectedId) ?? null) : null;
  // A new city goes under the device's country: only a namesake there counts as known.
  const region = deviceRegionCode();
  const canCreate =
    typed.length > 0 &&
    !cities.some((city) => city.countryCode === region && sameCityName(city.name, typed));

  const row = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
    role: 'radio' | 'button' = 'radio',
  ) => (
    <Pressable
      key={key}
      testID={`city-${key}`}
      accessibilityRole={role}
      aria-checked={role === 'radio' ? selected : undefined}
      disabled={locked}
      aria-disabled={locked}
      onPress={() => {
        if (locked) return;
        // A choice ends typing: the keyboard would otherwise cover the Continue button.
        Keyboard.dismiss();
        onPress();
      }}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <Text style={[type(17, 'semibold', { tracking: -0.3 }), styles.rowLabel]}>{label}</Text>
      {role === 'radio' ? (
        <View style={[styles.dot, selected && styles.dotSelected]} />
      ) : (
        <Text style={type(15, 'semibold', { color: color.brand })}>{t('common.add')}</Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.chooser}>
      <TextInput
        accessibilityLabel={t('city.searchLabel')}
        placeholder={t('city.searchPlaceholder')}
        placeholderTextColor={color.secondary}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="words"
        autoFocus={autoFocus}
        clearButtonMode="while-editing"
        returnKeyType="done"
        onSubmitEditing={() => {
          if (canCreate && !locked) onCreate(typed);
        }}
        style={[styles.search, type(17)]}
      />
      <ScrollView
        accessibilityRole="radiogroup"
        accessibilityLabel={t('city.group')}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.list}
      >
        {anywhere ? row('anywhere', anywhere.label, anywhere.selected, anywhere.onPress) : null}
        {!typed && current
          ? row(current.id, current.name, true, () => {
              onSelect(current);
            })
          : null}
        {!typed && selectedCountryCode && onSelectCountry
          ? row(
              `country-${selectedCountryCode}`,
              t('explore.allInCountry', { country: countryName(selectedCountryCode) }),
              true,
              () => {
                onSelectCountry({
                  countryCode: selectedCountryCode,
                  countryName: countryName(selectedCountryCode),
                  cities: cities.filter((city) => city.countryCode === selectedCountryCode),
                });
              },
            )
          : null}
        {groups.map((group) => (
          <View key={group.countryCode} style={styles.group}>
            <Text
              accessibilityRole="header"
              style={type(13, 'bold', { color: color.secondary, tracking: 0.5 })}
            >
              {group.countryName.toUpperCase()}
            </Text>
            {onSelectCountry
              ? row(
                  `country-${group.countryCode}`,
                  t('explore.allInCountry', { country: group.countryName }),
                  selectedCountryCode === group.countryCode,
                  () => {
                    onSelectCountry(group);
                  },
                )
              : null}
            {group.cities.map((city) =>
              row(city.id, city.name, city.id === selectedId, () => {
                onSelect(city);
              }),
            )}
          </View>
        ))}
        {canCreate && !loadError
          ? row(
              'create',
              creating
                ? t('city.adding', { name: typed })
                : t('city.use', { query: typed, country: countryName(region) }),
              false,
              () => {
                onCreate(typed);
              },
              'button',
            )
          : null}
        {!typed ? (
          <Text style={type(14, 'regular', { color: color.secondary, leading: 1.5 })}>
            {t('city.hint')}
          </Text>
        ) : null}
        {createFailed ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('city.addFailed')}
          </Text>
        ) : null}
        {loadError ? (
          <View style={styles.retry}>
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('city.loadError')}
            </Text>
            <Button
              label={t('common.tryAgain')}
              variant="outline"
              onPress={() => onRetry?.()}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The chooser in a sheet. Choosing saves the home city (or the browse choice) and closes it. */
export function CityPickerSheet({
  open,
  onClose,
  failed,
  title,
  lead,
  ...chooser
}: Omit<CityChooserProps, 'resetKey'> & {
  open: boolean;
  onClose: () => void;
  /** The last save did not go through; say so and let the person try again. */
  failed: boolean;
  title?: string;
  lead?: string;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title ?? t('home.changeCity')}
      lead={lead ?? t('home.cityLead')}
    >
      <CityChooser {...chooser} resetKey={open} />
      {failed ? (
        <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
          {t('home.cityFailed')}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chooser: { gap: 14 },
  // Long result lists scroll inside the sheet; the limit keeps the heading and close control visible.
  scroll: { maxHeight: 420 },
  search: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    backgroundColor: color.fill,
  },
  list: { gap: 14 },
  group: { gap: 10 },
  retry: { gap: 12, paddingTop: 8 },
  row: {
    minHeight: size.touchMin + 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  rowLabel: { flexShrink: 1 },
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
