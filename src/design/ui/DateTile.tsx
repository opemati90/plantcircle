import { dayOfMonth, monthShort } from '../../lib/dates';
import styles from './ui.module.css';

/** Decorative calendar tile; the date is always also present as text nearby. */
export function DateTile({ iso, timeZone }: { iso: string; timeZone: string }) {
  return (
    <span aria-hidden="true" className={styles.dateTile}>
      <span className={styles.dateTileMonth}>{monthShort(iso, timeZone)}</span>
      <span className={styles.dateTileDay}>{dayOfMonth(iso, timeZone)}</span>
    </span>
  );
}
