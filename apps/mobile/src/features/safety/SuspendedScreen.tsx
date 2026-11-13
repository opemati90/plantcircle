import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { longDate } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../plans/queries';
import { useCreateAppeal, useSuspension } from './queries';

const MAX = 2000;
/** Out-of-court dispute settlement under the DSA; the body is a placeholder until counsel confirms. */
const DISPUTE_URL = 'https://plantcircle.app/legal/disputes';

/**
 * The statement of reasons, as the Suspended design has it: what happened, which rule, how we
 * decided, what you can still do, then the appeal and other ways to challenge it.
 */
export default function SuspendedScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const suspension = useSuspension();
  const appeal = useCreateAppeal();
  const [statement, setStatement] = useState('');
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [statement]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const header = <ScreenHeader backLabel={t('common.back')} onBack={back} />;

  if (session === null) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState title={t('people.signedOut.title')} text={t('safety.signedOut')} action={<Button variant="outline" label={t('home.signIn')} onPress={() => { router.push({ pathname: '/sign-up', params: { next: '/suspended' } }); }} />} />
      </View>
    );
  }
  if (suspension.isPending || session === undefined) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        {header}
        <View style={styles.content}><Skeleton width="100%" height={160} radius={radius.card} /></View>
      </View>
    );
  }
  if (suspension.isError) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState onSavedPlans={() => { router.push('/my-plans'); }} title={t('errors.serverTitle')} text={t('errors.serverText')} actions={<Button label={t('common.retry')} onPress={() => void suspension.refetch()} />} />
      </View>
    );
  }
  const data = suspension.data;
  if (!data) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState title={t('safety.notSuspendedTitle')} text={t('safety.notSuspendedText')} actions={<Button label={t('common.backToHome')} onPress={() => { router.replace('/home'); }} />} />
      </View>
    );
  }

  const length = Array.from(statement.trim()).length;
  const frozen = data.action === 'freeze_messages';
  const rows = [
    { title: t('safety.whatHappened'), text: data.reason },
    { title: t('safety.whichRule'), text: data.rule ?? t('safety.ruleGeneral') },
    { title: t('safety.howDecided'), text: data.automated ? t('safety.decidedAutomated') : t('safety.decidedByPerson') },
    { title: t('safety.stillCan'), text: frozen ? t('safety.stillCanFrozen') : t('safety.stillCanText') },
  ];

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}>
        <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
          {frozen && data.until
            ? t('safety.frozenUntil', { date: longDate(data.until, 'UTC') })
            : data.until
              ? t('safety.pausedUntil', { date: longDate(data.until, 'UTC') })
              : t('safety.pausedIndefinitely')}
        </Text>
        <View style={styles.rows}>
          {rows.map((row) => (
            <View key={row.title} style={styles.row}>
              <Text style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}>{row.title.toUpperCase()}</Text>
              <Text style={type(16, 'regular', { leading: 1.45 })}>{row.text}</Text>
            </View>
          ))}
        </View>

        {data.appealStatus ? (
          <View style={styles.card}>
            <Text style={type(16, 'semibold')}>{t(`safety.appeal.${data.appealStatus}`)}</Text>
            <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>{t('safety.appealReviewed')}</Text>
          </View>
        ) : open ? (
          <View style={styles.card}>
            <Text style={type(17, 'semibold')}>{t('safety.appealTitle')}</Text>
            <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>{t('safety.appealLead')}</Text>
            <TextInput
              accessibilityLabel={t('safety.appealTitle')}
              value={statement}
              onChangeText={setStatement}
              multiline
              maxLength={MAX + 50}
              textAlignVertical="top"
              style={[styles.field, type(17, 'regular', { leading: 1.4 })]}
            />
            <Text style={type(13, 'regular', { color: length > MAX ? color.danger : color.secondary })}>
              {t('safety.characters', { count: length, max: MAX })}
            </Text>
            {appeal.isError ? (
              <Text role="alert" style={type(14, 'regular', { color: color.danger })}>{t('safety.error')}</Text>
            ) : null}
            <Button
              label={t('safety.sendAppeal')}
              disabled={length === 0 || length > MAX}
              loading={appeal.isPending}
              onPress={() => {
                appeal.mutate({ actionId: data.actionId, statement: statement.trim(), key });
              }}
            />
          </View>
        ) : (
          <Button
            label={t('safety.appealTitle')}
            onPress={() => {
              setOpen(true);
            }}
          />
        )}

        <Button
          variant="outline"
          label={t('safety.otherWays')}
          onPress={() => {
            void Linking.openURL(DISPUTE_URL).catch(() => undefined);
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 14 },
  rows: { gap: 4, marginTop: 8, marginBottom: 8 },
  row: { gap: 4, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: extra.cardBorder },
  card: { gap: 10, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: extra.cardBorder },
  field: { minHeight: 120, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: extra.cardBorder, color: color.ink },
});
