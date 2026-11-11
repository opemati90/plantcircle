import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { errorCode } from '../../data/backend';
import type { PlanDetail } from '../../data/types';
import { CheckIcon, ChevronLeftIcon, OfflineIcon, ShareIcon } from '../../design/icons';
import { Banner } from '../../design/ui/Banner';
import { ScreenMessage } from '../../design/ui/ScreenMessage';
import { Sheet } from '../../design/ui/Sheet';
import ui from '../../design/ui/ui.module.css';
import { weekdayLong } from '../../lib/dates';
import { ProviderButtons } from '../auth/ProviderButtons';
import { useAuth } from '../auth/useAuth';
import styles from './plan.module.css';
import {
  allergenNote,
  bringItemNote,
  categoryLabel,
  isFull,
  priceLabel,
  rsvpErrorCopy,
  spotsLeftShort,
} from './planCopy';
import { PlanFacts } from './PlanFacts';
import { usePlan, useRsvpMutations } from './queries';

type SheetKind = 'signUp' | 'cancel' | null;

async function sharePlan(title: string): Promise<'shared' | 'copied'> {
  const url = window.location.origin + window.location.pathname;
  if (typeof navigator.share === 'function') {
    await navigator.share({ title, url });
    return 'shared';
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}

function PlanView({ detail }: { detail: PlanDetail }) {
  const { plan, isGoing, bringItems } = detail;
  const { session } = useAuth();
  const { join, cancel, claim } = useRsvpMutations(plan.id);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const joinPath = `/plans/${plan.id}?join=1`;
  const full = isFull(plan) && !isGoing;
  const wantsJoin = params.get('join') === '1';

  // Returning from sign-up with ?join=1: finish the join the member asked for.
  useEffect(() => {
    if (!wantsJoin || !session) return;
    setParams({}, { replace: true });
    if (!isGoing) join.mutate();
    // `join` is a new object every render; the mutation itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsJoin, session, isGoing]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);

  const startJoin = () => {
    if (!session) {
      setSheet('signUp');
      return;
    }
    join.mutate();
  };

  const failed = join.isError ? join : cancel.isError ? cancel : claim.isError ? claim : null;
  const failure = failed ? errorCode(failed.error) : null;
  const failureCopy =
    failed === claim && failure === 'item_taken'
      ? { title: 'Someone is already bringing this', detail: 'Pick something else' }
      : failed === join && failure
        ? rsvpErrorCopy(failure)
        : failed
          ? { title: 'Couldn’t save that', detail: 'Nothing was changed' }
          : null;
  const retry = () => {
    if (failed === join) join.mutate();
    else if (failed === cancel) cancel.mutate();
    else if (failed === claim && claim.variables) claim.mutate(claim.variables);
  };

  const busy = join.isPending || cancel.isPending;
  const barNote = join.isError
    ? failure === 'network'
      ? 'Check your connection'
      : 'Not saved'
    : isGoing
      ? `See you ${weekdayLong(plan.startsAt, plan.timezone)}`
      : full
        ? 'No spots left'
        : spotsLeftShort(plan);

  return (
    <main>
      <div className={styles.hero}>
        {plan.imagePath && (
          <img
            src={plan.imagePath}
            alt={plan.imageAlt ?? ''}
            className={styles.heroImage}
            style={{ objectPosition: plan.imageFocus ?? 'center' }}
          />
        )}
        <span className={styles.heroScrim} />
        <Link to="/home" aria-label="Back" className={`${ui.glassButton} ${styles.heroBack}`}>
          <ChevronLeftIcon strokeWidth={2.2} />
        </Link>
        <button
          type="button"
          aria-label="Share"
          className={`${ui.glassButton} ${styles.heroShare}`}
          onClick={() => {
            sharePlan(plan.title).then(
              (result) => {
                if (result === 'copied') setNotice('Link copied');
              },
              (error: unknown) => {
                // Dismissing the share sheet is not a failure.
                if (error instanceof DOMException && error.name === 'AbortError') return;
                setNotice('Couldn’t share this Plan');
              },
            );
          }}
        >
          <ShareIcon strokeWidth={2.2} />
        </button>
        <div className={styles.heroText}>
          <span className={styles.heroLabel}>
            {categoryLabel(plan.category)}
            {full ? ' · Full' : ''}
          </span>
          <h1 className={styles.heroTitle}>{plan.title}</h1>
          <span className={styles.heroVenue}>{plan.venueName ?? plan.areaName}</span>
        </div>
      </div>

      {failureCopy && (
        <Banner
          tone="alert"
          title={failureCopy.title}
          detail={failureCopy.detail}
          icon={<OfflineIcon size={20} />}
          {...(failure === 'network' || failure === 'unknown'
            ? { action: { label: 'Retry', onClick: retry } }
            : {})}
        />
      )}
      {!failureCopy && notice && <Banner tone="status" title={notice} />}

      <div className={styles.body}>
        <PlanFacts detail={detail} />

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>About</h2>
          <p className={styles.about}>{plan.description}</p>
        </section>

        {bringItems.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Bring something</h2>
            <ul className={styles.bringList}>
              {bringItems.map((item) => {
                const open = item.claimedCount < item.quantity && !item.claimedByMe;
                return (
                  <li key={item.id} className={styles.bringItem}>
                    <span className={styles.bringText}>
                      <span className={styles.bringLabel}>{item.label}</span>
                      <span className={styles.bringNote}>
                        {item.claimedByMe ? 'You’re bringing this' : bringItemNote(item)}
                      </span>
                    </span>
                    {open ? (
                      <button
                        type="button"
                        className={styles.bringButton}
                        disabled={claim.isPending || busy}
                        onClick={() => {
                          if (isGoing) claim.mutate(item.id);
                          else if (session) setNotice('Join this Plan first');
                          else setSheet('signUp');
                        }}
                      >
                        I’ll bring it<span className="visually-hidden">: {item.label}</span>
                      </button>
                    ) : (
                      <CheckIcon
                        size={22}
                        strokeWidth={2.6}
                        color="var(--color-accent)"
                        label="Claimed"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Good to know</h2>
          <div className={styles.notes}>
            <p>
              <b>Allergens:</b> {allergenNote(plan)}
            </p>
            <p>
              <b>Can’t make it?</b> Cancel any time so someone else can take your spot.
            </p>
          </div>
        </section>
      </div>

      <div aria-hidden="true" className={ui.barFade} />
      <div className={`${ui.bar} ${styles.bar}`}>
        <span className={styles.barText}>
          <span className={styles.barPrice}>{priceLabel(plan)}</span>
          <span className={styles.barNote} aria-live="polite">
            {barNote}
          </span>
        </span>
        {isGoing ? (
          <button
            type="button"
            className={`${styles.cta} ${styles.ctaGoing}`}
            aria-haspopup="dialog"
            onClick={() => {
              setSheet('cancel');
            }}
          >
            {cancel.isPending ? 'Cancelling…' : 'You’re going'}
          </button>
        ) : (
          <button
            type="button"
            className={styles.cta}
            disabled={full || busy}
            onClick={startJoin}
          >
            {full ? 'Full' : join.isPending ? 'Joining…' : join.isError ? 'Try again' : 'Join'}
          </button>
        )}
      </div>

      <Sheet
        open={sheet === 'signUp'}
        onClose={() => {
          setSheet(null);
        }}
        title="Save your spot"
        lead={`Create an account so ${plan.hostName.split(' ')[0] ?? 'the host'} knows you’re coming and you get the address.`}
      >
        <ProviderButtons next={joinPath} inSheet />
        <Link to={`/signup?next=${encodeURIComponent(joinPath)}`} className={styles.sheetLink}>
          Use email instead
        </Link>
        <p className={ui.legal}>
          You confirm you’re 18+ and accept the Terms and Community Rules.
        </p>
      </Sheet>

      <Sheet
        open={sheet === 'cancel'}
        onClose={() => {
          setSheet(null);
        }}
        title="Cancel your spot?"
        lead="Your spot goes back to the group, and anything you said you’d bring is released."
      >
        <button
          type="button"
          className={ui.primary}
          onClick={() => {
            setSheet(null);
            cancel.mutate();
          }}
        >
          Cancel my spot
        </button>
        <button
          type="button"
          className={ui.textButton}
          onClick={() => {
            setSheet(null);
          }}
        >
          Keep my spot
        </button>
      </Sheet>
    </main>
  );
}

export function PlanScreen() {
  const { planId = '' } = useParams();
  const plan = usePlan(planId);

  if (plan.isPending) {
    return (
      <main aria-busy="true" aria-label="Loading">
        <span className={ui.skeleton} style={{ height: 420 }} />
        <div className={styles.loading}>
          {[0, 1, 2, 3].map((row) => (
            <span key={row} className={ui.skeleton} style={{ height: 56, borderRadius: 16 }} />
          ))}
        </div>
      </main>
    );
  }

  if (plan.isError) {
    const code = errorCode(plan.error);
    const missing = code === 'not_found';
    return (
      <ScreenMessage
        title={
          missing
            ? 'This Plan isn’t available'
            : code === 'network'
              ? 'Can’t reach PlantCircle'
              : 'Something went wrong on our side'
        }
        text={
          missing
            ? 'It may have been cancelled, or the link is wrong.'
            : code === 'network'
              ? 'Check your connection and try again.'
              : 'It’s not you. Try again in a moment.'
        }
        actions={
          <>
            {!missing && (
              <button type="button" className={ui.primary} onClick={() => void plan.refetch()}>
                Try again
              </button>
            )}
            <Link to="/home" className={missing ? ui.primary : ui.textButton}>
              Back to Home
            </Link>
          </>
        }
      />
    );
  }

  return <PlanView detail={plan.data} />;
}
