import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Checkbox } from '../../components/Checkbox';
import { InlineState } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { REPORT_CATEGORIES, REPORT_TARGETS } from '../../lib/backend/types';
import { newIdempotencyKey } from '../plans/queries';
import type { ReportParams } from './ReportScreen';
import { useAuth } from '../auth/useAuth';
import { useCreateReport } from './queries';

const MAX = 2000;

/**
 * Tell us what happened, as the ReportDetails design has it: a free-text box, the accuracy
 * confirmation that enables Send, and a line that the person won't see who reported them.
 * Screenshots arrive with media uploads (v1.1); the field is named in the plan.
 */
export default function ReportDetailsScreen() {
  const params = useLocalSearchParams<ReportParams & { category?: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const create = useCreateReport();
  const [details, setDetails] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [details, confirmed]);
  const targetType = REPORT_TARGETS.find((x) => x === params.type) ?? null;
  const category = REPORT_CATEGORIES.find((x) => x === params.category) ?? null;
  const length = Array.from(details.trim()).length;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const header = <ScreenHeader backLabel={t('common.back')} onBack={back} />;

  if (session === null) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('people.signedOut.title')}
          text={t('safety.signedOut')}
          action={<Button variant="outline" label={t('home.signIn')} onPress={() => { router.push({ pathname: '/sign-up', params: { next: '/home' } }); }} />}
        />
      </View>
    );
  }
  if (!targetType || !category || !params.id) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState title={t('errors.notFoundTitle')} text={t('errors.notFoundText')} action={<Button variant="outline" label={t('common.back')} onPress={back} />} />
      </View>
    );
  }

  const send = () => {
    if (!confirmed || length === 0 || length > MAX) return;
    create.mutate(
      {
        report: { targetType, targetId: params.id ?? '', category, details: details.trim(), accuracyConfirmed: true },
        key,
      },
      {
        onSuccess: (receipt) => {
          router.replace({
            pathname: '/report/done',
            params: { caseRef: receipt.caseRef, ...(params.userId ? { userId: params.userId, name: params.name ?? '' } : {}) },
          });
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}>
        <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
          {t('safety.detailsTitle')}
        </Text>
        <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>{t('safety.detailsLead')}</Text>

        <Text style={styles.label}>{t(`safety.whatWrong.${targetType}`)}</Text>
        <TextInput
          accessibilityLabel={t(`safety.whatWrong.${targetType}`)}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={MAX + 50}
          textAlignVertical="top"
          style={[styles.field, type(17, 'regular', { leading: 1.4 })]}
        />
        <Text style={type(13, 'regular', { color: length > MAX ? color.danger : color.secondary })}>
          {t('safety.characters', { count: length, max: MAX })}
        </Text>

        <Checkbox
          label={t('safety.accurate')}
          value={confirmed}
          onValueChange={setConfirmed}
        />

        {create.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {errorCode(create.error) === 'rate_limited' ? t('safety.rateLimited') : t('safety.error')}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Button label={t('safety.send')} disabled={!confirmed || length === 0 || length > MAX} loading={create.isPending} onPress={send} />
          {!confirmed ? (
            <Text style={[type(14, 'regular', { color: color.secondary }), styles.hint]}>{t('safety.confirmHint')}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  label: { ...type(17, 'semibold'), marginTop: 14 },
  field: { minHeight: 150, padding: 16, borderRadius: radius.control, borderWidth: 1, borderColor: extra.cardBorder, color: color.ink },
  footer: { paddingTop: 16, gap: 10 },
  hint: { textAlign: 'center' },
});
