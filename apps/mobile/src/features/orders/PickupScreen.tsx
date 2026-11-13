import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MapTile } from '../../components/icons';
import { EmptyState, FloatingActionBar, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { timeRange, weekdayLong } from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { newIdempotencyKey } from '../plans/queries';
import { amount, money, myEstimate } from './orderRules';
import { useMarkCollected, useOrder } from './queries';

/**
 * Pickup, as the OrderPickup design has it: the ready pill, the window, the address (only once the
 * order is locked and only for people with interest), your amount, and payment to the organizer.
 */
export default function PickupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const order = useOrder(id);
  const collect = useMarkCollected(id);
  const [key] = useState(newIdempotencyKey);
  const language = currentLanguage();

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/order/[id]', params: { id } });
  };

  if (order.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        <Skeleton width="100%" height={200} radius={radius.card} />
      </View>
    );
  }
  if (order.isError) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel={t('common.back')} onBack={back} />
        <EmptyState
          title={t('errors.serverTitle')}
          text={t('errors.serverText')}
          actions={<Button label={t('common.retry')} onPress={() => void order.refetch()} />}
        />
      </View>
    );
  }

  const data = order.data;
  const mine = data.items.filter((i) => i.mine > 0);
  const estimate = myEstimate(data.items);
  const tz = data.timezone;

  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel={t('common.back')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 190 + insets.bottom }]}>
        <View style={styles.head}>
          <View style={styles.pillWrap}>
            <Text style={[type(13, 'bold', { color: color.brand, tracking: 0.3 }), styles.pill]}>
              {data.state === 'ready'
                ? t('order.pickupEyebrow')
                : (data.state === 'completed' ? t('order.stateCompleted') : t('order.stateLocked')).toUpperCase()}
            </Text>
          </View>
          <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -1, leading: 1.08 })}>
            {data.title}
          </Text>
        </View>

        <View style={styles.facts}>
          <Fact
            lead={<View style={styles.tile}><Text style={type(20, 'semibold')}>🕒</Text></View>}
            title={`${weekdayLong(data.pickupStart, tz)}, ${timeRange(data.pickupStart, data.pickupEnd, tz)}`}
            note={t('order.pickupWindow')}
          />
          {data.pickupAddress ? (
            <Fact
              lead={<View style={styles.tile}><MapTile /></View>}
              title={data.pickupAddress}
              note={`${data.organizerName}${data.pickupNote ? ` · ${data.pickupNote}` : ''}`}
            />
          ) : null}
          <Fact
            lead={<View style={styles.tile}><Text style={type(20, 'semibold')}>🧺</Text></View>}
            title={t('order.yourAmount')}
            note={mine.length > 0 ? mine.map((i) => `${amount(i.mine, i.unit, language)} ${i.name.toLowerCase()}`).join(' · ') : t('order.noItems')}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text accessibilityRole="header" style={type(20, 'bold', { tracking: -0.5 })}>{t('order.payment')}</Text>
          <View style={styles.payRow}>
            <Text style={type(17, 'medium')}>{t('order.payAtPickup', { name: data.organizerName })}</Text>
            {estimate ? (
              <Text style={type(20, 'bold', { tracking: -0.4 })}>{money(estimate.minor, estimate.currency, language)}</Text>
            ) : null}
          </View>
          <Text style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}>
            {t('order.payNote', { name: data.organizerName })}
          </Text>
        </View>
        {collect.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>{t('order.error')}</Text>
        ) : null}
      </ScrollView>

      <FloatingActionBar style={styles.bar}>
        <View style={styles.barText}>
          <Text style={type(16, 'semibold')}>{data.collected ? t('order.collectedDone') : t('order.pickupWindow')}</Text>
          <Text style={type(14, 'regular', { color: color.secondary })}>{timeRange(data.pickupStart, data.pickupEnd, tz)}</Text>
        </View>
        {!data.collected && mine.length > 0 ? (
          <Button
            label={t('order.collected')}
            disabled={data.state !== 'ready'}
            loading={collect.isPending}
            onPress={() => { collect.mutate({ key }); }}
          />
        ) : null}
      </FloatingActionBar>
    </View>
  );
}

function Fact({ lead, title, note }: { lead: React.ReactNode; title: string; note: string }) {
  return (
    <View style={styles.fact}>
      {lead}
      <View style={styles.factText}>
        <Text style={type(17, 'semibold', { tracking: -0.3 })}>{title}</Text>
        <Text style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}>{note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8 },
  head: { gap: 10, marginVertical: 26 },
  pillWrap: { flexDirection: 'row' },
  pill: { minHeight: 28, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.brandTint, overflow: 'hidden' },
  facts: { gap: 20 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  factText: { flex: 1, minWidth: 0, gap: 3 },
  tile: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: extra.cardBorder, marginTop: 32, marginBottom: 28 },
  section: { gap: 14, marginBottom: 28 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: 1, borderBottomColor: extra.cardBorder },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 10, paddingLeft: 20, paddingRight: 10 },
  barText: { flex: 1, minWidth: 0, gap: 1 },
});
