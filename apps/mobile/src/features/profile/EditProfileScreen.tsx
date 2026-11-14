import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ChevronRightIcon } from '../../components/icons';
import { BottomSheet, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { Profile } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { CityPickerSheet } from '../home/CityPickerSheet';
import { GOALS } from '../onboarding/onboardingStore';
import { useCities, useEnsureCity, useSetCity } from '../plans/queries';

const NAME_MAX = 40;

/**
 * Edit profile: the name other members see, the home city (the same picker as Home), and what
 * brings you here (the onboarding choices, changeable later as promised there).
 */
export default function EditProfileScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { session, profile, profileError, retryProfile } = useAuth();
  const cities = useCities();
  const setCity = useSetCity();
  const ensureCity = useEnsureCity();
  const [draft, setDraft] = useState<{ name: string; goals: string[] } | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const name = draft?.name ?? profile?.displayName ?? '';
  const goals = (draft?.goals ?? profile?.goals ?? []).filter((g) =>
    (GOALS as readonly string[]).includes(g),
  );
  const length = Array.from(name.trim()).length;
  const cityName = cities.data?.find((c) => c.id === profile?.cityId)?.name ?? null;

  const save = useMutation({
    mutationFn: () => backend.updateProfile({ displayName: name.trim(), goals }),
    onSuccess: (next) => {
      queryClient.setQueryData<Profile | null>(['profile', session?.userId], next);
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      leave();
    },
  });

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };
  // Unsaved name or interest changes ask before they are dropped (the city saves on its own).
  const [discarding, setDiscarding] = useState(false);
  const back = () => {
    if (draft !== null && !save.isPending) setDiscarding(true);
    else leave();
  };
  const header = <ScreenHeader backLabel={t('common.back')} onBack={back} />;

  if (session === null) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('people.signedOut.title')}
          text={t('account.signedOut')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/profile/edit' } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (profileError) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('errors.serverTitle')}
          text={t('errors.serverText')}
          action={<Button variant="outline" label={t('common.retry')} onPress={retryProfile} />}
        />
      </View>
    );
  }
  if (!profile) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        {header}
        <View style={styles.content}>
          <Skeleton width="100%" height={160} radius={radius.card} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('profile.editTitle')}
        </Text>

        <Text style={styles.label}>{t('profile.nameLabel')}</Text>
        <TextInput
          accessibilityLabel={t('profile.nameLabel')}
          value={name}
          onChangeText={(v) => {
            setDraft({ name: v, goals });
          }}
          autoCapitalize="words"
          style={[styles.field, type(17)]}
        />
        <Text
          style={type(13, 'regular', {
            color: length > NAME_MAX ? color.danger : color.secondary,
          })}
        >
          {t('profile.nameNote', { count: length, max: NAME_MAX })}
        </Text>

        <Text style={styles.label}>{t('profile.cityLabel')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('profile.cityLabel')}: ${cityName ?? t('home.anywhere')}`}
          onPress={() => {
            setCityOpen(true);
          }}
          style={styles.cityRow}
        >
          <Text style={[type(17, 'medium'), styles.grow]}>
            {cityName ?? t('home.anywhere')}
          </Text>
          <Text style={type(14, 'regular', { color: color.secondary })}>
            {t('home.changeCity')}
          </Text>
          <ChevronRightIcon size={18} strokeWidth={2.4} color={color.secondary} />
        </Pressable>

        <Text style={styles.label}>{t('goals.title')}</Text>
        <Text style={type(14, 'regular', { color: color.secondary })}>{t('goals.lead')}</Text>
        <View accessibilityRole="list" style={styles.goals}>
          {GOALS.map((goal) => {
            const on = goals.includes(goal);
            return (
              <Pressable
                key={goal}
                accessibilityRole="checkbox"
                aria-checked={on}
                accessibilityState={{ checked: on }}
                onPress={() => {
                  setDraft({
                    name,
                    goals: on ? goals.filter((g) => g !== goal) : [...goals, goal],
                  });
                }}
                style={[styles.goal, on && styles.goalOn]}
              >
                <Text style={type(16, 'semibold', { color: on ? '#FFFFFF' : color.ink })}>
                  {t(`goals.${goal}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {save.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('profile.saveError')}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Button
            label={t('profile.save')}
            disabled={length === 0 || length > NAME_MAX || draft === null}
            loading={save.isPending}
            onPress={() => {
              save.mutate();
            }}
          />
        </View>
      </ScrollView>

      <BottomSheet
        open={discarding}
        onClose={() => {
          setDiscarding(false);
        }}
        title={t('profile.discardTitle')}
        lead={t('profile.discardLead')}
      >
        <View style={styles.sheet}>
          <Button
            label={t('profile.keepEditing')}
            onPress={() => {
              setDiscarding(false);
            }}
          />
          <Button
            variant="outline"
            label={t('profile.discard')}
            onPress={() => {
              setDiscarding(false);
              setDraft(null);
              leave();
            }}
          />
        </View>
      </BottomSheet>

      <CityPickerSheet
        open={cityOpen}
        onClose={() => {
          setCityOpen(false);
        }}
        cities={cities.data ?? []}
        loadError={cities.isError}
        onRetry={() => void cities.refetch()}
        anywhere={{
          label: t('home.anywhere'),
          selected: profile.cityId === null,
          onPress: () => {
            setCity.mutate(null, {
              onSuccess: () => {
                setCityOpen(false);
              },
            });
          },
        }}
        selectedId={profile.cityId}
        failed={setCity.isError}
        saving={setCity.isPending}
        onSelect={(city) => {
          setCity.mutate(city.id, {
            onSuccess: () => {
              setCityOpen(false);
            },
          });
        }}
        onCreate={(name) => {
          ensureCity.mutate(name, {
            onSuccess: (city) => {
              setCity.mutate(city.id, {
                onSuccess: () => {
                  setCityOpen(false);
                },
              });
            },
          });
        }}
        creating={ensureCity.isPending}
        createFailed={ensureCity.isError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 8 },
  label: { ...type(17, 'semibold'), marginTop: 18 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  grow: { flex: 1, minWidth: 0 },
  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  goal: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  goalOn: { backgroundColor: color.ink, borderColor: color.ink },
  footer: { paddingTop: 20 },
  sheet: { gap: 10 },
});
