import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ReactNode } from 'react';
import { Button, IconButton } from '../../components/Button';
import {
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  PinIcon,
  PlusIcon,
} from '../../components/icons';
import { EmptyState, FloatingActionBar, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { planImage, welcomePhoto } from '../plans/planImage';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { shortWhen } from '../../lib/dates';
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
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="100%" height={160} radius={radius.card} />
      </View>
    );
  }
  if (detail.isError) {
    const missing = errorCode(detail.error) === 'not_found';
    return (
      <EmptyState
        {...(missing
          ? {}
          : {
              onSavedPlans: () => {
                router.push('/my-plans');
              },
            })}
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

  const whatsapp = async () => {
    setShareFailed(false);
    const url = `whatsapp://send?text=${encodeURIComponent(link)}`;
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await share();
    } catch {
      setShareFailed(true);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.headerTop, paddingBottom: 170 + insets.bottom },
        ]}
      >
        <IconButton
          label={t('common.close')}
          onPress={() => {
            router.replace('/my-plans');
          }}
        >
          <CloseIcon strokeWidth={2.2} color={color.ink} />
        </IconButton>
        <View aria-hidden style={styles.check}>
          <CheckIcon size={42} strokeWidth={2.4} color={color.brand} />
        </View>
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={[type(30, 'bold', { tracking: -0.9, leading: 1.1 }), styles.centre]}
        >
          {t('create.published.title')}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={[
            type(17, 'regular', { color: color.secondary, leading: 1.5 }),
            styles.centre,
            styles.lead,
          ]}
        >
          {t('create.published.lead')}
        </Text>

        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push({ pathname: '/plan/[id]', params: { id } });
          }}
          style={styles.card}
        >
          <View style={styles.thumb}>
            <Photo source={planImage(plan) ?? welcomePhoto} />
          </View>
          <View style={styles.cardText}>
            <Text
              maxFontSizeMultiplier={2.0}
              numberOfLines={1}
              style={type(17, 'semibold', { tracking: -0.3 })}
            >
              {plan.title}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              numberOfLines={1}
              style={type(15, 'regular', { color: color.secondary })}
            >
              {`${shortWhen(plan.startsAt, plan.timezone)} · ${t('plan.spotsTotal', { count: plan.capacity })}`}
            </Text>
          </View>
          <ChevronRightIcon size={16} strokeWidth={2.4} color={color.secondary} />
        </Pressable>

        <View style={styles.linkRow}>
          <Text
            maxFontSizeMultiplier={2.0}
            selectable
            numberOfLines={1}
            accessibilityLabel={t('create.published.linkLabel')}
            style={[type(16, 'regular', { color: extra.bodyText }), styles.linkText]}
          >
            {link.replace(/^https:\/\//, '')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('create.published.copy')}
            onPress={() => {
              void copy();
            }}
            style={styles.copy}
          >
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'semibold', { color: color.surface })}
            >
              {copied ? t('create.published.copied') : t('create.published.copy')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.tiles}>
          <Tile
            label={t('create.published.whatsapp')}
            onPress={() => {
              void whatsapp();
            }}
          >
            <ChatIcon size={24} strokeWidth={1.8} color={color.ink} />
          </Tile>
          <Tile
            label={t('create.published.copy')}
            onPress={() => {
              void copy();
            }}
          >
            <PinIcon size={24} strokeWidth={1.8} color={color.ink} />
          </Tile>
          <Tile
            label={t('create.published.share')}
            onPress={() => {
              void share();
            }}
          >
            <PlusIcon size={24} strokeWidth={1.8} color={color.ink} />
          </Tile>
        </View>
        {shareFailed ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={[type(15, 'regular', { color: color.danger }), styles.centre]}
          >
            {t('create.published.shareFailed')}
          </Text>
        ) : null}
      </ScrollView>

      <FloatingActionBar style={styles.bar}>
        <View style={styles.barText}>
          <Text maxFontSizeMultiplier={1.6} style={type(18, 'bold', { tracking: -0.3 })}>
            {t('create.published.going', { going: plan.goingCount, capacity: plan.capacity })}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary })}
          >
            {t('create.published.notify')}
          </Text>
        </View>
        <Button
          label={t('create.published.manage')}
          onPress={() => {
            router.push({ pathname: '/plan/[id]/manage', params: { id } });
          }}
        />
      </FloatingActionBar>
    </View>
  );
}

function Tile({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.tile}
    >
      <View style={styles.tileIcon}>{children}</View>
      <Text maxFontSizeMultiplier={2.0} style={type(14, 'regular')}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, gap: 0 },
  centre: { textAlign: 'center' },
  lead: { marginTop: 8, marginBottom: 24 },
  check: {
    alignSelf: 'center',
    marginTop: 18,
    marginBottom: 18,
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.brandTint,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: extra.skeleton,
  },
  cardText: { flex: 1, minWidth: 0, gap: 3 },
  linkRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 16,
    backgroundColor: color.fill,
  },
  linkText: { flex: 1, minWidth: 0 },
  copy: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: color.ink,
  },
  tiles: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-around' },
  tile: { alignItems: 'center', gap: 8, minWidth: 72 },
  tileIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 10,
    paddingLeft: 20,
    paddingRight: 10,
  },
  barText: { flex: 1, minWidth: 0, gap: 2 },
});
