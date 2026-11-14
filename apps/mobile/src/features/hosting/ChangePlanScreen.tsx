import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { PlanDetail } from '../../lib/backend/types';
import { useNow } from '../../lib/useNow';
import { planWindow, startsSoonEnough } from '../create/rules';
import { WhenStep, whenDraftOf, type WhenDraft } from '../create/WhenStep';
import { newIdempotencyKey, usePlan } from '../plans/queries';
import { useUpdatePlan } from './queries';

/**
 * The host changes when or where a live Plan happens. A new time or place puts the Plan in
 * `changed`, and going guests are asked whether they can still make it (docs/07).
 */
export default function ChangePlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const plan = usePlan(id);

  const back = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/plan/[id]/manage', params: { id } });
      }}
    />
  );

  if (plan.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        {back}
        <View style={styles.content}>
          <Skeleton width="70%" height={34} radius={8} />
          <Skeleton width="100%" height={120} radius={radius.card} />
        </View>
      </View>
    );
  }
  if (plan.isError) {
    const missing = errorCode(plan.error) === 'forbidden';
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={missing ? t('errors.notFoundTitle') : t('errors.serverTitle')}
          text={missing ? t('errors.notFoundText') : t('errors.serverText')}
          actions={<Button label={t('common.retry')} onPress={() => void plan.refetch()} />}
        />
      </View>
    );
  }
  return <ChangeForm id={id} detail={plan.data} back={back} />;
}

function ChangeForm({
  id,
  detail,
  back,
}: {
  id: string;
  detail: PlanDetail;
  back: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useScreenInsets();
  const now = useNow();
  const update = useUpdatePlan(id);
  const { plan } = detail;
  const zone = plan.timezone;
  const inPerson = plan.format === 'in_person';
  const [when, setWhen] = useState<WhenDraft>(() =>
    whenDraftOf(plan.startsAt, plan.endsAt, zone),
  );
  const [areaName, setAreaName] = useState(plan.areaName);
  const [address, setAddress] = useState(detail.address ?? '');
  // One key per visit, so a retry after a lost response replays the same change.
  const [key] = useState(newIdempotencyKey);

  const window =
    when.day === null ? null : planWindow(when.day, when.startMinutes, when.duration, zone);
  const placeOk = !inPerson || (areaName.trim().length > 0 && address.trim().length > 0);
  const moved =
    window !== null &&
    (window.startsAt !== plan.startsAt ||
      window.endsAt !== plan.endsAt ||
      (inPerson &&
        (areaName.trim() !== plan.areaName || address.trim() !== (detail.address ?? ''))));
  const valid = window !== null && startsSoonEnough(window.startsAt, now) && placeOk && moved;
  const failure = update.isError ? errorCode(update.error) : null;

  const save = () => {
    if (!window) return;
    update.mutate(
      {
        patch: {
          title: plan.title,
          description: plan.description,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          capacity: plan.capacity,
          areaName: inPerson ? areaName.trim() : null,
          address: inPerson ? address.trim() : null,
        },
        key,
      },
      {
        onSuccess: () => {
          router.replace({ pathname: '/plan/[id]/manage', params: { id, changed: '1' } });
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          maxFontSizeMultiplier={2.0}
          accessibilityRole="header"
          style={type(32, 'bold', { tracking: -1, leading: 1.06 })}
        >
          {t('host.changeTitle')}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}
        >
          {t('host.changeLead')}
        </Text>

        <WhenStep
          draft={when}
          now={now}
          zone={zone}
          onChange={(patch) => {
            setWhen({ ...when, ...patch });
          }}
        />

        {inPerson ? (
          <>
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('create.areaLabel')}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2.0}
              accessibilityLabel={t('create.areaLabel')}
              value={areaName}
              onChangeText={setAreaName}
              maxLength={60}
              style={[styles.field, type(17)]}
            />
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('create.addressLabel')}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2.0}
              accessibilityLabel={t('create.addressLabel')}
              value={address}
              onChangeText={setAddress}
              maxLength={200}
              style={[styles.field, type(17)]}
            />
          </>
        ) : null}

        {failure ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(15, 'regular', { color: color.danger })}
          >
            {failure === 'plan_started'
              ? t('host.planStarted')
              : failure === 'plan_not_live'
                ? t('host.notLive')
                : t('host.error')}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={t('host.changeSave')}
            disabled={!valid}
            loading={update.isPending}
            onPress={save}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 16, gap: 12 },
  label: { ...type(17, 'semibold'), marginTop: 18, marginBottom: 2 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  actions: { paddingTop: 24 },
});
