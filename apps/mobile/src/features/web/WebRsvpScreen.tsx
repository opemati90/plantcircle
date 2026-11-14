import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { SproutIcon } from '../../components/icons';
import { DateTile, EmptyState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { useBackend } from '../../lib/backend/BackendProvider';
import { emailSchema, type WebRsvpResult } from '../../lib/backend/types';
import { shortDate, time } from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { appStorage } from '../../lib/storage';
import { newIdempotencyKey, usePlan } from '../plans/queries';
import { imageByPath, welcomePhoto } from '../plans/planImage';
import { placeLabel } from '../plans/planCopy';

const APP_STORE = 'https://apps.apple.com/app/plantcircle';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=app.plantcircle.mobile';
const NAME_MAX = 40;

/**
 * The shared-link page, as the WebRSVP and WebRSVPDone designs have it: who invited you, the
 * Plan, first name, email, 18+, "Reserve my spot"; then the done page with the stores and a
 * cancel link. No account up front: the guest is made a member behind the scenes and emailed a
 * magic link. "Open in app" leads to the same Plan inside the app.
 */
export default function WebRsvpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const backend = useBackend();
  const plan = usePlan(id);
  const language = currentLanguage();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [adult, setAdult] = useState(false);
  const [invalid, setInvalid] = useState<'name' | 'email' | null>(null);
  const [done, setDone] = useState<WebRsvpResult | null>(null);
  // The done page survives a reload: the token lives in this browser only, for this Plan.
  const savedKey = `pc.web-rsvp.${id}`;
  useEffect(() => {
    void appStorage
      .get(savedKey)
      .then((raw) => {
        if (!raw) return;
        try {
          const saved = JSON.parse(raw) as {
            result: WebRsvpResult;
            firstName: string;
            email: string;
          };
          setDone(saved.result);
          setFirstName(saved.firstName);
          setEmail(saved.email);
        } catch {
          // An unreadable note is dropped; the form shows again.
        }
      })
      .catch(() => undefined);
  }, [savedKey]);
  const [key, setKey] = useState(newIdempotencyKey);
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [firstName, email, adult]);
  const [cancelKey] = useState(newIdempotencyKey);

  const reserve = useMutation({
    mutationFn: () =>
      backend.webRsvp(
        id,
        { firstName: firstName.trim(), email: email.trim(), ageConfirmed: adult },
        key,
      ),
    onSuccess: (result) => {
      setDone(result);
      if (result.cancelToken) {
        void appStorage
          .set(
            savedKey,
            JSON.stringify({
              result,
              firstName: firstName.trim(),
              email: email.trim().toLowerCase(),
            }),
          )
          .catch(() => undefined);
      }
    },
  });
  const cancel = useMutation({
    mutationFn: (token: string) => backend.webRsvpCancel(token, cancelKey),
    onSuccess: () => {
      void appStorage.remove(savedKey).catch(() => undefined);
    },
  });

  const submit = () => {
    const nameLength = Array.from(firstName.trim()).length;
    if (nameLength < 1 || nameLength > NAME_MAX) {
      setInvalid('name');
      return;
    }
    if (!emailSchema.safeParse(email.trim()).success) {
      setInvalid('email');
      return;
    }
    setInvalid(null);
    reserve.mutate();
  };
  // On the web the app's own scheme is tried first; without the app installed the web Plan opens.
  const openApp = () => {
    if (Platform.OS !== 'web') {
      router.push({ pathname: '/plan/[id]', params: { id } });
      return;
    }
    const fallback = setTimeout(() => {
      router.push({ pathname: '/plan/[id]', params: { id } });
    }, 700);
    Linking.openURL(`plantcircle://plan/${id}`).catch(() => {
      clearTimeout(fallback);
      router.push({ pathname: '/plan/[id]', params: { id } });
    });
  };
  const header = (
    <View style={styles.topBar}>
      <View style={styles.brand}>
        <SproutIcon size={20} color={color.brand} />
        <Text style={type(16, 'bold', { tracking: -0.3 })}>PlantCircle</Text>
      </View>
      <Button variant="outline" label={t('web.openInApp')} onPress={openApp} />
    </View>
  );

  if (plan.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <View style={[styles.content, { paddingTop: insets.headerTop }]}>
          {header}
          <Skeleton width="100%" height={220} radius={radius.card} />
        </View>
      </View>
    );
  }
  if (plan.isError) {
    const missing = errorCode(plan.error) === 'not_found';
    return (
      <View style={styles.screen}>
        <EmptyState
          title={missing ? t('plan.unavailableTitle') : t('errors.serverTitle')}
          text={missing ? t('plan.unavailableText') : t('errors.serverText')}
          actions={
            missing ? (
              <Button
                label={t('web.openInApp')}
                onPress={() => {
                  router.replace('/home');
                }}
              />
            ) : (
              <Button label={t('common.tryAgain')} onPress={() => void plan.refetch()} />
            )
          }
        />
      </View>
    );
  }

  const detail = plan.data.plan;
  const spotsLeft = Math.max(0, detail.capacity - detail.goingCount);
  // The server's word: held offers and people in line make a Plan full before the count says so.
  const full = !detail.hasOpenSpot;
  const when = `${shortDate(detail.startsAt, detail.timezone)} · ${time(detail.startsAt, detail.timezone)}`;
  const error =
    invalid === 'name'
      ? t('web.invalidName')
      : invalid === 'email'
        ? t('auth.invalidEmail')
        : reserve.isError
          ? errorCode(reserve.error) === 'rate_limited'
            ? t('auth.rateLimited')
            : errorCode(reserve.error) === 'plan_ended'
              ? t('plan.error.endedDetail')
              : errorCode(reserve.error) === 'not_found'
                ? t('plan.unavailableText')
                : errorCode(reserve.error) === 'suspended'
                  ? t('safety.suspendedErrorDetail')
                  : errorCode(reserve.error) === 'invalid_input'
                    ? t('web.invalidInput')
                    : t('web.error')
          : null;

  if (done) {
    const cancelled = cancel.isSuccess;
    const name = firstName.trim();
    const title = cancelled
      ? t('web.cancelledTitle')
      : done.status === 'existing'
        ? t('web.existingTitle')
        : done.status === 'going'
          ? t('web.doneTitle', { name })
          : done.status === 'offered'
            ? t('web.doneOfferedTitle', { name })
            : t('web.doneWaitlistTitle', { name, position: done.position ?? 1 });
    const lead = cancelled
      ? t('web.cancelledText')
      : done.status === 'existing'
        ? done.emailSent
          ? t('web.existingText', { email: email.trim().toLowerCase() })
          : t('web.existingNoEmail')
        : done.status === 'offered'
          ? t('web.doneOfferedText')
          : done.emailSent
            ? t('web.doneSent', { email: email.trim().toLowerCase() })
            : t('web.doneNoEmail');
    return (
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.headerTop, paddingBottom: 40 + insets.bottom },
          ]}
        >
          {header}
          <Text
            accessibilityRole="header"
            style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
          >
            {title}
          </Text>
          <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>
            {lead}
          </Text>
          <View style={styles.card}>
            <Text style={type(18, 'bold', { tracking: -0.4 })}>{detail.title}</Text>
            <Text
              style={type(15, 'regular', { color: color.secondary })}
            >{`${when} · ${placeLabel(t, detail)}`}</Text>
          </View>
          {cancelled || done.status === 'existing' ? null : (
            <>
              <View style={styles.card}>
                <Text style={type(17, 'semibold')}>{t('web.getAppTitle')}</Text>
                <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>
                  {t('web.getAppText')}
                </Text>
                <View style={styles.stores}>
                  <Button
                    variant="outline"
                    label={t('web.appStore')}
                    onPress={() => {
                      void Linking.openURL(APP_STORE).catch(() => undefined);
                    }}
                  />
                  <Button
                    variant="outline"
                    label={t('web.googlePlay')}
                    onPress={() => {
                      void Linking.openURL(PLAY_STORE).catch(() => undefined);
                    }}
                  />
                </View>
              </View>
              {cancel.isError ? (
                <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                  {t('web.error')}
                </Text>
              ) : null}
              {done.cancelToken ? (
                <Button
                  variant="ghost"
                  label={t('web.cancelSpot')}
                  loading={cancel.isPending}
                  onPress={() => {
                    cancel.mutate(done.cancelToken ?? '');
                  }}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.headerTop, paddingBottom: 40 + insets.bottom },
        ]}
      >
        {header}
        <View style={styles.hero}>
          <Photo
            source={detail.imagePath ? imageByPath(detail.imagePath) : welcomePhoto}
            alt={detail.imageAlt}
          />
        </View>
        <Text style={type(13, 'semibold', { color: color.secondary, tracking: 0.6 })}>
          {t('web.invitedBy', { host: detail.hostName.toUpperCase() })}
        </Text>
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {detail.title}
        </Text>
        <View style={styles.facts}>
          <DateTile iso={detail.startsAt} timeZone={detail.timezone} />
          <View style={styles.factText}>
            <Text style={type(17, 'semibold')}>{when}</Text>
            <Text style={type(15, 'regular', { color: color.secondary })}>
              {placeLabel(t, detail)}
            </Text>
          </View>
        </View>
        <View style={styles.chips}>
          <Text style={[type(14, 'semibold'), styles.chip]}>
            {full ? t('web.full') : t('web.spotsLeft', { count: spotsLeft })}
          </Text>
          <Text style={[type(14, 'semibold'), styles.chip]}>
            {detail.priceCents === 0
              ? t('plan.free')
              : new Intl.NumberFormat(language, {
                  style: 'currency',
                  currency: detail.currency,
                }).format(detail.priceCents / 100)}
          </Text>
        </View>

        <Text style={styles.label}>{t('web.firstName')}</Text>
        <TextInput
          accessibilityLabel={t('web.firstName')}
          aria-invalid={invalid === 'name'}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoComplete="given-name"
          style={[styles.field, type(17)]}
        />
        <Text style={styles.label}>{t('auth.email')}</Text>
        <TextInput
          accessibilityLabel={t('auth.email')}
          aria-invalid={invalid === 'email'}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          placeholder={t('auth.emailPlaceholder')}
          placeholderTextColor={color.secondary}
          style={[styles.field, type(17)]}
        />
        <Checkbox label={t('web.ageAgree')} value={adult} onValueChange={setAdult} />
        <Text style={type(13, 'regular', { color: color.secondary, leading: 1.45 })}>
          {t('web.accountNote')}
        </Text>
        <View style={styles.legalRow}>
          {(['community_rules', 'terms', 'privacy'] as const).map((policy) => (
            <Pressable
              key={policy}
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(
                  `https://plantcircle.app/legal/${policy === 'community_rules' ? 'rules' : policy}`,
                ).catch(() => undefined);
              }}
              style={styles.link}
            >
              <Text style={type(13, 'semibold', { color: color.brand })}>
                {t(`legal.policy.${policy}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {error ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger, leading: 1.4 })}>
            {error}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Button
            label={full ? t('web.joinWaitlist') : t('web.reserve')}
            disabled={!adult}
            loading={reserve.isPending}
            onPress={submit}
          />
          <Text style={[type(14, 'regular', { color: color.secondary }), styles.hint]}>
            {adult ? t('web.noApp') : t('web.confirmAge')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: {
    paddingHorizontal: 24,
    gap: 12,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    marginBottom: 6,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hero: {
    height: 200,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: color.fill,
  },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  factText: { flex: 1, minWidth: 0, gap: 2 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    overflow: 'hidden',
  },
  label: { ...type(17, 'semibold'), marginTop: 14 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  footer: { paddingTop: 10, gap: 10 },
  hint: { textAlign: 'center' },
  link: { minHeight: size.touchMin, justifyContent: 'center' },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  stores: { flexDirection: 'row', gap: 10, paddingTop: 4 },
});
