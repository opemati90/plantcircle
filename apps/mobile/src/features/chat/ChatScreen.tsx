import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { Button } from '../../components/Button';
import { ChevronLeftIcon } from '../../components/icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { BottomSheet, EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { ChatMessage } from '../../lib/backend/types';
import { localTime } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useMarkRead } from '../inbox/queries';
import { newIdempotencyKey } from '../plans/queries';
import {
  useConversation,
  useConversationPrefs,
  useConversationSettings,
  useMessages,
  useRequestDirect,
  useSendMessage,
} from './queries';

/**
 * A chat: a Plan's, a Circle's, or a direct one with a person. Members read and post; anyone else is
 * refused by the server. Until a direct request is accepted there is no chat, only the request.
 */
export function Chat({ kind, refId }: { kind: 'plan' | 'circle' | 'direct'; refId: string }) {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const conversation = useConversation(kind, refId);
  const conversationId = conversation.data;
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const [text, setText] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  // One id per message text: a retry of the same text is recognised and not posted twice, while
  // edited text is a new message with a new id.
  const [clientId, setClientId] = useState(newIdempotencyKey);
  useEffect(() => {
    setClientId(newIdempotencyKey());
  }, [text]);
  const list = useRef<ScrollViewInstance>(null);
  const lead = kind === 'plan' ? t('chat.lead') : kind === 'circle' ? t('chat.circleLead') : null;
  const settings = useConversationSettings(conversationId);
  const prefs = useConversationPrefs(conversationId);
  const mutedNow = settings.data?.mutedUntil ? Date.parse(settings.data.mutedUntil) > Date.now() : false;

  const markRead = useMarkRead();
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    list.current?.scrollToEnd({ animated: false });
    const newest = messages.data?.[messages.data.length - 1];
    if (conversationId && newest) {
      markReadMutate({ conversationId, upTo: newest.createdAt });
    }
  }, [messages.data, conversationId, markReadMutate]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const back = <ScreenHeader backLabel={t('common.back')} onBack={goBack} />;

  if (session === undefined) {
    return <View style={styles.screen} />;
  }
  if (session === null) {
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={t('people.signedOut.title')}
          text={lead ?? t('chat.lead')}
          actions={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/home' } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (conversation.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        <Skeleton width="60%" height={34} radius={8} />
      </View>
    );
  }
  if (conversation.isError) {
    const closed = errorCode(conversation.error) === 'closed_chat';
    if (kind === 'direct' && closed) {
      return (
        <DirectRequest
          userId={refId}
          onAccepted={() => {
            void conversation.refetch();
          }}
          back={back}
        />
      );
    }
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={closed ? t('chat.closed') : t('errors.serverTitle')}
          text={closed ? (lead ?? t('chat.lead')) : t('errors.serverText')}
          actions={
            closed ? (
              <Button
                variant="outline"
                label={t('common.back')}
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/home');
                }}
              />
            ) : (
              <Button label={t('common.retry')} onPress={() => void conversation.refetch()} />
            )
          }
        />
      </View>
    );
  }

  const body = text.trim();
  // Counted in characters, as the database counts them; the field itself allows a little more raw text.
  const tooLong = Array.from(body).length > 1000;
  const submit = () => {
    if (body.length === 0 || tooLong) return;
    const sent = text;
    send.mutate(
      { body, clientId },
      {
        onSuccess: () => {
          // Clear only what was sent: text typed while the send was in flight stays.
          setText((current) => (current === sent ? '' : current));
        },
      },
    );
  };
  const sendError = send.isError
    ? errorCode(send.error) === 'rate_limited'
      ? t('chat.rateLimited')
      : errorCode(send.error) === 'closed_chat'
        ? t('chat.closed')
        : t('chat.error')
    : null;

  const shown: ChatMessage[] = messages.data ?? [];

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.headerTop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={goBack}
          style={styles.circle}
        >
          <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
        </Pressable>
        <View style={styles.barText}>
          <Text numberOfLines={1} accessibilityRole="header" style={type(17, 'semibold', { tracking: -0.3 })}>
            {kind === 'plan' ? t('chat.openPlan') : kind === 'circle' ? t('chat.openCircle') : t('direct.messageButton')}
          </Text>
          {lead ? (
            <Text numberOfLines={1} style={type(13, 'regular', { color: color.secondary })}>{lead}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat.more')}
          onPress={() => {
            setOptionsOpen(true);
          }}
          style={styles.circle}
        >
          <Text style={type(20, 'bold', { color: color.ink })}>···</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={list}
        role="log"
        aria-live="polite"
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {messages.isPending ? (
          <Skeleton width="100%" height={56} radius={radius.card} />
        ) : messages.isError ? (
          <EmptyState
            title={t('errors.serverTitle')}
            text={t('errors.serverText')}
            actions={<Button label={t('common.retry')} onPress={() => void messages.refetch()} />}
          />
        ) : shown.length === 0 ? (
          <InlineState
            title={t('chat.emptyTitle')}
            text={kind === 'plan' ? t('chat.emptyText') : t('chat.circleEmptyText')}
          />
        ) : (
          shown.map((message) => {
            const mine = message.senderId === session.userId;
            const tint = extra.tints[message.senderName.charCodeAt(0) % extra.tints.length] ?? extra.tints[0];
            return (
              <View key={message.id} style={[styles.line, mine && styles.lineMine]}>
                {mine ? null : (
                  <View aria-hidden style={[styles.avatarSmall, { backgroundColor: tint.background }]}>
                    <Text allowFontScaling={false} style={type(13, 'bold', { color: tint.text })}>
                      {message.senderName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.stack}>
                  {mine ? null : (
                    <Text style={[type(13, 'semibold', { color: color.secondary }), styles.senderName]}>
                      {message.senderName}
                    </Text>
                  )}
                  <View style={[styles.bubble, mine && styles.mine]}>
                    <Text style={type(16, 'regular', { leading: 1.45, color: mine ? '#FFFFFF' : color.ink })}>
                      {message.body}
                    </Text>
                  </View>
                  <Text style={[type(12, 'regular', { color: color.secondary }), mine ? styles.timeMine : styles.time]}>
                    {localTime(message.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <BottomSheet
        open={optionsOpen}
        onClose={() => {
          setOptionsOpen(false);
        }}
        title={t('chat.options')}
      >
        <View style={styles.options}>
          <Button
            variant="outline"
            label={mutedNow ? t('direct.unmute') : t('direct.mute8')}
            disabled={!settings.data || prefs.mute.isPending}
            loading={prefs.mute.isPending}
            onPress={() => {
              prefs.mute.mutate(mutedNow ? null : new Date(Date.now() + 8 * 3_600_000).toISOString());
            }}
          />
          <Button
            variant="outline"
            label={settings.data?.pinned ? t('direct.unpin') : t('direct.pin')}
            disabled={!settings.data || prefs.pin.isPending}
            loading={prefs.pin.isPending}
            onPress={() => {
              prefs.pin.mutate(!settings.data?.pinned);
            }}
          />
          {settings.isError ? (
            <>
              <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
                {t('direct.prefsError')}
              </Text>
              <Button variant="outline" label={t('common.retry')} onPress={() => void settings.refetch()} />
            </>
          ) : null}
          {prefs.mute.isError || prefs.pin.isError ? (
            <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
              {t('direct.prefsError')}
            </Text>
          ) : null}
        </View>
      </BottomSheet>

      <View style={[styles.composer, { paddingBottom: 12 + insets.bottom }]}>
        {tooLong ? (
          <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
            {t('chat.tooLong')}
          </Text>
        ) : sendError ? (
          <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
            {sendError}
          </Text>
        ) : null}
        <View style={styles.row}>
          <TextInput
            accessibilityLabel={t('chat.placeholder')}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={color.secondary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            style={[styles.input, type(17)]}
          />
          <Button
            label={t('chat.send')}
            disabled={body.length === 0 || tooLong}
            loading={send.isPending}
            onPress={submit}
          />
        </View>
      </View>
    </View>
  );
}

/** The Plan chat, opened from a Plan's route. */
/** The first message to someone, for a direct chat that does not exist yet. */
function DirectRequest({
  userId,
  onAccepted,
  back,
}: {
  userId: string;
  onAccepted: () => void;
  back: ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const request = useRequestDirect(userId);
  const [text, setText] = useState('');
  // The request's id follows its text, so a retry of the same text is the same request.
  const [clientId, setClientId] = useState(newIdempotencyKey);
  useEffect(() => {
    setClientId(newIdempotencyKey());
  }, [text]);
  const body = text.trim();
  const tooLong = Array.from(body).length > 1000;
  const answered = request.data?.status;
  useEffect(() => {
    if (answered === 'accepted') onAccepted();
  }, [answered, onAccepted]);

  return (
    <View style={styles.screen}>
      {back}
      <View style={[styles.header, { paddingTop: 8 }]}>
        <Text accessibilityRole="header" style={type(24, 'bold', { tracking: -0.6 })}>
          {t('direct.messageButton')}
        </Text>
        <Text style={type(14, 'regular', { color: color.secondary, leading: 1.5 })}>
          {t('direct.requestLead')}
        </Text>
      </View>
      <View style={[styles.composer, { paddingBottom: 12 + insets.bottom }]}>
        {answered === 'pending' || answered === 'declined' ? (
          <Text role="status" style={type(15, 'regular', { color: color.secondary })}>
            {t('direct.requestSent')}
          </Text>
        ) : null}
        {tooLong ? (
          <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
            {t('chat.tooLong')}
          </Text>
        ) : request.isError ? (
          <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
            {errorCode(request.error) === 'rate_limited' ? t('direct.requestLimit') : t('chat.error')}
          </Text>
        ) : null}
        <View style={styles.row}>
          <TextInput
            accessibilityLabel={t('chat.placeholder')}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={color.secondary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            style={[styles.input, type(17)]}
          />
          <Button
            label={t('chat.send')}
            disabled={body.length === 0 || tooLong || answered !== undefined}
            loading={request.isPending}
            onPress={() => {
              request.mutate({ firstMessage: body, clientId });
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function PlanChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Chat kind="plan" refId={id} />;
}

/** The Circle chat, opened from a Circle's route. */
export function CircleChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Chat kind="circle" refId={id} />;
}

/** The direct chat with a person, opened from People or from a request. */
export function DirectChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Chat kind="direct" refId={id} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  barText: { flex: 1, minWidth: 0, gap: 1 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { paddingHorizontal: 20, gap: 4, paddingBottom: 8 },
  options: { gap: 12 },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '86%' },
  lineMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarSmall: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stack: { gap: 3, flexShrink: 1 },
  senderName: { paddingLeft: 4 },
  time: { paddingLeft: 4 },
  timeMine: { alignSelf: 'flex-end', paddingRight: 4 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: color.fill,
  },
  mine: { backgroundColor: color.ink, borderBottomLeftRadius: 18, borderBottomRightRadius: 6 },
  composer: { paddingHorizontal: 20, paddingTop: 8, gap: 8, borderTopWidth: 1, borderTopColor: extra.cardBorder },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1,
    minHeight: size.touchMin,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
});
