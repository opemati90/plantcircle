import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { localTime } from '../../lib/dates';
import { useDirectRequests, useRespondDirect } from './queries';

/** First-message requests from people who share a Circle with you. Accept opens the chat. */
export default function RequestsScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const requests = useDirectRequests();
  const respond = useRespondDirect();

  const back = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/explore');
      }}
    />
  );

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16, paddingBottom: 40 + insets.bottom },
        ]}
      >
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('direct.requestsTitle')}
        </Text>
        {requests.isPending ? (
          <Skeleton width="100%" height={120} radius={radius.card} />
        ) : requests.isError ? (
          <InlineState
            title={t('errors.serverTitle')}
            text={t('errors.serverText')}
            action={
              <Button
                variant="outline"
                label={t('common.retry')}
                onPress={() => void requests.refetch()}
              />
            }
          />
        ) : requests.data.length === 0 ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'regular', { color: color.secondary })}
          >
            {t('direct.requestsEmpty')}
          </Text>
        ) : (
          requests.data.map((request) => (
            <View key={request.id} style={styles.card}>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(17, 'semibold', { tracking: -0.3 })}
              >
                {request.fromName}
              </Text>
              <Text maxFontSizeMultiplier={2.0} style={type(15, 'regular', { leading: 1.5 })}>
                {request.firstMessage}
              </Text>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(13, 'regular', { color: color.secondary })}
              >
                {localTime(request.createdAt)}
              </Text>
              <View style={styles.actions}>
                <Button
                  label={t('direct.accept')}
                  accessibilityLabel={`${t('direct.accept')} ${request.fromName}`}
                  loading={respond.isPending && respond.variables.requestId === request.id}
                  disabled={respond.isPending}
                  onPress={() => {
                    respond.mutate(
                      { requestId: request.id, accept: true },
                      {
                        onSuccess: (status) => {
                          // Accepting opens the conversation: go straight to it.
                          if (status === 'accepted') {
                            router.push({
                              pathname: '/chat/direct/[id]',
                              params: { id: request.fromId },
                            });
                          }
                        },
                      },
                    );
                  }}
                />
                <Button
                  variant="outline"
                  label={t('direct.decline')}
                  accessibilityLabel={`${t('direct.decline')} ${request.fromName}`}
                  disabled={respond.isPending}
                  onPress={() => {
                    respond.mutate({ requestId: request.id, accept: false });
                  }}
                />
              </View>
            </View>
          ))
        )}
        {respond.isError ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(15, 'regular', { color: color.danger })}
          >
            {t('chat.error')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  content: { paddingHorizontal: 24, gap: 12 },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
});
