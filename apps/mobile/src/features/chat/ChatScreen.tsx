import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { ChevronLeftIcon } from '../../components/icons';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { ChatMessage } from '../../lib/backend/types';
import { localTime } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../plans/queries';
import { useConversation, useMessages, useSendMessage } from './queries';

/** A group chat for a Plan or a Circle. Members read and post; anyone else is refused by the server. */
export function Chat({ kind, refId }: { kind: 'plan' | 'circle'; refId: string }) {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const conversation = useConversation(kind, refId);
  const conversationId = conversation.data;
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const [text, setText] = useState('');
  // One id per message text: a retry of the same text is recognised and not posted twice, while
  // edited text is a new message with a new id.
  const [clientId, setClientId] = useState(newIdempotencyKey);
  useEffect(() => {
    setClientId(newIdempotencyKey());
  }, [text]);
  const list = useRef<ScrollViewInstance>(null);
  const lead = kind === 'plan' ? t('chat.lead') : t('chat.circleLead');

  useEffect(() => {
    list.current?.scrollToEnd({ animated: false });
  }, [messages.data?.length]);

  const back = (
    <IconButton
      label={t('common.back')}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/home');
      }}
      style={[styles.back, { top: insets.top + 8 }]}
    >
      <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
    </IconButton>
  );

  if (session === undefined) {
    return <View style={styles.screen} />;
  }
  if (session === null) {
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={t('people.signedOut.title')}
          text={lead}
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
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={closed ? t('chat.closed') : t('errors.serverTitle')}
          text={closed ? lead : t('errors.serverText')}
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
      {back}
      <View style={[styles.header, { paddingTop: insets.top + 64 }]}>
        <Text accessibilityRole="header" style={type(24, 'bold', { tracking: -0.6 })}>
          {kind === 'plan' ? t('chat.openPlan') : t('chat.openCircle')}
        </Text>
        <Text style={type(14, 'regular', { color: color.secondary, leading: 1.5 })}>
          {lead}
        </Text>
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
            return (
              <View key={message.id} style={[styles.bubble, mine && styles.mine]}>
                <Text style={type(13, 'semibold', { color: color.secondary })}>
                  {`${message.senderName} · ${localTime(message.createdAt)}`}
                </Text>
                <Text style={type(17, 'regular', { leading: 1.45 })}>{message.body}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

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
export function PlanChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Chat kind="plan" refId={id} />;
}

/** The Circle chat, opened from a Circle's route. */
export function CircleChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Chat kind="circle" refId={id} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  header: { paddingHorizontal: 20, gap: 4, paddingBottom: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  bubble: {
    gap: 4,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    maxWidth: '85%',
  },
  mine: { alignSelf: 'flex-end', backgroundColor: color.brandTint, borderColor: color.brandTint },
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
