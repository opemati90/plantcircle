import type { ReactNode } from 'react';
import { AlertIcon } from '../icons';
import styles from './ui.module.css';

interface ScreenMessageProps {
  title: string;
  text: string;
  icon?: ReactNode;
  /** Rendered in the floating bottom bar. */
  actions?: ReactNode;
  /** Set when the tab bar is shown, so the actions sit in the page instead. */
  inline?: boolean;
}

/** Full-screen state: errors, missing content, areas that are not built yet. */
export function ScreenMessage({ title, text, icon, actions, inline }: ScreenMessageProps) {
  return (
    <main className={styles.message}>
      <div className={styles.messageBody}>
        <span aria-hidden="true" className={styles.messageIcon}>
          {icon ?? <AlertIcon size={36} strokeWidth={1.7} />}
        </span>
        <h1 className={styles.messageTitle}>{title}</h1>
        <p className={styles.messageText}>{text}</p>
      </div>
      {actions && inline && <div className={styles.messageBody}>{actions}</div>}
      {actions && !inline && (
        <>
          <div aria-hidden="true" className={styles.barFade} />
          <div className={`${styles.bar} ${styles.barStack}`}>{actions}</div>
        </>
      )}
    </main>
  );
}
