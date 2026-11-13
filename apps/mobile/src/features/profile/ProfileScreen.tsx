import { useMutation } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { AlertIcon, BellIcon, ChevronRightIcon, SproutIcon, UserIcon } from '../../components/icons';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';
import { hasNotice, isPaused } from '../safety/standing';
import { usePeople } from '../people/queries';
import { useCities, useMyCircles, useMyPlans } from '../plans/queries';

type Row = { label: string; href: Href; icon?: 'bell' | 'lock' | 'user' | 'sprout' | 'alert' };

/**
 * The member's own page, laid out as the design has it: title and Edit, the identity card with
 * stats, the impact banner, then Settings, Hosting and About groups. Rows whose screens are not
 * built yet lead to a page that says so (never a dead tap).
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const backend = useBackend();
  const { profile, session } = useAuth();
  const cities = useCities();
  const upcoming = useMyPlans('upcoming', Boolean(session));
  const past = useMyPlans('past', Boolean(session));
  const circles = useMyCircles();
  const people = usePeople(Boolean(session));
  const logout = useMutation({ mutationFn: () => backend.signOut() });

  const name = profile?.displayName ?? t('tabs.profile');
  const city = cities.data?.find((c) => c.id === profile?.cityId)?.name ?? null;
  const planCount = (upcoming.data?.length ?? 0) + (past.data?.length ?? 0);
  const circleCount = circles.data?.length ?? 0;
  const connectionCount = people.data?.filter((p) => p.connection === 'connected').length ?? 0;
  const mealsCooked = past.data?.length ?? 0;

  const later = (section: string): Href => ({ pathname: '/profile/later', params: { section } });
  const settings: Row[] = [
    ...(hasNotice(profile) ? [{ label: isPaused(profile) ? t('safety.pausedBanner') : t('safety.frozenBanner'), href: '/suspended' as Href, icon: 'alert' as const }] : []),
    { label: t('profile.notifications'), href: '/profile/notifications', icon: 'bell' },
    { label: t('profile.privacy'), href: '/profile/privacy', icon: 'lock' },
    { label: t('profile.accessibility'), href: '/profile/accessibility', icon: 'user' },
  ];
  const hosting: Row[] = [{ label: t('profile.hostLevel'), href: later('hostLevel'), icon: 'sprout' }];
  const about: Row[] = [
    { label: t('profile.terms'), href: '/legal/terms' },
    { label: t('profile.accountData'), href: '/profile/account' },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: 120 + insets.bottom }]}
    >
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={type(34, 'bold', { tracking: -1.1 })}>
          {t('profile.title')}
        </Text>
        <Button variant="inverse" label={t('profile.edit')} onPress={() => { router.push(later('edit')); }} />
      </View>

      <View style={styles.card}>
        <View style={styles.identity}>
          <View aria-hidden style={[styles.avatar, { backgroundColor: extra.tints[0].background }]}>
            <Text allowFontScaling={false} style={type(26, 'bold', { color: extra.tints[0].text })}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text style={type(21, 'bold', { tracking: -0.5 })}>{name}</Text>
            {city ? <Text style={type(15, 'regular', { color: color.secondary })}>{city}</Text> : null}
          </View>
        </View>
        <View style={styles.stats}>
          <Stat value={planCount} label={t('profile.statsPlans')} />
          <Stat value={circleCount} label={t('profile.statsCircles')} />
          <Stat value={connectionCount} label={t('profile.statsConnections')} />
        </View>
      </View>

      <View style={styles.impact} accessibilityRole="summary">
        <SproutIcon size={24} strokeWidth={1.8} color="#FFFFFF" />
        <View style={styles.impactText}>
          <Text style={type(16, 'semibold', { color: '#FFFFFF' })}>{t('profile.impactTitle')}</Text>
          <Text style={type(14, 'regular', { color: '#FFFFFF' })}>
            {t('profile.impactText', { count: mealsCooked })}
          </Text>
        </View>
      </View>

      <Group title={t('profile.settings')} rows={settings} onOpen={(href) => { router.push(href); }} />
      <Group
        title={t('profile.hosting')}
        rows={hosting}
        trailing={t('profile.hostLevelValue')}
        onOpen={(href) => { router.push(href); }}
      />
      <Group title={t('profile.about')} rows={about} onOpen={(href) => { router.push(href); }} />

      {session ? (
        <View style={styles.signOut}>
          <Button
            variant="outline"
            label={t('auth.signOut')}
            loading={logout.isPending}
            onPress={() => {
              logout.mutate(undefined, {
                onSuccess: () => {
                  router.replace('/home');
                },
              });
            }}
          />
          {logout.isError ? (
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('auth.signOutFailed')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type(20, 'bold', { tracking: -0.5 })}>{value}</Text>
      <Text style={type(13, 'regular', { color: color.secondary })}>{label}</Text>
    </View>
  );
}

function RowIcon({ icon }: { icon: Row['icon'] }) {
  const props = { size: 19, strokeWidth: 1.9, color: color.ink };
  if (icon === 'bell') return <BellIcon {...props} />;
  if (icon === 'alert') return <AlertIcon {...props} />;
  if (icon === 'user') return <UserIcon {...props} />;
  if (icon === 'sprout') return <SproutIcon {...props} />;
  if (icon === 'lock') return <UserIcon {...props} />;
  return null;
}

function Group({
  title,
  rows,
  trailing,
  onOpen,
}: {
  title: string;
  rows: Row[];
  trailing?: string;
  onOpen: (href: Href) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={[type(14, 'semibold', { color: color.secondary }), styles.groupTitle]}>{title}</Text>
      <View style={styles.groupCard}>
        {rows.map((row, index) => (
          <Pressable
            key={row.label}
            accessibilityRole="link"
            onPress={() => {
              onOpen(row.href);
            }}
            style={[styles.row, index < rows.length - 1 && styles.rowDivider]}
          >
            {row.icon ? (
              <View aria-hidden style={styles.rowIcon}>
                <RowIcon icon={row.icon} />
              </View>
            ) : null}
            <Text style={[type(16, 'regular'), styles.rowLabel]}>{row.label}</Text>
            {trailing ? (
              <Text style={type(15, 'regular', { color: color.secondary })}>{trailing}</Text>
            ) : null}
            <ChevronRightIcon size={16} strokeWidth={2.4} color={color.secondary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.fill },
  content: { paddingHorizontal: 20, gap: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  card: { backgroundColor: color.surface, borderRadius: 24, padding: 20, gap: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  identityText: { gap: 3, flex: 1 },
  stats: { flexDirection: 'row', paddingTop: 16, borderTopWidth: 1, borderTopColor: extra.cardBorder },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  impact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: color.brand,
  },
  impactText: { flex: 1, gap: 2 },
  group: { gap: 8 },
  groupTitle: { paddingLeft: 4 },
  groupCard: { backgroundColor: color.surface, borderRadius: radius.card, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: extra.cardBorder },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, minHeight: size.touchMin, textAlignVertical: 'center', lineHeight: size.touchMin },
  signOut: { gap: 12, paddingTop: 8 },
});
