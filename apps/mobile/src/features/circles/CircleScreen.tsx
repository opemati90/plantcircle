import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { ChevronLeftIcon } from '../../components/icons';
import { BottomSheet, EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { CircleRequest } from '../../lib/backend/types';
import { ProviderButtons } from '../auth/ProviderButtons';
import { useAuth } from '../auth/useAuth';
import {
  newIdempotencyKey,
  useCircle,
  useCircleRequests,
  useJoinCircle,
  useRespondToCircleRequest,
} from '../plans/queries';
import { circleMeta } from './circleRules';

/** One Circle: what it is, who runs it, and the step that joins or asks to join. */
export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const circle = useCircle(id);
  const join = useJoinCircle(id);
  const canModerate =
    circle.data?.viewerRole === 'owner' || circle.data?.viewerRole === 'moderator';
  const requests = useCircleRequests(id, canModerate);
  const respond = useRespondToCircleRequest();
  const [asking, setAsking] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [answer, setAnswer] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const [decisionKeys, setDecisionKeys] = useState<Record<string, string>>({});

  const back = (
    <IconButton
      label={t('common.back')}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/explore');
      }}
      style={[styles.back, { top: insets.top + 8 }]}
    >
      <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
    </IconButton>
  );

  if (circle.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="60%" height={34} radius={8} />
        <Skeleton width="100%" height={120} radius={radius.card} />
      </View>
    );
  }
  if (circle.isError) {
    const missing = errorCode(circle.error) === 'not_found';
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={missing ? t('circles.notFound') : t('errors.serverTitle')}
          text={missing ? t('errors.notFoundText') : t('errors.serverText')}
          actions={
            <>
              {missing ? null : (
                <Button
                  label={t('common.retry')}
                  onPress={() => {
                    void circle.refetch();
                  }}
                />
              )}
              <Button
                variant="outline"
                label={t('common.back')}
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/explore');
                }}
              />
            </>
          }
        />
      </View>
    );
  }

  const data = circle.data;
  // The server's view is the only source of standing, so a declined request stops showing as pending.
  const requested = data.viewerRequestPending;
  const member = data.viewerRole !== null;

  // A visitor is asked to make an account first; the join then runs from here.
  const needsAccount = !session;
  const joinNow = () => {
    if (needsAccount) {
      setSigningUp(true);
      return;
    }
    join.mutate(
      { answer: null, key },
      {
        onSuccess: () => {
          setKey(newIdempotencyKey());
        },
      },
    );
  };
  const startAsk = () => {
    if (needsAccount) {
      setSigningUp(true);
      return;
    }
    setAsking(true);
  };
  const sendRequest = () => {
    join.mutate(
      { answer: answer.trim() || null, key },
      {
        onSuccess: () => {
          setAsking(false);
          setKey(newIdempotencyKey());
        },
      },
    );
  };
  // A retry of the same decision reuses its key, so a lost response cannot make it look failed.
  const decide = (request: CircleRequest, approve: boolean) => {
    const decision = `${request.id}:${approve}`;
    const decisionKey = decisionKeys[decision] ?? newIdempotencyKey();
    setDecisionKeys((keys) => ({ ...keys, [decision]: decisionKey }));
    respond.mutate(
      { requestId: request.id, approve, key: decisionKey },
      {
        onSuccess: () => {
          setDecisionKeys((keys) =>
            Object.fromEntries(Object.entries(keys).filter(([name]) => name !== decision)),
          );
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 64, paddingBottom: 40 + insets.bottom },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {data.name}
        </Text>
        {data.tagline ? (
          <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
            {data.tagline}
          </Text>
        ) : null}
        <Text style={type(15, 'regular', { color: color.secondary })}>{circleMeta(t, data)}</Text>

        {member ? (
          <Text role="status" style={type(17, 'semibold', { color: color.brand })}>
            {t('circles.member')}
          </Text>
        ) : data.access === 'open' ? (
          <View style={styles.action}>
            <Text style={type(15, 'regular', { color: color.secondary })}>
              {t('circles.access.openLead')}
            </Text>
            <Button label={t('circles.join')} loading={join.isPending} onPress={joinNow} />
          </View>
        ) : requested ? (
          <Button label={t('circles.requested')} disabled onPress={() => undefined} />
        ) : (
          <View style={styles.action}>
            <Text style={type(15, 'regular', { color: color.secondary })}>
              {t('circles.access.requestLead')}
            </Text>
            <Button label={t('circles.askToJoin')} onPress={startAsk} />
          </View>
        )}
        {join.isError && !asking ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('circles.genericError')}
          </Text>
        ) : null}

        {canModerate && data.access === 'request' ? (
          <View style={styles.requests}>
            <Text accessibilityRole="header" style={type(20, 'semibold', { tracking: -0.4 })}>
              {t('circles.requests.title')}
            </Text>
            {requests.isError ? (
              <InlineState
                title={t('errors.serverTitle')}
                text={t('errors.serverText')}
                action={
                  <Button
                    variant="outline"
                    label={t('common.retry')}
                    onPress={() => {
                      void requests.refetch();
                    }}
                  />
                }
              />
            ) : requests.isPending ? (
              <Skeleton width="100%" height={88} radius={radius.card} />
            ) : requests.data.length === 0 ? (
              <Text style={type(15, 'regular', { color: color.secondary })}>
                {t('circles.requests.empty')}
              </Text>
            ) : (
              requests.data.map((request) => (
                <View key={request.id} style={styles.request}>
                  <Text style={type(17, 'semibold', { tracking: -0.3 })}>
                    {request.displayName ?? t('circles.requests.someone')}
                  </Text>
                  {request.answer ? (
                    <Text style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}>
                      {request.answer}
                    </Text>
                  ) : null}
                  <View style={styles.decisions}>
                    <View style={styles.decision}>
                      <Button
                        label={t('circles.requests.approve')}
                        disabled={respond.isPending}
                        onPress={() => {
                          decide(request, true);
                        }}
                      />
                    </View>
                    <View style={styles.decision}>
                      <Button
                        variant="outline"
                        label={t('circles.requests.decline')}
                        disabled={respond.isPending}
                        onPress={() => {
                          decide(request, false);
                        }}
                      />
                    </View>
                  </View>
                </View>
              ))
            )}
            {respond.isError ? (
              <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                {t('circles.genericError')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet
        open={signingUp}
        onClose={() => {
          setSigningUp(false);
        }}
        title={t('circles.signUpTitle')}
        lead={t('circles.signUpLead')}
      >
        <ProviderButtons
          gap={14}
          onSignedIn={() => {
            setSigningUp(false);
          }}
        />
        <Button
          variant="outline"
          label={t('plan.sheet.useEmail')}
          onPress={() => {
            setSigningUp(false);
            router.push({ pathname: '/sign-up', params: { next: `/circle/${data.id}` } });
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={asking}
        onClose={() => {
          setAsking(false);
        }}
        title={t('circles.requestTitle', { name: data.name })}
        lead={data.joinQuestion ?? t('circles.requestLead')}
      >
        <View style={styles.sheet}>
          <Text style={type(14, 'semibold', { color: color.secondary })}>
            {t('circles.answerLabel')}
          </Text>
          <TextInput
            accessibilityLabel={t('circles.answerLabel')}
            value={answer}
            onChangeText={setAnswer}
            multiline
            maxLength={300}
            style={[styles.answer, type(17)]}
          />
          {join.isError ? (
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('circles.genericError')}
            </Text>
          ) : null}
          <Button label={t('circles.send')} loading={join.isPending} onPress={sendRequest} />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  action: { gap: 12, paddingTop: 8 },
  requests: { gap: 12, paddingTop: 16 },
  request: {
    gap: 10,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  decisions: { flexDirection: 'row', gap: 10 },
  decision: { flex: 1 },
  sheet: { gap: 12 },
  answer: {
    minHeight: 110,
    padding: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    textAlignVertical: 'top',
    color: color.ink,
  },
});
