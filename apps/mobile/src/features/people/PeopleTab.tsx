import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { AlertIcon, ChatIcon, ChevronRightIcon, OfflineIcon } from '../../components/icons';
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
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          router.push('/messages/requests');
        }}
        style={styles.requests}
      >
        <Text style={[type(16, 'semibold'), styles.grow]}>{t('direct.requestsButton')}</Text>
        <ChevronRightIcon size={16} strokeWidth={2.4} color={color.secondary} />
      </Pressable>
      {people.data.length === 0 ? (
        <InlineState title={t('people.empty.title')} text={t('people.empty.text')} />
      ) : (
        people.data.map((person) => (
          <View key={person.userId} style={styles.row}>
            <View aria-hidden style={[styles.avatar, { backgroundColor: extra.tints[1].background }]}>
              <Text allowFontScaling={false} style={type(17, 'bold', { color: extra.tints[1].text })}>
                {person.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.text}>
              <Text style={type(16, 'semibold', { tracking: -0.3 })}>{person.displayName}</Text>
              <Text numberOfLines={1} style={type(14, 'regular', { color: color.secondary })}>
                {[person.circleNames[0], person.city].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('safety.reportName', { name: person.displayName })}
              onPress={() => {
                router.push({ pathname: '/report', params: { type: 'person', id: person.userId, name: person.displayName, userId: person.userId } });
              }}
              style={styles.iconAction}
            >
              <AlertIcon size={18} strokeWidth={1.9} color={color.secondary} />
            </Pressable>
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
            ) : person.connection === 'connected' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('direct.messageButton')} ${person.displayName}`}
                onPress={() => {
                  router.push({ pathname: '/chat/direct/[id]', params: { id: person.userId } });
                }}
                style={styles.iconAction}
              >
                <ChatIcon size={20} strokeWidth={1.9} color={color.ink} />
              </Pressable>
            ) : (
              <Text role="status" style={type(14, 'semibold', { color: color.secondary })}>
                {t('people.requested')}
              </Text>
            )}
          </View>
        ))
      )}
      <Text style={type(14, 'regular', { color: color.secondary, leading: 1.5 })}>
        {t('people.lead')}
      </Text>
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
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    backgroundColor: color.fill,
  },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  iconAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
