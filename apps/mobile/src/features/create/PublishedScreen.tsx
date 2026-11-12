import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { CheckIcon } from '../../components/icons';
import { EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { longDate, timeRange } from '../../lib/dates';
import { usePlan } from '../plans/queries';

/** Where the Plan's share link lives. The web RSVP page it points to is built later (C16). */
const SHARE_ORIGIN = 'https://plantcircle.app/p/';

/** What to show once a Plan is live: its link, and the ways to share it. */
export default function PublishedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const detail = usePlan(id);
  const [copied, setCopied] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const link = `${SHARE_ORIGIN}${id}`;

  if (detail.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        <Skeleton width="100%" height={160} radius={radius.card} />
      </View>
    );
  }
  if (detail.isError) {
    const missing = errorCode(detail.error) === 'not_found';
    return (
      <EmptyState
        title={missing ? t('learn.notFound') : t('errors.serverTitle')}
        text={missing ? t('errors.notFoundText') : t('errors.serverText')}
        actions={
          <Button
            label={missing ? t('common.backToHome') : t('common.retry')}
            onPress={() => {
              if (missing) router.replace('/home');
              else void detail.refetch();
            }}
          />
        }
      />
    );
  }

  const plan = detail.data.plan;
  const share = async () => {
    setShareFailed(false);
    try {
      await Share.share({ message: link });
    } catch {
      // The share sheet can be unavailable or dismissed with an error; say so, keep the link visible.
      setShareFailed(true);
    }
  };
  const copy = async () => {
    setShareFailed(false);
    // The web copies to the clipboard; a phone hands the link to its share sheet.
    if (Platform.OS !== 'web') {
      await share();
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setShareFailed(true);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 32, paddingBottom: 40 + insets.bottom },
      ]}
    >
      <View style={styles.check}>
        <CheckIcon size={40} strokeWidth={2.4} color={color.brand} />
      </View>
      <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
        {t('create.published.title')}
      </Text>
      <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
        {t('create.published.lead')}
      </Text>

      <View style={styles.card}>
        <Text style={type(17, 'semibold', { tracking: -0.3 })}>{plan.title}</Text>
        <Text style={type(15, 'regular', { color: color.secondary })}>
          {`${longDate(plan.startsAt, plan.timezone)} · ${timeRange(plan.startsAt, plan.endsAt, plan.timezone)}`}
        </Text>
        <Text style={type(15, 'regular', { color: color.secondary })}>
          {t('create.published.going', { going: plan.goingCount, capacity: plan.capacity })}
        </Text>
      </View>

      <Text style={type(14, 'semibold', { color: color.secondary })}>
        {t('create.published.linkLabel')}
      </Text>
      <Text
        selectable
        accessibilityLabel={t('create.published.linkLabel')}
        style={[type(15, 'regular', { color: color.ink }), styles.link]}
      >
        {link}
      </Text>
      <Button
        variant="outline"
        label={copied ? t('create.published.copied') : t('create.published.copy')}
        onPress={() => {
          void copy();
        }}
      />
      <Button
        variant="outline"
        label={t('create.published.share')}
        onPress={() => {
          void share();
        }}
      />
      {shareFailed ? (
        <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
          {t('create.published.shareFailed')}
        </Text>
      ) : null}

      <Text style={type(15, 'regular', { color: color.secondary })}>
        {t('create.published.notify')}
      </Text>
      <View style={styles.actions}>
        <Button
          variant="outline"
          label={t('create.published.manage')}
          onPress={() => {
            router.push({ pathname: '/plan/[id]/manage', params: { id } });
          }}
        />
        <Button
          label={t('create.published.done')}
          onPress={() => {
            router.replace('/home');
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 20, gap: 14 },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brandTint,
  },
  card: {
    gap: 6,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  link: { padding: 14, borderRadius: radius.control, backgroundColor: color.fill },
  actions: { gap: 12, paddingTop: 8 },
});
