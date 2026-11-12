import { BlurView } from 'expo-blur';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarIcon, ChatIcon, CompassIcon, HomeIcon, UserIcon } from './icons';
import { color, extra, radius, shadow, size, type } from './theme';
import { useScreenInsets } from './useScreenInsets';

interface Tab {
  href: Href;
  /** Key under `tabs.` in the copy catalogue. */
  key: 'home' | 'explore' | 'myPlans' | 'inbox' | 'profile';
  Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

const TABS: Tab[] = [
  { href: '/home', key: 'home', Icon: HomeIcon },
  { href: '/explore', key: 'explore', Icon: CompassIcon },
  { href: '/my-plans', key: 'myPlans', Icon: CalendarIcon },
  { href: '/inbox', key: 'inbox', Icon: ChatIcon },
  { href: '/profile', key: 'profile', Icon: UserIcon },
];

/** Floating glass pill; the active tab gets a black pill behind its icon only. */
export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { tabBarBottom } = useScreenInsets();
  const { t } = useTranslation();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('tabs.label')}
      style={[styles.bar, { bottom: tabBarBottom }]}
    >
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      {TABS.map(({ href, key, Icon }) => {
        const active = pathname === href;
        const label = t(`tabs.${key}`);
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            aria-selected={active}
            onPress={() => {
              if (!active) router.navigate(href);
            }}
            style={styles.tab}
          >
            <View style={[styles.icon, active && styles.iconActive]}>
              <Icon
                size={22}
                strokeWidth={active ? 2.2 : 1.8}
                color={active ? color.surface : color.secondary}
              />
            </View>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={type(11, active ? 'semibold' : 'medium', {
                color: active ? color.ink : color.secondary,
              })}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: size.tabBarHeight,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: extra.tabBar,
    boxShadow: shadow.nav,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 54 },
  icon: {
    width: 52,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: { backgroundColor: color.ink },
});
