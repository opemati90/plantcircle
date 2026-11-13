import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../plans/queries';
import { useFeedback, useSubmitFeedback } from './queries';

const RATINGS = [1, 2, 3, 4, 5] as const;

/** A guest's feedback on a Plan they came to. Only open once the Plan has ended. */
export default function FeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const feedback = useFeedback(id);
  const submit = useSubmitFeedback(id);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  // One key per content: a retry of the same feedback replays, a changed one is a new submission.
  const [key, setKey] = useState(newIdempotencyKey);
  const seeded = useRef(false);

  // Fill the form from what the guest already gave, once. Later refetches must not overwrite edits.
  useEffect(() => {
    if (seeded.current || !feedback.data) return;
    seeded.current = true;
    if (feedback.data.rating) setRating(feedback.data.rating);
    if (feedback.data.comment) setComment(feedback.data.comment);
  }, [feedback.data]);
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [rating, comment]);

  const back = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/my-plans');
      }}
    />
  );

  if (session === undefined) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        <Skeleton width="70%" height={34} radius={8} />
      </View>
    );
  }
  if (session === null) {
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={t('hostFeedback.signInTitle')}
          text={t('hostFeedback.lead')}
          actions={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: `/plan/${id}/feedback` } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (feedback.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        <Skeleton width="70%" height={34} radius={8} />
        <Skeleton width="100%" height={96} radius={radius.card} />
      </View>
    );
  }
  if (feedback.isError) {
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          onSavedPlans={() => { router.push('/my-plans'); }}
          title={t('errors.serverTitle')}
          text={t('errors.serverText')}
          actions={<Button label={t('common.retry')} onPress={() => void feedback.refetch()} />}
        />
      </View>
    );
  }
  if (!feedback.data.eligible) {
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={t('hostFeedback.title')}
          text={t('hostFeedback.closed')}
          actions={
            <Button
              variant="outline"
              label={t('common.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/my-plans');
              }}
            />
          }
        />
      </View>
    );
  }

  const send = () => {
    if (rating === null) return;
    submit.mutate(
      { rating, comment: comment.trim() || null, key },
      {
        onSuccess: () => {
          setSaved(true);
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16, paddingBottom: 40 + insets.bottom },
        ]}
      >
        <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
          {t('hostFeedback.title')}
        </Text>
        <Text style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}>
          {t('hostFeedback.lead')}
        </Text>

        <View accessibilityRole="radiogroup" accessibilityLabel={t('hostFeedback.title')} style={styles.ratings}>
          {RATINGS.map((value) => {
            const selected = rating === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                aria-checked={selected}
                accessibilityLabel={t('hostFeedback.rating', { rating: value })}
                disabled={submit.isPending}
                onPress={() => {
                  setSaved(false);
                  setRating(value);
                }}
                style={[styles.rating, selected && styles.ratingSelected]}
              >
                <Text style={type(17, 'semibold', { color: selected ? color.brand : color.ink })}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={type(14, 'semibold', { color: color.secondary })}>
          {t('hostFeedback.commentLabel')}
        </Text>
        <TextInput
          accessibilityLabel={t('hostFeedback.commentLabel')}
          value={comment}
          onChangeText={(next) => {
            setSaved(false);
            setComment(next);
          }}
          editable={!submit.isPending}
          multiline
          maxLength={500}
          style={[styles.area, type(17)]}
        />

        {submit.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('hostFeedback.error')}
          </Text>
        ) : null}
        {saved ? (
          <Text role="status" style={type(17, 'semibold', { color: color.brand })}>
            {t('hostFeedback.thanks')}
          </Text>
        ) : null}

        <Button
          label={t('hostFeedback.submit')}
          disabled={rating === null || saved}
          loading={submit.isPending}
          onPress={send}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  content: { paddingHorizontal: 24, gap: 12 },
  ratings: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  rating: {
    flex: 1,
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  ratingSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  area: {
    minHeight: 110,
    padding: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    textAlignVertical: 'top',
    color: color.ink,
  },
});
