import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { BellIcon, ChevronRightIcon, UserIcon } from '../../components/icons';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { AppNotification, InboxKind, InboxThread } from '../../lib/backend/types';
import { isToday, localTime, shortDate } from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { useAuth } from '../auth/useAuth';
import { useDirectRequests } from '../chat/queries';
import { imageByPath, welcomePhoto } from '../plans/planImage';
import { describeNotification } from '../notifications/notificationCopy';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '../notifications/queries';
import { useInbox } from './queries';

type Filter = 'all' | InboxKind | 'updates';
const FILTERS: Filter[] = ['all', 'updates', 'plan', 'circle', 'direct'];
const FILTER_KEY: Record<Filter, string> = {
  all: 'inbox.filterAll',
  updates: 'inbox.filterUpdates',
  plan: 'inbox.filterPlans',
  circle: 'inbox.filterCircles',
  direct: 'inbox.filterDirect',
};
const KIND_KEY: Record<InboxKind, string> = {
  plan: 'inbox.kindPlan',
  circle: 'inbox.kindCircle',
  direct: 'inbox.kindDirect',
};

/** The chats a member can use, filtered by kind, with unread dots and the pending message requests. */
export default function InboxScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const inbox = useInbox(Boolean(session));
  const requests = useDirectRequests();
  const notifications = useNotifications(Boolean(session));
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [filter, setFilter] = useState<Filter>('all');
  const unreadUpdates = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  const openNotification = (n: AppNotification) => {
    const { href } = describeNotification(t, n);
    if (!n.readAt) markRead.mutate(n.id);
    if (href) router.push(href);
  };

  const threadHref = (thread: InboxThread): Href =>
    thread.kind === 'plan'
      ? { pathname: '/chat/plan/[id]', params: { id: thread.refId } }
      : thread.kind === 'circle'
        ? { pathname: '/chat/circle/[id]', params: { id: thread.refId } }
        : { pathname: '/chat/direct/[id]', params: { id: thread.refId } };

  const body = () => {
    if (session === null) {
      return (
        <InlineState
          title={t('people.signedOut.title')}
          text={t('inbox.signedOutText')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/inbox' } });
              }}
            />
          }
        />
      );
    }
    if (session === undefined || inbox.isPending) {
      return (
        <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.list}>
          <Skeleton width="100%" height={80} radius={radius.card} />
          <Skeleton width="100%" height={80} radius={radius.card} />
        </View>
      );
    }
    if (inbox.isError) {
      return (
        <EmptyState
          onSavedPlans={() => { router.push('/my-plans'); }}
          title={errorCode(inbox.error) === 'network' ? t('errors.offlineTitle') : t('errors.serverTitle')}
          text={errorCode(inbox.error) === 'network' ? t('errors.offlineText') : t('errors.serverText')}
          actions={<Button label={t('common.tryAgain')} onPress={() => void inbox.refetch()} />}
        />
      );
    }
    if (filter === 'updates') {
      const rows = notifications.data ?? [];
      if (notifications.isError) {
        return (
          <InlineState title={t('errors.serverTitle')} text={t('errors.serverText')} action={<Button variant="outline" label={t('common.retry')} onPress={() => void notifications.refetch()} />} />
        );
      }
      if (rows.length === 0) {
        return <InlineState title={t('notify.emptyTitle')} text={t('notify.emptyText')} />;
      }
      return (
        <View>
          {unreadUpdates > 0 ? (
            <View style={styles.markAll}>
              <Button variant="ghost" label={t('notify.markAllRead')} loading={markAll.isPending} onPress={() => { markAll.mutate(); }} />
            </View>
          ) : null}
          {rows.map((n) => (
            <NotificationRow key={n.id} notification={n} onPress={() => { openNotification(n); }} />
          ))}
        </View>
      );
    }
    const shown = inbox.data.filter((thread) => filter === 'all' || thread.kind === filter);
    if (shown.length === 0) {
      return (
        <InlineState
          title={t('inbox.emptyTitle')}
          text={filter === 'direct' ? t('inbox.emptyDirectText') : t('inbox.emptyText')}
          action={
            <Button
              variant="outline"
              label={t('inbox.explore')}
              onPress={() => {
                router.push('/explore');
              }}
            />
          }
        />
      );
    }
    return (
      <View>
        {shown.map((thread) => (
          <ThreadRow
            key={`${thread.kind}-${thread.refId}`}
            thread={thread}
            kindLabel={t(KIND_KEY[thread.kind])}
            onPress={() => {
              router.push(threadHref(thread));
            }}
          />
        ))}
      </View>
    );
  };

  const pendingRequests = requests.data?.length ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: 120 + insets.bottom }]}
    >
      <Text accessibilityRole="header" style={type(34, 'bold', { tracking: -1.1 })}>
        {t('inbox.title')}
      </Text>
      <View accessibilityRole="tablist" style={styles.filters}>
        {FILTERS.map((item) => {
          const selected = filter === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => {
                setFilter(item);
              }}
              style={[styles.filter, selected && styles.filterSelected]}
            >
              <Text style={type(15, 'semibold', { color: selected ? color.surface : color.ink })}>
                {item === 'updates' && unreadUpdates > 0 ? `${t(FILTER_KEY[item])} · ${unreadUpdates}` : t(FILTER_KEY[item])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {session && requests.isError ? (
        <View style={styles.requests}>
          <Text role="alert" style={[type(15, 'regular', { color: color.danger }), styles.grow]}>
            {t('errors.serverText')}
          </Text>
          <Button variant="outline" label={t('common.retry')} onPress={() => void requests.refetch()} />
        </View>
      ) : session && pendingRequests > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push('/messages/requests');
          }}
          style={styles.requests}
        >
          <View aria-hidden style={styles.requestsIcon}>
            <UserIcon size={20} strokeWidth={1.9} color={color.ink} />
          </View>
          <View style={styles.grow}>
            <Text style={type(16, 'semibold')}>{t('inbox.requests', { count: pendingRequests })}</Text>
            <Text style={type(14, 'regular', { color: color.secondary })}>{t('inbox.requestsLead')}</Text>
          </View>
          <ChevronRightIcon size={16} strokeWidth={2.4} color={color.secondary} />
        </Pressable>
      ) : null}

      {body()}
    </ScrollView>
  );
}

function NotificationRow({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const { t } = useTranslation();
  const { title, note } = describeNotification(t, notification);
  const when = isToday(notification.createdAt, new Date())
    ? localTime(notification.createdAt)
    : shortDate(notification.createdAt, Intl.DateTimeFormat(currentLanguage()).resolvedOptions().timeZone);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${note}${notification.readAt ? '' : `. ${t('notify.unread')}`}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.updateIcon, !notification.readAt && styles.updateIconUnread]}>
        <BellIcon size={18} strokeWidth={1.9} color={notification.readAt ? color.secondary : color.brand} />
      </View>
      <View style={styles.grow}>
        <View style={styles.rowHead}>
          <Text numberOfLines={2} style={[type(16, notification.readAt ? 'medium' : 'semibold', { tracking: -0.2 }), styles.grow]}>{title}</Text>
          <Text style={type(13, 'regular', { color: color.secondary })}>{when}</Text>
        </View>
        {note ? <Text numberOfLines={2} style={type(14, 'regular', { color: color.secondary })}>{note}</Text> : null}
      </View>
      {notification.readAt ? null : <View aria-hidden style={styles.dot} />}
    </Pressable>
  );
}

function ThreadRow({
  thread,
  kindLabel,
  onPress,
}: {
  thread: InboxThread;
  kindLabel: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const when = thread.lastAt
    ? isToday(thread.lastAt, new Date())
      ? localTime(thread.lastAt)
      : shortDate(thread.lastAt, Intl.DateTimeFormat(currentLanguage()).resolvedOptions().timeZone)
    : '';
  const preview = thread.lastBody
    ? thread.lastSenderName && thread.kind !== 'direct'
      ? `${thread.lastSenderName}: ${thread.lastBody}`
      : thread.lastBody
    : t('inbox.noMessages');
  const kind = [kindLabel, thread.muted ? t('inbox.muted') : null].filter(Boolean).join(' · ');
  const label = `${thread.title}. ${preview}. ${kind}${thread.unread > 0 ? `. ${t('inbox.unread', { count: thread.unread })}` : ''}`;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.row}>
      {thread.kind === 'plan' ? (
        <View aria-hidden style={styles.thumb}>
          <Photo source={thread.imagePath ? (imageByPath(thread.imagePath) ?? welcomePhoto) : welcomePhoto} />
        </View>
      ) : (
        <View aria-hidden style={[styles.initial, { backgroundColor: extra.tints[2].background }]}>
          <Text allowFontScaling={false} style={type(20, 'bold', { color: extra.tints[2].text })}>
            {thread.title.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.rowText}>
        <View style={styles.rowLine}>
          <Text numberOfLines={1} style={[type(17, 'semibold', { tracking: -0.3 }), styles.grow]}>
            {thread.title}
          </Text>
          <Text style={type(14, 'regular', { color: color.secondary })}>{when}</Text>
        </View>
        <View style={styles.rowLine}>
          <Text
            numberOfLines={1}
            style={[
              type(15, thread.unread > 0 ? 'semibold' : 'regular', {
                color: thread.unread > 0 ? color.ink : color.secondary,
              }),
              styles.grow,
            ]}
          >
            {preview}
          </Text>
          {thread.unread > 0 ? <View aria-hidden style={styles.dot} /> : null}
        </View>
        <Text style={type(13, 'regular', { color: color.secondary })}>{kind}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 20, gap: 16 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  filterSelected: { backgroundColor: color.ink },
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: color.fill,
  },
  requestsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, minWidth: 0 },
  list: { gap: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  updateIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  updateIconUnread: { backgroundColor: color.brandTint },
  markAll: { alignItems: 'flex-end' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  thumb: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', backgroundColor: extra.skeleton },
  initial: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.brand },
});
