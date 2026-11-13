import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { CheckIcon } from '../../components/icons';
import { color, extra, radius, type } from '../../components/theme';
import { Toggle } from '../../components/Toggle';
import { useScreenInsets } from '../../components/useScreenInsets';
import { newIdempotencyKey } from '../plans/queries';
import { useBlockUser } from './queries';

/**
 * Thanks, we're on it: the case receipt, as the ReportDone design has it. Anonymous, urgent first,
 * reviewed by a person. When the report points at a person, the switch also blocks them.
 */
export default function ReportDoneScreen() {
  const { caseRef, userId, name } = useLocalSearchParams<{ caseRef?: string; userId?: string; name?: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const block = useBlockUser();
  const [key] = useState(newIdempotencyKey);
  const [blocked, setBlocked] = useState(false);

  const facts = [
    { title: t('safety.doneInbox'), note: t('safety.doneInboxNote') },
    { title: t('safety.doneAnonymous'), note: t('safety.doneAnonymousNote') },
    { title: t('safety.doneUrgent'), note: t('safety.doneUrgentNote') },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.headerTop + 24, paddingBottom: 40 + insets.bottom }]}>
        <View style={styles.badge}>
          <CheckIcon size={30} strokeWidth={2.6} color={color.brand} />
        </View>
        <Text accessibilityRole="header" style={[type(30, 'bold', { tracking: -0.9, leading: 1.1 }), styles.centre]}>
          {t('safety.doneTitle')}
        </Text>
        <Text style={[type(17, 'medium', { color: color.secondary }), styles.centre]}>
          {t('safety.caseRef', { ref: caseRef ?? '' })}
        </Text>

        <View style={styles.facts}>
          {facts.map((fact) => (
            <View key={fact.title} style={styles.fact}>
              <View style={styles.factDot} />
              <View style={styles.factText}>
                <Text style={type(16, 'semibold')}>{fact.title}</Text>
                <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>{fact.note}</Text>
              </View>
            </View>
          ))}
        </View>

        {userId ? (
          <View style={styles.card}>
            <Toggle
              label={t('safety.alsoBlock', { name: name || t('safety.thisPerson') })}
              value={blocked}
              disabled={block.isPending || blocked}
              onValueChange={(next) => {
                if (!next || blocked) return;
                block.mutate(
                  { userId, key },
                  {
                    onSuccess: () => {
                      setBlocked(true);
                    },
                  },
                );
              }}
            />
            <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>
              {blocked ? t('safety.blockedNow', { name: name || t('safety.thisPerson') }) : t('safety.alsoBlockNote')}
            </Text>
            {block.isError ? (
              <Text role="alert" style={type(14, 'regular', { color: color.danger })}>{t('safety.error')}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Button
            label={t('common.done')}
            onPress={() => {
              router.replace('/home');
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, gap: 12, alignItems: 'stretch' },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: color.brandTint, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 8 },
  centre: { textAlign: 'center' },
  facts: { gap: 16, marginTop: 24 },
  fact: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  factDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.brand, marginTop: 6 },
  factText: { flex: 1, minWidth: 0, gap: 2 },
  card: { gap: 10, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: extra.cardBorder, marginTop: 20 },
  footer: { paddingTop: 20 },
});
