import type { PlanDetail } from '../../data/types';
import { MapTile, VerifiedIcon } from '../../design/icons';
import { DateTile } from '../../design/ui/DateTile';
import ui from '../../design/ui/ui.module.css';
import { longDate, timeRange } from '../../lib/dates';
import { downloadIcs } from './calendar';
import styles from './plan.module.css';
import { addressNote, goingLabel, spotsLabel } from './planCopy';

const TINTS = [ui.tintSand, ui.tintSky, ui.tintSage];

/** The four fact rows under the hero: when, where, who is going, who hosts. */
export function PlanFacts({ detail }: { detail: PlanDetail }) {
  const { plan, isGoing, address } = detail;
  const taken = Math.min(plan.goingCount, plan.capacity);

  return (
    <div className={styles.facts}>
      <div className={styles.fact}>
        <DateTile iso={plan.startsAt} timeZone={plan.timezone} />
        <span className={styles.factText}>
          <span className={styles.factTitle}>{longDate(plan.startsAt, plan.timezone)}</span>
          <span className={styles.factNote}>
            {timeRange(plan.startsAt, plan.endsAt, plan.timezone)}
          </span>
          <button
            type="button"
            className={styles.calendarLink}
            onClick={() => {
              downloadIcs(plan, address);
            }}
          >
            Add to calendar
          </button>
        </span>
      </div>

      <div className={styles.fact}>
        <MapTile />
        <span className={styles.factText}>
          <span className={styles.factTitle}>{plan.areaName}</span>
          <span className={styles.factNote}>{addressNote(plan, isGoing, address)}</span>
        </span>
      </div>

      <div className={styles.fact}>
        <span aria-hidden="true" className={styles.cluster}>
          {plan.attendeeInitials.slice(0, 3).map((initial, index) => (
            <span key={index} className={`${styles.clusterFace} ${TINTS[index]}`}>
              {initial}
            </span>
          ))}
        </span>
        <span className={styles.factText}>
          <span className={styles.factTitle}>{goingLabel(plan, isGoing)}</span>
          <span className={styles.factNote}>{spotsLabel(plan)}</span>
          <span
            role="img"
            aria-label={`${taken} of ${plan.capacity} spots taken`}
            className={styles.meter}
          >
            <span style={{ width: `${(taken / plan.capacity) * 100}%` }} />
          </span>
        </span>
      </div>

      <div className={styles.fact}>
        <span aria-hidden="true" className={`${styles.hostAvatar} ${ui.tintSage}`}>
          {plan.hostName.charAt(0).toUpperCase()}
        </span>
        <span className={styles.factText}>
          <span className={styles.factTitle}>
            {plan.hostName}
            {plan.hostVerified && <VerifiedIcon />}
          </span>
          <span className={styles.factNote}>
            Your host · {plan.hostPlansCount} {plan.hostPlansCount === 1 ? 'Plan' : 'Plans'}{' '}
            hosted
          </span>
        </span>
      </div>
    </div>
  );
}
