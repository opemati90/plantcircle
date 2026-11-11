import type { ComponentType } from 'react';
import { NavLink } from 'react-router';
import { CalendarIcon, ChatIcon, CompassIcon, HomeIcon, UserIcon } from '../icons';
import styles from './ui.module.css';

interface Tab {
  to: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const TABS: Tab[] = [
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/explore', label: 'Explore', Icon: CompassIcon },
  { to: '/my-plans', label: 'My Plans', Icon: CalendarIcon },
  { to: '/inbox', label: 'Inbox', Icon: ChatIcon },
  { to: '/profile', label: 'Profile', Icon: UserIcon },
];

export function TabBar() {
  return (
    <nav aria-label="Main" className={styles.tabBar}>
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
        >
          {({ isActive }) => (
            <>
              <span className={styles.tabIcon}>
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              </span>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
