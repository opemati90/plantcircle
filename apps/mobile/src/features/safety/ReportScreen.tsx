import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AlertIcon } from '../../components/icons';
import { InlineState } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import {
  REPORT_CATEGORIES,
  REPORT_TARGETS,
  type ReportCategory,
} from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { useCities } from '../plans/queries';

/** Emergency numbers by country. 112 reaches emergency services across the EU; the second number is the police line where it differs. */
const EMERGENCY: Record<string, { emergency: string; police: string | null }> = {
  DE: { emergency: '112', police: '110' },
  AT: { emergency: '112', police: '133' },
  CH: { emergency: '112', police: '117' },
  FR: { emergency: '112', police: '17' },
  IT: { emergency: '112', police: null },
  ES: { emergency: '112', police: '091' },
  PT: { emergency: '112', police: null },
  NL: { emergency: '112', police: null },
  PL: { emergency: '112', police: '997' },
  GB: { emergency: '999', police: '101' },
  IE: { emergency: '112', police: null },
  US: { emergency: '911', police: null },
};

export type ReportParams = { type?: string; id?: string; name?: string; userId?: string };

/**
 * What's going on? The first step of a report, as the ReportSheet design has it: the emergency
 * line first, then one reason. Everything else is on the next screen.
 */
export default function ReportScreen() {
  const params = useLocalSearchParams<ReportParams>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const cities = useCities();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const targetType = REPORT_TARGETS.find((x) => x === params.type) ?? null;
  const countryCode = cities.data?.find((c) => c.id === profile?.cityId)?.countryCode ?? 'DE';
  const lines = EMERGENCY[countryCode] ?? { emergency: '112', police: null };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const header = <ScreenHeader backLabel={t('common.back')} onBack={back} />;

  if (session === undefined) {
    return <View style={styles.screen}>{header}</View>;
  }
  if (session === null) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('people.signedOut.title')}
          text={t('safety.signedOut')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/home' } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (!targetType || !params.id) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('errors.notFoundTitle')}
          text={t('errors.notFoundText')}
          action={<Button variant="outline" label={t('common.back')} onPress={back} />}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('safety.title')}
        </Text>
        <Text style={type(15, 'regular', { color: color.secondary })}>
          {t('safety.about', { name: params.name ?? t(`safety.target.${targetType}`) })}
        </Text>

        <View style={styles.emergency}>
          <View style={styles.emergencyIcon}>
            <AlertIcon size={20} strokeWidth={2} color={color.danger} />
          </View>
          <View style={styles.emergencyText}>
            <Text style={type(16, 'semibold')}>{t('safety.dangerTitle')}</Text>
            <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>
              {lines.police
                ? t('safety.dangerLines', { emergency: lines.emergency, police: lines.police })
                : t('safety.dangerLine', { emergency: lines.emergency })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('safety.call', { number: lines.emergency })}
            onPress={() => {
              void Linking.openURL(`tel:${lines.emergency}`).catch(() => undefined);
            }}
            style={styles.callButton}
          >
            <Text style={type(15, 'bold', { color: '#FFFFFF' })}>{lines.emergency}</Text>
          </Pressable>
        </View>

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('safety.title')}
          style={styles.options}
        >
          {REPORT_CATEGORIES.filter((c) => c !== 'accessibility').map((option) => {
            const selected = category === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                aria-checked={selected}
                onPress={() => {
                  setCategory(option);
                }}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={type(17, 'medium')}>{t(`safety.category.${option}`)}</Text>
                <View style={[styles.dot, selected && styles.dotSelected]} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Button
            label={t('common.continue')}
            disabled={!category}
            onPress={() => {
              if (!category) return;
              router.push({
                pathname: '/report/details',
                params: {
                  type: targetType,
                  id: params.id,
                  name: params.name ?? '',
                  category,
                  ...(params.userId ? { userId: params.userId } : {}),
                },
              });
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 14 },
  emergency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: '#FFF3F1',
    marginTop: 6,
  },
  emergencyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyText: { flex: 1, minWidth: 0, gap: 2 },
  callButton: {
    minWidth: size.touchMin,
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: { gap: 8, marginTop: 8 },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  optionSelected: { borderColor: color.ink, backgroundColor: color.fill },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: extra.cardBorder,
  },
  dotSelected: { borderColor: color.ink, borderWidth: 6 },
  footer: { paddingTop: 12 },
});
