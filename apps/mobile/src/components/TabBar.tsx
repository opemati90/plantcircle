import { BlurView } from 'expo-blur';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarIcon, ChatIcon, CompassIcon, HomeIcon, UserIcon } from './icons';
import { color, extra, radius, shadow, size, type } from './theme';
import { useScreenInsets } from './useScreenInsets';

interface Tab {
  href: Href;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

const TABS: Tab[] = [
  { href: '/home', label: 'Home', Icon: HomeIcon },
  { href: '/explore', label: 'Explore', Icon: CompassIcon },
  { href: '/my-plans', label: 'My Plans', Icon: CalendarIcon },
  { href: '/inbox', label: 'Inbox', Icon: ChatIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
];

/** Floating glass pill; the active tab gets a black pill behind its icon only. */
export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { tabBarBottom } = useScreenInsets();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Main"
      style={[styles.bar, { bottom: tabBarBottom }]}
    >
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={label}
            aria-selected={active}
            onPress={() => {
              if (!active) router.replace(href);
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
