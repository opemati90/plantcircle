import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { LANGUAGES, type Language } from '@plantcircle/copy';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ChevronDownIcon, SproutIcon } from '../../components/icons';
import { BottomSheet, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { CityChooser } from '../home/CityPickerSheet';
import { currentLanguage, setLanguage } from '../../lib/i18n';
import { useAuth } from '../auth/useAuth';
import { welcomePhoto } from '../plans/planImage';
import { useCities, useEnsureCity } from '../plans/queries';
import { GOALS, getOnboarding, saveOnboarding, type Goal } from './onboardingStore';

function Progress({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('goals.step', { step })}
      style={styles.progress}
    >
      <View style={[styles.progressBar, styles.progressDone]} />
      <View style={[styles.progressBar, step === 2 && styles.progressDone]} />
    </View>
  );
}

function OptionRow({
  role,
  selected,
  title,
  subtitle,
  onPress,
}: {
  role: 'checkbox' | 'radio';
  selected: boolean;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      aria-checked={selected}
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <View style={styles.optionText}>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(17, selected ? 'semibold' : 'medium', { tracking: -0.2 })}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(13, 'regular', { color: color.secondary })}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.dot, selected && styles.dotSelected]}>
        {selected ? <View style={styles.dotInner} /> : null}
      </View>
    </Pressable>
  );
}

/** First run: welcome → what brings you here → city. Each step is its own route. */
export function OnboardingScreen({ step }: { step: 'welcome' | 'goals' | 'city' }) {
  const router = useRouter();
  const insets = useScreenInsets();
  const { session } = useAuth();
  const [stored] = useState(getOnboarding);
  const [goals, setGoals] = useState<Goal[]>(stored.goals);
  const [cityId, setCityId] = useState<string | null>(stored.cityId);
  const cities = useCities();
  const ensureCity = useEnsureCity();
  const { t } = useTranslation();
  const language = currentLanguage();
  const [languageSheet, setLanguageSheet] = useState(false);

  if (session || stored.done) return <Redirect href="/home" />;

  const finish = (chosen: string | null) => {
    saveOnboarding({ goals, cityId: chosen, done: true });
    // Without a city, Home has nothing nearby to show; online Plans are open to everyone.
    if (chosen) router.replace('/home');
    else router.replace({ pathname: '/explore', params: { where: 'online' } });
  };

  if (step === 'welcome') {
    return (
      <View style={styles.hero}>
        <Photo source={welcomePhoto} contentPosition={{ left: '38%', top: '50%' }} />
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.4)',
            'rgba(0,0,0,0)',
            'rgba(0,0,0,0)',
            'rgba(0,0,0,0.9)',
            'rgba(0,0,0,0.94)',
          ]}
          locations={[0, 0.2, 0.32, 0.58, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.brand, { top: insets.top }]}>
          <SproutIcon size={22} color="#FFFFFF" />
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(17, 'semibold', { color: '#FFFFFF', tracking: -0.3 })}
          >
            PlantCircle
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('language.label')}: ${t(`language.${language}`)}`}
            onPress={() => {
              setLanguageSheet(true);
            }}
            style={styles.languageChip}
          >
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(13, 'semibold', { color: '#FFFFFF' })}
            >
              {t(`language.${language}`)}
            </Text>
            <ChevronDownIcon size={12} strokeWidth={2.6} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={[styles.heroContent, { bottom: Math.max(40, insets.bottom + 16) }]}>
          <Text
            maxFontSizeMultiplier={1.4}
            accessibilityRole="header"
            style={type(46, 'bold', { color: '#FFFFFF', tracking: -1.6, leading: 1 })}
          >
            {t('welcome.title')}
          </Text>
          <Text
            maxFontSizeMultiplier={1.6}
            style={[
              type(18, 'regular', { color: '#FFFFFF', tracking: -0.2, leading: 1.5 }),
              styles.heroLead,
            ]}
          >
            {t('welcome.lead')}
          </Text>
          <Button
            variant="inverse"
            label={t('welcome.getStarted')}
            onPress={() => {
              router.push('/goals');
            }}
            style={styles.heroCta}
          />
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              router.push('/sign-up');
            }}
            style={styles.heroLink}
          >
            <Text maxFontSizeMultiplier={2.0} style={type(15, 'regular', { color: '#FFFFFF' })}>
              {t('welcome.haveAccount')}
            </Text>
          </Pressable>
        </View>
        <BottomSheet
          open={languageSheet}
          onClose={() => {
            setLanguageSheet(false);
          }}
          title={t('language.label')}
        >
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('language.label')}
            style={styles.options}
          >
            {LANGUAGES.map((code: Language) => (
              <OptionRow
                key={code}
                role="radio"
                selected={code === language}
                title={t(`language.${code}`)}
                onPress={() => {
                  setLanguageSheet(false);
                  void setLanguage(code);
                }}
              />
            ))}
          </View>
        </BottomSheet>
      </View>
    );
  }

  const frame = { paddingTop: insets.top + 6, paddingBottom: Math.max(40, insets.bottom + 16) };

  if (step === 'goals') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.step, frame]}>
        <Progress step={1} />
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={[type(30, 'bold', { tracking: -0.7, leading: 1.1 }), styles.title]}
        >
          {t('goals.title')}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={[type(16, 'regular', { color: color.secondary }), styles.lead]}
        >
          {t('goals.lead')}
        </Text>
        <View style={styles.options}>
          {GOALS.map((goal) => {
            const selected = goals.includes(goal);
            return (
              <OptionRow
                key={goal}
                role="checkbox"
                selected={selected}
                title={t(`goals.${goal}`)}
                onPress={() => {
                  setGoals(selected ? goals.filter((g) => g !== goal) : [...goals, goal]);
                }}
              />
            );
          })}
        </View>
        <View style={styles.actions}>
          <Button
            label={t('common.continue')}
            onPress={() => {
              saveOnboarding({ goals, cityId, done: false });
              router.push('/city');
            }}
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.step, frame]}
      keyboardShouldPersistTaps="handled"
    >
      <Progress step={2} />
      <Text
        maxFontSizeMultiplier={1.4}
        accessibilityRole="header"
        style={[type(30, 'bold', { tracking: -0.7, leading: 1.1 }), styles.title]}
      >
        {t('city.title')}
      </Text>
      <Text
        maxFontSizeMultiplier={2.0}
        style={[type(16, 'regular', { color: color.secondary }), styles.lead]}
      >
        {t('city.lead')}
      </Text>
      {cities.isPending ? (
        <View role="status" accessibilityLabel={t('city.loading')} style={styles.options}>
          <Skeleton width="100%" height={60} radius={radius.control} />
          <Skeleton width="100%" height={60} radius={radius.control} />
        </View>
      ) : (
        <CityChooser
          cities={cities.data ?? []}
          loadError={cities.isError}
          onRetry={() => void cities.refetch()}
          selectedId={cityId}
          saving={false}
          onSelect={(city) => {
            setCityId(city.id);
          }}
          onCreate={(name, countryCode, timezone) => {
            ensureCity.mutate(
              { name, countryCode, timezone },
              {
                onSuccess: (city) => {
                  setCityId(city.id);
                },
              },
            );
          }}
          creating={ensureCity.isPending}
          createFailed={ensureCity.isError}
        />
      )}
      <Text
        maxFontSizeMultiplier={2.0}
        style={[type(14, 'regular', { color: color.secondary, leading: 1.5 }), styles.note]}
      >
        {t('city.elsewhere')}
      </Text>
      <View style={styles.actions}>
        <Button
          label={t('common.continue')}
          disabled={!cityId || ensureCity.isPending}
          onPress={() => {
            finish(cityId);
          }}
        />
        <Button
          variant="ghost"
          label={t('city.skip')}
          onPress={() => {
            finish(null);
          }}
        />
        <Text
          maxFontSizeMultiplier={2.0}
          style={[type(13, 'regular', { color: color.secondary, leading: 1.5 }), styles.center]}
        >
          {t('city.legal')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  screen: { flex: 1, backgroundColor: color.surface },
  hero: { flex: 1, backgroundColor: color.ink },
  brand: {
    position: 'absolute',
    left: 24,
    right: 24,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroContent: { position: 'absolute', left: 24, right: 24, gap: 14 },
  heroLead: { marginBottom: 18 },
  heroCta: { minHeight: 56 },
  languageChip: {
    marginLeft: 'auto',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.hairlineOnPhoto,
    backgroundColor: extra.glassLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  step: { flexGrow: 1, paddingHorizontal: 24 },
  progress: { flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 3, borderRadius: 3, backgroundColor: color.line },
  progressDone: { backgroundColor: color.ink },
  title: { marginTop: 40, marginBottom: 8 },
  lead: { marginBottom: 28 },
  options: { gap: 10 },
  option: {
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: color.fill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionSelected: { borderColor: color.ink, backgroundColor: color.surface },
  optionText: { flex: 1, gap: 1 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.controlOff,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotSelected: { borderColor: color.brand, backgroundColor: color.brand },
  dotInner: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: '#FFFFFF' },
  note: { marginTop: 14, marginHorizontal: 2 },
  actions: { marginTop: 'auto', paddingTop: 24, gap: 10 },
  center: { textAlign: 'center' },
});
