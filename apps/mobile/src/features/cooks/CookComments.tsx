import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { MoreIcon } from '../../components/icons';
import { BottomSheet, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { errorCode } from '../../lib/backend/backend';
import type { Cook, CookComment } from '../../lib/backend/types';
import { newIdempotencyKey } from '../plans/queries';
import { Initial, RemovedNotice } from './CookCard';
import { postedAgo } from './postedAgo';
import {
  useAddCookComment,
  useCookComments,
  useDeleteCookComment,
  useRemoveCookComment,
} from './queries';

const BODY_MAX = 500;

/** A post's comments, oldest first, each with its options. */
export function CookComments({ cook, now }: { cook: Cook; now: Date }) {
  const { t } = useTranslation();
  const comments = useCookComments(cook.id);
  const [open, setOpen] = useState<CookComment | null>(null);
  // Pages come newest first; the thread reads oldest first.
  const shown = [...(comments.data?.pages ?? [])].reverse().flatMap((page) => page.items);

  return (
    <View style={styles.section}>
      <Text
        maxFontSizeMultiplier={2.0}
        accessibilityRole="header"
        style={type(20, 'bold', { tracking: -0.4 })}
      >
        {t('cooks.commentsTitle')}
      </Text>
      {comments.isPending ? (
        <View
          role="status"
          aria-busy
          accessibilityLabel={t('common.loading')}
          style={styles.list}
        >
          <Skeleton width="100%" height={56} radius={radius.control} />
          <Skeleton width="80%" height={56} radius={radius.control} />
        </View>
      ) : comments.isError ? (
        <InlineState
          title={t('errors.serverTitle')}
          text={t('errors.serverText')}
          action={
            <Button
              variant="outline"
              label={t('common.retry')}
              onPress={() => void comments.refetch()}
            />
          }
        />
      ) : shown.length === 0 ? (
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}
        >
          {t('cooks.noComments')}
        </Text>
      ) : (
        <View style={styles.list}>
          {comments.hasNextPage ? (
            <Button
              variant="ghost"
              label={t('cooks.earlierComments')}
              loading={comments.isFetchingNextPage}
              onPress={() => void comments.fetchNextPage()}
            />
          ) : null}
          {shown.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <Initial name={comment.mine ? t('cooks.you') : comment.authorName} size={32} />
              <View style={styles.commentBody}>
                <Text maxFontSizeMultiplier={2.0} style={styles.meta}>
                  <Text style={type(14, 'semibold')}>
                    {comment.mine ? t('cooks.you') : comment.authorName}
                  </Text>
                  <Text style={type(13, 'regular', { color: color.secondary })}>
                    {` · ${postedAgo(t, comment.createdAt, now)}`}
                  </Text>
                </Text>
                {comment.hostRemoved ? <RemovedNotice /> : null}
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(16, 'regular', { leading: 1.45 })}
                >
                  {comment.body}
                </Text>
              </View>
              <IconButton
                label={t('cooks.commentOptions')}
                onPress={() => {
                  setOpen(comment);
                }}
              >
                <MoreIcon size={18} strokeWidth={2.4} />
              </IconButton>
            </View>
          ))}
        </View>
      )}
      {open ? (
        <CommentOptions
          cook={cook}
          comment={open}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}

/** Delete your own, remove as a host, or report someone else's; removing asks once more. */
function CommentOptions({
  cook,
  comment,
  onClose,
}: {
  cook: Cook;
  comment: CookComment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const remove = useDeleteCookComment(cook.id);
  const hostRemove = useRemoveCookComment(cook.id);
  const [deleteKey] = useState(newIdempotencyKey);
  const [confirm, setConfirm] = useState<'delete' | 'remove' | null>(null);
  const failed = remove.isError || hostRemove.isError;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={
        confirm === 'remove'
          ? t('cooks.removeCommentTitle')
          : confirm === 'delete'
            ? t('cooks.deleteComment')
            : t('cooks.commentOptions')
      }
      {...(confirm === 'remove' ? { lead: t('cooks.removeCommentText') } : {})}
    >
      {confirm === 'delete' ? (
        <Button
          label={t('cooks.deleteComment')}
          loading={remove.isPending}
          onPress={() => {
            remove.mutate({ commentId: comment.id, key: deleteKey }, { onSuccess: onClose });
          }}
        />
      ) : confirm === 'remove' ? (
        <Button
          label={t('cooks.remove')}
          loading={hostRemove.isPending}
          onPress={() => {
            hostRemove.mutate(comment.id, { onSuccess: onClose });
          }}
        />
      ) : (
        <View style={styles.sheetActions}>
          {comment.mine ? (
            <Button
              variant="outline"
              label={t('cooks.deleteComment')}
              onPress={() => {
                setConfirm('delete');
              }}
            />
          ) : (
            <>
              {comment.canRemove ? (
                <Button
                  variant="outline"
                  label={t('cooks.removeComment')}
                  onPress={() => {
                    setConfirm('remove');
                  }}
                />
              ) : null}
              <Button
                variant="outline"
                label={t('safety.report.cook_comment')}
                onPress={() => {
                  onClose();
                  router.push({
                    pathname: '/report',
                    params: {
                      type: 'cook_comment',
                      id: comment.id,
                      name: comment.body.slice(0, 80),
                      userId: comment.authorId,
                    },
                  });
                }}
              />
            </>
          )}
        </View>
      )}
      {failed ? (
        <Text
          maxFontSizeMultiplier={2.0}
          role="alert"
          style={type(15, 'regular', { color: color.danger })}
        >
          {errorCode(remove.error ?? hostRemove.error) === 'network'
            ? t('errors.offlineText')
            : t('cooks.removeFailed')}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

/** The comment bar under a post: one field and Send. A retry keeps its key. */
export function CommentBar({ cook, bottom }: { cook: Cook; bottom: number }) {
  const { t } = useTranslation();
  const add = useAddCookComment(cook.id);
  const [text, setText] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const body = text.trim();
  const tooLong = text.length > BODY_MAX;
  const failure = add.isError ? errorCode(add.error) : null;
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;

  return (
    <View style={[styles.bar, { paddingBottom: 10 + bottom }]}>
      {failure ? (
        <Text
          maxFontSizeMultiplier={2.0}
          role="alert"
          style={type(14, 'regular', { color: color.danger })}
        >
          {failure === 'rate_limited'
            ? t('cooks.commentRateLimited')
            : failure === 'suspended'
              ? t('cooks.errorPaused')
              : failure === 'network'
                ? t('cooks.errorOffline')
                : t('cooks.commentFailed')}
        </Text>
      ) : null}
      {/* With large type the field and Send no longer fit side by side: they stack. */}
      <View style={stacked ? styles.stack : styles.row}>
        <TextInput
          maxFontSizeMultiplier={2.0}
          accessibilityLabel={t('cooks.commentLabel')}
          testID="comment-input"
          placeholder={t('cooks.commentPlaceholder')}
          placeholderTextColor={color.secondary}
          value={text}
          // Locked while sending, so a comment on its way cannot be sent a second time.
          editable={!add.isPending}
          onChangeText={(next) => {
            if (add.isPending) return;
            setText(next);
            // Different words are a different comment.
            setKey(newIdempotencyKey());
            add.reset();
          }}
          multiline
          maxLength={BODY_MAX}
          style={[styles.input, type(16)]}
        />
        <Button
          label={t('cooks.sendComment')}
          disabled={body.length === 0 || tooLong}
          loading={add.isPending}
          onPress={() => {
            add.mutate(
              { body, key },
              {
                onSuccess: () => {
                  setText('');
                  setKey(newIdempotencyKey());
                },
              },
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16 },
  list: { gap: 18 },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  commentBody: { flex: 1, minWidth: 0, gap: 4, paddingTop: 2 },
  meta: { flexWrap: 'wrap' },
  sheetActions: { gap: 10 },
  bar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  stack: { gap: 8 },
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
