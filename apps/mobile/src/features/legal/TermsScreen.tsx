import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import type { PolicyName } from '../../lib/backend/types';
import { longDate } from '../../lib/dates';
import { useAuth, useSignOut } from '../auth/useAuth';
import { useAcceptPolicies, usePendingPolicies } from './queries';

const URLS: Record<PolicyName, string> = {
  terms: 'https://plantcircle.app/legal/terms',
  community_rules: 'https://plantcircle.app/legal/rules',
  privacy: 'https://plantcircle.app/legal/privacy',
};

/**
 * Terms and community rules. With a new version pending, as the TermsUpdate design has it: what
 * changed, when it takes effect, "Accept and continue", and the way out ("I don't agree"). With
 * nothing pending: the documents, with when they were accepted.
 */
export default function TermsScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session, profileError, retryProfile } = useAuth();
  const pending = usePendingPolicies();
  const accept = useAcceptPolicies();
  const logout = useSignOut();
  const [linkFailed, setLinkFailed] = useState<string | null>(null);
  const blocking = pending.data?.some((p) => p.blocking) ?? false;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };
  const open = (url: string) => {
    Linking.openURL(url).then(() => { setLinkFailed(null); }).catch(() => { setLinkFailed(url); });
  };
  const header = blocking ? null : <ScreenHeader backLabel={t('common.back')} onBack={back} />;

  if (session === null) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel={t('common.back')} onBack={back} />
        <InlineState title={t('people.signedOut.title')} text={t('legal.signedOut')} action={<Button variant="outline" label={t('home.signIn')} onPress={() => { router.push({ pathname: '/sign-up', params: { next: '/legal/terms' } }); }} />} />
      </View>
    );
  }
  // Sign-out stays reachable in every failed state: the gate keeps Profile closed meanwhile.
  const signOutButton = <Button variant="ghost" label={t('auth.signOut')} loading={logout.isPending} onPress={() => { logout.mutate(undefined, { onSuccess: () => { router.replace('/welcome'); } }); }} />;
  if (profileError) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState title={t('errors.serverTitle')} text={t('errors.serverText')} actions={<View style={styles.buttons}><Button label={t('common.retry')} onPress={retryProfile} />{signOutButton}</View>} />
      </View>
    );
  }
  if (pending.isPending || session === undefined) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        {header}
        <View style={styles.content}><Skeleton width="100%" height={160} radius={radius.card} /></View>
      </View>
    );
  }
  if (pending.isError) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState title={t('errors.serverTitle')} text={t('errors.serverText')} actions={<View style={styles.buttons}><Button label={t('common.retry')} onPress={() => void pending.refetch()} />{signOutButton}</View>} />
      </View>
    );
  }

  const updates = pending.data;
  const changeCount = updates.reduce((n, p) => n + Math.max(1, p.summary.length), 0);
  const items = (p: (typeof updates)[number]) =>
    p.summary.length > 0 ? p.summary : [{ title: t(`legal.policy.${p.policy}`), note: t('legal.newVersion', { version: p.version }) }];

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: blocking ? insets.headerTop + 24 : 8, paddingBottom: 40 + insets.bottom }]}>
        {updates.length > 0 ? (
          <>
            <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
              {t('legal.updateTitle')}
            </Text>
            <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>
              {updates.length === 1 && updates[0]
                ? t('legal.updateLead', { count: changeCount, date: longDate(updates[0].effectiveAt, 'UTC') })
                : t('legal.updateLeadMulti', { count: changeCount })}
            </Text>
            {updates.map((p) => (
              <View key={p.policy} style={styles.policy}>
                {updates.length > 1 ? (
                  <Text accessibilityRole="header" style={type(13, 'semibold', { color: color.secondary, tracking: 0.5 })}>
                    {t('legal.effectiveLine', { name: t(`legal.policy.${p.policy}`), date: longDate(p.effectiveAt, 'UTC') }).toUpperCase()}
                  </Text>
                ) : null}
                <View style={styles.card}>
                  {items(p).map((item, index) => (
                    <View key={`${p.policy}-${index}`} style={[styles.row, index > 0 && styles.rowBorder]}>
                      <Text style={type(16, 'semibold')}>{item.title}</Text>
                      <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>{item.note}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {updates.map((p) => (
              <Pressable key={p.policy} accessibilityRole="link" onPress={() => { open(p.url ?? URLS[p.policy]); }} style={styles.link}>
                <Text style={type(15, 'semibold', { color: color.brand })}>{t('legal.readFull', { name: t(`legal.policy.${p.policy}`) })}</Text>
              </Pressable>
            ))}
            {accept.isError ? (
              <Text role="alert" style={type(15, 'regular', { color: color.danger })}>{t('legal.error')}</Text>
            ) : null}
            <View style={styles.buttons}>
              <Button
                label={t('legal.accept')}
                loading={accept.isPending}
                onPress={() => {
                  accept.mutate(
                    updates.map((p) => ({ policy: p.policy, version: p.version })),
                    {
                      onSuccess: () => {
                        if (blocking) router.replace('/home');
                      },
                    },
                  );
                }}
              />
              <Button
                variant="outline"
                label={t('legal.disagree')}
                disabled={accept.isPending}
                onPress={() => {
                  router.push('/profile/account');
                }}
              />
              {blocking ? (
                <Button variant="ghost" label={t('auth.signOut')} loading={logout.isPending} onPress={() => { logout.mutate(undefined, { onSuccess: () => { router.replace('/welcome'); } }); }} />
              ) : null}
              {logout.isError ? (
                <Text role="alert" style={type(14, 'regular', { color: color.danger })}>{t('auth.signOutFailed')}</Text>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
              {t('profile.terms')}
            </Text>
            <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>{t('legal.currentLead')}</Text>
            <View style={styles.card}>
              {(Object.keys(URLS) as PolicyName[]).map((policy, index) => (
                <Pressable key={policy} accessibilityRole="link" onPress={() => { open(URLS[policy]); }} style={[styles.docRow, index > 0 && styles.rowBorder]}>
                  <Text style={[type(17, 'semibold'), styles.grow]}>{t(`legal.policy.${policy}`)}</Text>
                  <Text style={type(14, 'regular', { color: color.secondary })}>{t('legal.open')}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {linkFailed ? (
          <Text role="alert" style={type(14, 'regular', { color: color.danger })}>{t('account.linkError', { url: linkFailed })}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, gap: 14 },
  policy: { gap: 8 },
  card: { borderRadius: radius.card, borderWidth: 1, borderColor: extra.cardBorder, paddingHorizontal: 16, marginTop: 6 },
  row: { paddingVertical: 12, gap: 3 },
  rowBorder: { borderTopWidth: 1, borderTopColor: extra.cardBorder },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  grow: { flex: 1, minWidth: 0 },
  link: { minHeight: size.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  buttons: { gap: 10, paddingTop: 8 },
});
