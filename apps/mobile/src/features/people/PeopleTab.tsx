import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { OfflineIcon } from '../../components/icons';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { errorCode } from '../../lib/backend/backend';
import type { Person } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../plans/queries';
import { useConnectWithPerson, usePeople } from './queries';

/** People who chose to be visible and share a Circle with you. Connecting is a request. */
export function PeopleTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const people = usePeople(Boolean(session));
  const connect = useConnectWithPerson();

  // Undefined is still loading the session. A disabled query stays pending, so signed-out is checked first.
  if (session === undefined) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.list}>
        <Skeleton width="100%" height={112} radius={radius.card} />
      </View>
    );
  }
  if (session === null) {
    return (
      <InlineState
        title={t('people.signedOut.title')}
        text={t('people.signedOut.text')}
        action={
          <Button
            variant="outline"
            label={t('home.signIn')}
            onPress={() => {
              router.push({ pathname: '/sign-up', params: { next: '/explore' } });
            }}
          />
        }
      />
    );
  }
  if (people.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.list}>
        <Skeleton width="100%" height={112} radius={radius.card} />
      </View>
    );
  }
  if (people.isError) {
    const offline = errorCode(people.error) === 'network';
    return (
      <EmptyState
        title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
        text={offline ? t('errors.offlineText') : t('errors.serverText')}
        {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
        actions={<Button label={t('common.tryAgain')} onPress={() => void people.refetch()} />}
      />
    );
  }

  const act = (person: Person) => {
    connect.mutate({ userId: person.userId, key: newIdempotencyKey() });
  };

  return (
    <View style={styles.list}>
      <Button
        variant="outline"
        label={t('direct.requestsButton')}
        onPress={() => {
          router.push('/messages/requests');
        }}
      />
      <Text style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}>
        {t('people.lead')}
      </Text>
      {people.data.length === 0 ? (
        <InlineState title={t('people.empty.title')} text={t('people.empty.text')} />
      ) : (
        people.data.map((person) => (
          <View key={person.userId} style={styles.row}>
            <View style={styles.text}>
              <Text style={type(17, 'semibold', { tracking: -0.3 })}>{person.displayName}</Text>
              {person.city ? (
                <Text style={type(15, 'regular', { color: color.secondary })}>{person.city}</Text>
              ) : null}
              <Text style={type(15, 'regular', { color: color.secondary })}>
                {t('people.inCircles', { circles: person.circleNames.join(', ') })}
              </Text>
            </View>
            {person.connection === 'none' ? (
              <Button
                variant="outline"
                label={t('people.connect')}
                accessibilityLabel={t('people.connectWith', { name: person.displayName })}
                disabled={connect.isPending}
                onPress={() => {
                  act(person);
                }}
              />
            ) : person.connection === 'requested_by_them' ? (
              <Button
                label={t('people.connectBack')}
                accessibilityLabel={t('people.connectBackWith', { name: person.displayName })}
                disabled={connect.isPending}
                onPress={() => {
                  act(person);
                }}
              />
            ) : (
              <Text
                role="status"
                style={type(15, 'semibold', {
                  color: person.connection === 'connected' ? color.brand : color.secondary,
                })}
              >
                {person.connection === 'connected'
                  ? t('people.connected')
                  : t('people.requested')}
              </Text>
            )}
            <Button
              variant="outline"
              label={t('direct.messageButton')}
              accessibilityLabel={`${t('direct.messageButton')} ${person.displayName}`}
              onPress={() => {
                router.push({ pathname: '/chat/direct/[id]', params: { id: person.userId } });
              }}
            />
          </View>
        ))
      )}
      {connect.isError ? (
        <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
          {t('people.error')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  row: {
    gap: 12,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  text: { gap: 4 },
});
