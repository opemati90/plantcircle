import type { ReactNode } from 'react';
import styles from './ui.module.css';

interface BannerProps {
  title: string;
  detail?: string;
  icon?: ReactNode;
  /** Errors interrupt (`alert`); confirmations wait their turn (`status`). */
  tone: 'alert' | 'status';
  action?: { label: string; onClick: () => void };
}

export function Banner({ title, detail, icon, tone, action }: BannerProps) {
  return (
    <div role={tone} className={styles.banner}>
      {icon}
      <span className={styles.bannerText}>
        <span className={styles.bannerTitle}>{title}</span>
        {detail && <span className={styles.bannerDetail}>{detail}</span>}
      </span>
      {action && (
        <button type="button" className={styles.bannerAction} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
