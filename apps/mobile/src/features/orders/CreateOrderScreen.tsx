import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { OrderItemInput } from '../../lib/backend/types';
import { longDate, time } from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { useAuth } from '../auth/useAuth';
import { calendarDay, planWindow, startsSoonEnough } from '../create/rules';
import { newIdempotencyKey, useCities } from '../plans/queries';
import { money } from './orderRules';
import { HostLevelCard } from '../hosting/HostLevelCard';
import { useHostLevel } from '../hosting/queries';
import { useCreateOrder } from './queries';

const STEPS = ['supplier', 'items', 'when', 'review'] as const;
type Step = (typeof STEPS)[number];
const CLOSE_HOUR = 18 * 60;
const PICKUP_LENGTHS = [120, 180, 240] as const;
const PICKUP_STARTS = [10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60];
const DAY_COUNT = 14;

interface ItemRow {
  id: string;
  name: string;
  target: string;
  price: string;
}

/**
 * New group order, as the CreateOrder design has it: four steps with the progress bar. Supplier
 * (free text in v1; the shop directory is v1.1), items with targets, when interest closes and
 * when pickup is, then a review that names the money rule before sharing.
 */
export default function CreateOrderScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const cities = useCities();
  const hostLevel = useHostLevel();
  const create = useCreateOrder();
  const language = currentLanguage();
  const [index, setIndex] = useState(0);
  const [supplierName, setSupplierName] = useState('');
  const [supplierArea, setSupplierArea] = useState('');
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<ItemRow[]>([
    { id: newIdempotencyKey(), name: '', target: '', price: '' },
  ]);
  const [closeOffset, setCloseOffset] = useState<number | null>(null);
  const [pickupOffset, setPickupOffset] = useState<number | null>(null);
  const [pickupStart, setPickupStart] = useState(10 * 60);
  const [pickupLength, setPickupLength] = useState<number>(180);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const now = new Date();
  const city = cities.data?.find((c) => c.id === profile?.cityId) ?? null;
  const zone = city?.timezone ?? 'UTC';
  const step: Step = STEPS[index] ?? 'supplier';

  const num = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : NaN);
  // Rows that are entirely empty are ignored; a row with anything in it must be complete and valid.
  const touched = items.filter((i) => i.name.trim() || i.target.trim() || i.price.trim());
  const rowValid = (i: ItemRow) =>
    i.name.trim().length > 0 &&
    Number.isFinite(num(i.target)) &&
    num(i.target) > 0 &&
    (!i.price.trim() || (Number.isFinite(num(i.price)) && num(i.price) >= 0));
  const itemsValid = touched.length > 0 && touched.length <= 20 && touched.every(rowValid);
  const cleanItems: OrderItemInput[] = touched.filter(rowValid).map((i) => ({
    name: i.name.trim(),
    unit: 'kg',
    target: num(i.target),
    estPriceMinor: i.price.trim() ? Math.round(num(i.price) * 100) : null,
  }));
  const closesAt =
    closeOffset === null
      ? null
      : planWindow(calendarDay(now, closeOffset, zone), CLOSE_HOUR, 0, zone).startsAt;
  const pickup =
    pickupOffset === null
      ? null
      : planWindow(calendarDay(now, pickupOffset, zone), pickupStart, pickupLength, zone);
  const valid: Record<Step, boolean> = {
    supplier: supplierName.trim().length > 0 && title.trim().length >= 3,
    items: itemsValid,
    when:
      closesAt !== null &&
      pickup !== null &&
      startsSoonEnough(closesAt, now) &&
      Date.parse(pickup.startsAt) >= Date.parse(closesAt) &&
      address.trim().length > 0,
    review: true,
  };
  const targetTotal = cleanItems.reduce((a, i) => a + i.target, 0);
  const estimateMinor = cleanItems.reduce((a, i) => a + (i.estPriceMinor ?? 0) * i.target, 0);

  const payload = JSON.stringify({
    supplierName,
    supplierArea,
    title,
    items,
    closesAt,
    pickup,
    address,
    note,
  });
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [payload]);

  const back = () => {
    if (index > 0) setIndex(index - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/create');
  };
  const header = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={back}
      caption={t('create.stepOf', { step: index + 1, total: STEPS.length })}
      progress={{ step: index + 1, total: STEPS.length }}
    />
  );

  if (cities.isError) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('errors.serverTitle')}
          text={t('errors.serverText')}
          action={
            <Button
              variant="outline"
              label={t('common.retry')}
              onPress={() => void cities.refetch()}
            />
          }
        />
      </View>
    );
  }
  if (session === undefined || cities.isPending || (session !== null && hostLevel.isPending)) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="100%" height={120} radius={radius.card} />
      </View>
    );
  }
  if (session === null) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('people.signedOut.title')}
          text={t('order.signedOut')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/create/order' } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (hostLevel.isError) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('errors.serverTitle')}
          text={t('hosting.levelLoadError')}
          action={
            <Button
              variant="outline"
              label={t('common.tryAgain')}
              onPress={() => void hostLevel.refetch()}
            />
          }
        />
      </View>
    );
  }
  if (hostLevel.data && !hostLevel.data.groupOrders) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.gate}>
          <InlineState
            title={t('hosting.ordersGateTitle')}
            text={t('hosting.ordersGateText')}
          />
          <HostLevelCard level={hostLevel.data} />
        </View>
      </View>
    );
  }
  if (!city) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('create.cityRequired')}
          text={t('home.cityLead')}
          action={
            <Button
              variant="outline"
              label={t('home.changeCity')}
              onPress={() => {
                router.replace('/home');
              }}
            />
          }
        />
      </View>
    );
  }

  const publish = () => {
    if (!closesAt || !pickup || !valid.when || !valid.items || !valid.supplier) return;
    create.mutate(
      {
        key,
        order: {
          title: title.trim(),
          description: '',
          supplierName: supplierName.trim(),
          supplierArea: supplierArea.trim() || null,
          closesAt,
          pickupStart: pickup.startsAt,
          pickupEnd: pickup.endsAt,
          pickupAddress: address.trim(),
          pickupNote: note.trim() || null,
          items: cleanItems,
        },
      },
      {
        onSuccess: (id) => {
          router.replace({ pathname: '/order/[id]', params: { id } });
        },
      },
    );
  };

  const dayStrip = (
    selected: number | null,
    onPick: (offset: number) => void,
    label: string,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.dayStrip}
    >
      {Array.from({ length: DAY_COUNT }, (_, offset) => {
        const day = calendarDay(now, offset, zone);
        const weekday = new Intl.DateTimeFormat(language, {
          weekday: 'short',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(day.year, day.month - 1, day.day)));
        const isSelected = selected === offset;
        return (
          <Pressable
            key={offset}
            accessibilityRole="radio"
            aria-checked={isSelected}
            accessibilityLabel={`${weekday} ${day.day}`}
            onPress={() => {
              onPick(offset);
            }}
            style={[styles.day, isSelected && styles.selected]}
          >
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(12, 'semibold', { color: color.secondary, tracking: 0.4 })}
            >
              {weekday}
            </Text>
            <Text maxFontSizeMultiplier={1.6} style={type(21, 'bold', { tracking: -0.4 })}>
              {day.day}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        {step === 'supplier' ? (
          <>
            <Text maxFontSizeMultiplier={2.0} accessibilityRole="header" style={styles.title}>
              {t('order.stepSupplier')}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={styles.lead}>
              {t('order.supplierLead')}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('order.supplierName')}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2.0}
              accessibilityLabel={t('order.supplierName')}
              value={supplierName}
              onChangeText={setSupplierName}
              maxLength={80}
              style={[styles.field, type(17)]}
            />
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('order.supplierArea')}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2.0}
              accessibilityLabel={t('order.supplierArea')}
              value={supplierArea}
              onChangeText={setSupplierArea}
              maxLength={80}
              style={[styles.field, type(17)]}
            />
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('create.titleLabel')}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2.0}
              accessibilityLabel={t('create.titleLabel')}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              style={[styles.field, type(17)]}
            />
          </>
        ) : null}

        {step === 'items' ? (
          <>
            <Text maxFontSizeMultiplier={2.0} accessibilityRole="header" style={styles.title}>
              {t('order.stepItems')}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={styles.lead}>
              {t('order.itemsLead')}
            </Text>
            {items.map((row, i) => (
              <View key={row.id} style={styles.itemRow}>
                <TextInput
                  maxFontSizeMultiplier={2.0}
                  accessibilityLabel={`${t('order.itemName')} ${i + 1}`}
                  value={row.name}
                  onChangeText={(v) => {
                    setItems((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, name: v } : r)),
                    );
                  }}
                  maxLength={80}
                  style={[styles.field, styles.grow, type(17)]}
                />
                <TextInput
                  maxFontSizeMultiplier={2.0}
                  accessibilityLabel={`${t('order.itemTarget')} ${i + 1}`}
                  value={row.target}
                  onChangeText={(v) => {
                    setItems((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, target: v } : r)),
                    );
                  }}
                  keyboardType="decimal-pad"
                  placeholder="kg"
                  placeholderTextColor={color.secondary}
                  style={[styles.field, styles.small, type(17)]}
                />
                <TextInput
                  maxFontSizeMultiplier={2.0}
                  accessibilityLabel={`${t('order.itemPrice')} ${i + 1}`}
                  value={row.price}
                  onChangeText={(v) => {
                    setItems((rows) =>
                      rows.map((r) => (r.id === row.id ? { ...r, price: v } : r)),
                    );
                  }}
                  keyboardType="decimal-pad"
                  placeholder="€"
                  placeholderTextColor={color.secondary}
                  style={[styles.field, styles.small, type(17)]}
                />
              </View>
            ))}
            {touched.some((i) => !rowValid(i)) ? (
              <Text
                maxFontSizeMultiplier={2.0}
                role="alert"
                style={type(15, 'regular', { color: color.danger })}
              >
                {t('order.itemInvalid')}
              </Text>
            ) : null}
            <View style={styles.rowButtons}>
              <Button
                variant="outline"
                label={t('order.addItem')}
                disabled={items.length >= 20}
                onPress={() => {
                  setItems((rows) => [
                    ...rows,
                    { id: newIdempotencyKey(), name: '', target: '', price: '' },
                  ]);
                }}
              />
              {items.length > 1 ? (
                <Button
                  variant="outline"
                  label={t('order.removeItem')}
                  onPress={() => {
                    setItems((rows) => rows.slice(0, -1));
                  }}
                />
              ) : null}
            </View>
            <View style={styles.total}>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'semibold', { color: color.secondary })}
              >
                {t('order.groupTarget')}
              </Text>
              <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold')}>
                {`${targetTotal} kg${estimateMinor > 0 ? ` · ≈ ${money(estimateMinor, 'EUR', language)}` : ''}`}
              </Text>
            </View>
          </>
        ) : null}

        {step === 'when' ? (
          <>
            <Text maxFontSizeMultiplier={2.0} accessibilityRole="header" style={styles.title}>
              {t('order.stepWhen')}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={styles.lead}>
              {t('order.whenLead')}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('order.closesAt')}
            </Text>
            {dayStrip(closeOffset, setCloseOffset, t('order.closesAt'))}
            {closesAt ? (
              <Text
                maxFontSizeMultiplier={2.0}
                style={styles.summary}
              >{`${longDate(closesAt, zone)} · ${time(closesAt, zone)}`}</Text>
            ) : null}
            {closesAt && !startsSoonEnough(closesAt, now) ? (
              <Text
                maxFontSizeMultiplier={2.0}
                role="alert"
                style={type(15, 'regular', { color: color.danger })}
              >
                {t('create.tooSoon')}
              </Text>
            ) : null}
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('order.pickupStart')}
            </Text>
            {dayStrip(pickupOffset, setPickupOffset, t('order.pickupStart'))}
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('order.pickupStart')}
              style={styles.chips}
            >
              {PICKUP_STARTS.map((minutes) => {
                const isSelected = pickupStart === minutes;
                const label = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:00`;
                return (
                  <Pressable
                    key={minutes}
                    accessibilityRole="radio"
                    aria-checked={isSelected}
                    onPress={() => {
                      setPickupStart(minutes);
                    }}
                    style={[styles.chip, isSelected && styles.selected]}
                  >
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(15, 'semibold', {
                        color: isSelected ? color.brand : color.ink,
                      })}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('order.pickupLength')}
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('order.pickupLength')}
              style={styles.pill}
            >
              {PICKUP_LENGTHS.map((minutes) => {
                const isSelected = pickupLength === minutes;
                return (
                  <Pressable
                    key={minutes}
                    accessibilityRole="radio"
                    aria-checked={isSelected}
                    onPress={() => {
                      setPickupLength(minutes);
                    }}
                    style={[styles.pillItem, isSelected && styles.pillItemSelected]}
                  >
                    <Text maxFontSizeMultiplier={2.0} style={type(15, 'semibold')}>
                      {t('learn.minutes', { minutes })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {pickup && closesAt && Date.parse(pickup.startsAt) < Date.parse(closesAt) ? (
              <Text
                maxFontSizeMultiplier={2.0}
                role="alert"
                style={type(15, 'regular', { color: color.danger })}
              >
                {t('order.error')}
              </Text>
            ) : null}
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('order.pickupAddress')}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2.0}
              accessibilityLabel={t('order.pickupAddress')}
              value={address}
              onChangeText={setAddress}
              maxLength={200}
              style={[styles.field, type(17)]}
            />
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('order.pickupNoteLabel')}
            </Text>
            <TextInput
              maxFontSizeMultiplier={2.0}
              accessibilityLabel={t('order.pickupNoteLabel')}
              value={note}
              onChangeText={setNote}
              maxLength={200}
              style={[styles.field, type(17)]}
            />
          </>
        ) : null}

        {step === 'review' && closesAt && pickup ? (
          <>
            <Text maxFontSizeMultiplier={2.0} accessibilityRole="header" style={styles.title}>
              {t('order.stepReview')}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={styles.lead}>
              {t('order.reviewLead')}
            </Text>
            <View style={styles.card}>
              <Text maxFontSizeMultiplier={1.6} style={type(20, 'bold', { tracking: -0.5 })}>
                {title.trim()}
              </Text>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'regular', { color: color.secondary })}
              >{`${supplierName.trim()}${supplierArea.trim() ? ` · ${supplierArea.trim()}` : ''}`}</Text>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'regular', { color: color.secondary })}
              >
                {`${targetTotal} kg${estimateMinor > 0 ? ` · ≈ ${money(estimateMinor, 'EUR', language)}` : ''} · ${cleanItems.length} ${t('order.stepItems').toLowerCase()}`}
              </Text>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'regular', { color: color.secondary })}
              >{`${t('order.closesAt')} ${longDate(closesAt, zone)}, ${time(closesAt, zone)}`}</Text>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'regular', { color: color.secondary })}
              >{`${t('order.pickupStart')} ${longDate(pickup.startsAt, zone)} ${time(pickup.startsAt, zone)} – ${time(pickup.endsAt, zone)}`}</Text>
            </View>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(14, 'regular', { color: color.secondary, leading: 1.5 })}
            >
              {t('order.moneyNote')}
            </Text>
            {create.isError ? (
              <Text
                maxFontSizeMultiplier={2.0}
                role="alert"
                style={type(15, 'regular', { color: color.danger })}
              >
                {errorCode(create.error) === 'city_required'
                  ? t('create.cityRequired')
                  : errorCode(create.error) === 'host_level_required'
                    ? t('hosting.ordersGateTitle')
                    : t('order.error')}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={styles.footer}>
          {index === STEPS.length - 1 ? (
            <Button
              label={t('order.share')}
              loading={create.isPending}
              disabled={!valid.supplier || !valid.items || !valid.when}
              onPress={publish}
            />
          ) : (
            <Button
              label={t('common.continue')}
              disabled={!valid[step]}
              onPress={() => {
                setIndex(index + 1);
              }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: { gap: 16 },
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  title: {
    ...type(32, 'bold', { tracking: -1, leading: 1.08 }),
    marginTop: 32,
    marginBottom: 2,
  },
  lead: { ...type(16, 'regular', { color: color.secondary, leading: 1.5 }) },
  label: { ...type(17, 'semibold'), marginTop: 18, marginBottom: 2 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  itemRow: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  small: { width: 76 },
  rowButtons: { flexDirection: 'row', gap: 10 },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  dayStrip: { gap: 6, paddingVertical: 4 },
  day: {
    width: 60,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  selected: { borderColor: color.brand, backgroundColor: color.brandTint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  pill: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: color.fill,
  },
  pillItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  pillItemSelected: { backgroundColor: color.surface },
  summary: { ...type(17, 'semibold', { tracking: -0.2 }) },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  footer: { paddingTop: 16 },
});
