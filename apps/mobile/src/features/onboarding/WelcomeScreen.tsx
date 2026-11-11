import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { SproutIcon } from '../../components/icons';
import { Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import type { City } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { welcomePhoto } from '../plans/planImage';
import { useCities } from '../plans/queries';
import {
  GOAL_LABELS,
  GOALS,
  getOnboarding,
  saveOnboarding,
  type Goal,
} from './onboardingStore';

function countryName(code: string): string {
  // Intl.DisplayNames is not available on every JS engine; the code is an acceptable fallback.
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function Progress({ step }: { step: 1 | 2 }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of 2`}
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
        <Text style={type(17, selected ? 'semibold' : 'medium', { tracking: -0.2 })}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={type(13, 'regular', { color: color.secondary })}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={[styles.dot, selected && styles.dotSelected]}>
        {selected ? <View style={styles.dotInner} /> : null}
      </View>
    </Pressable>
  );
}

/** First run: welcome → what brings you here → city. Steps are routes so Back works. */
export default function WelcomeScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  const router = useRouter();
  const insets = useScreenInsets();
  const { session } = useAuth();
  const [stored] = useState(getOnboarding);
  const [goals, setGoals] = useState<Goal[]>(stored.goals);
  const [cityId, setCityId] = useState<string | null>(stored.cityId);
  const cities = useCities();

  if (session || stored.done) return <Redirect href="/home" />;

  const finish = (chosen: string | null) => {
    saveOnboarding({ goals, cityId: chosen, done: true });
    router.replace('/home');
  };

  if (step !== 'goals' && step !== 'city') {
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
          <Text style={type(17, 'semibold', { color: '#FFFFFF', tracking: -0.3 })}>
            PlantCircle
          </Text>
        </View>
        <View style={[styles.heroContent, { bottom: Math.max(40, insets.bottom + 16) }]}>
          <Text
            accessibilityRole="header"
            style={type(46, 'bold', { color: '#FFFFFF', tracking: -1.6, leading: 1 })}
          >
            Find your people.
          </Text>
          <Text
            style={[
              type(18, 'regular', { color: '#FFFFFF', tracking: -0.2, leading: 1.5 }),
              styles.heroLead,
            ]}
          >
            Cook, eat and buy food together with plant-based people near you.
          </Text>
          <Button
            variant="inverse"
            label="Get started"
            onPress={() => {
              router.push({ pathname: '/', params: { step: 'goals' } });
            }}
            style={styles.heroCta}
          />
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              router.push('/signup');
            }}
            style={styles.heroLink}
          >
            <Text style={type(15, 'regular', { color: '#FFFFFF' })}>
              I already have an account
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const frame = { paddingTop: insets.top + 6, paddingBottom: Math.max(40, insets.bottom + 16) };

  if (step === 'goals') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={[styles.step, frame]}>
        <Progress step={1} />
        <Text
          accessibilityRole="header"
          style={[type(30, 'bold', { tracking: -0.7, leading: 1.1 }), styles.title]}
        >
          What brings you here?
        </Text>
        <Text style={[type(16, 'regular', { color: color.secondary }), styles.lead]}>
          Choose any. You can change this later.
        </Text>
        <View style={styles.options}>
          {GOALS.map((goal) => {
            const selected = goals.includes(goal);
            return (
              <OptionRow
                key={goal}
                role="checkbox"
                selected={selected}
                title={GOAL_LABELS[goal]}
                onPress={() => {
                  setGoals(selected ? goals.filter((g) => g !== goal) : [...goals, goal]);
                }}
              />
            );
          })}
        </View>
        <View style={styles.actions}>
          <Button
            label="Continue"
            onPress={() => {
              saveOnboarding({ goals, cityId, done: false });
              router.push({ pathname: '/', params: { step: 'city' } });
            }}
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.step, frame]}>
      <Progress step={2} />
      <Text
        accessibilityRole="header"
        style={[type(30, 'bold', { tracking: -0.7, leading: 1.1 }), styles.title]}
      >
        Where are you based?
      </Text>
      <Text style={[type(16, 'regular', { color: color.secondary }), styles.lead]}>
        Just your city. Never your exact location.
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="City" style={styles.options}>
        {cities.isPending ? (
          <View role="status" accessibilityLabel="Loading cities" style={styles.options}>
            <Skeleton width="100%" height={60} radius={radius.control} />
            <Skeleton width="100%" height={60} radius={radius.control} />
          </View>
        ) : cities.isError ? (
          <View style={styles.options}>
            <Text
              role="alert"
              style={type(15, 'regular', { color: color.danger, leading: 1.4 })}
            >
              Couldn’t load the list of cities.
            </Text>
            <Button variant="outline" label="Try again" onPress={() => void cities.refetch()} />
          </View>
        ) : (
          cities.data.map((city: City) => (
            <OptionRow
              key={city.id}
              role="radio"
              selected={cityId === city.id}
              title={city.name}
              subtitle={countryName(city.countryCode)}
              onPress={() => {
                setCityId(city.id);
              }}
            />
          ))
        )}
      </View>
      <Text
        style={[type(14, 'regular', { color: color.secondary, leading: 1.5 }), styles.note]}
      >
        Somewhere else? You can still join online classes and worldwide circles.
      </Text>
      <View style={styles.actions}>
        <Button
          label="Continue"
          disabled={!cityId}
          onPress={() => {
            finish(cityId);
          }}
        />
        <Button
          variant="ghost"
          label="Skip for now"
          onPress={() => {
            finish(null);
          }}
        />
        <Text
          style={[type(13, 'regular', { color: color.secondary, leading: 1.5 }), styles.center]}
        >
          By continuing you confirm you’re 18+ and agree to the community rules.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
