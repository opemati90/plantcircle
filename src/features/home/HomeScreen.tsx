import { useState } from 'react';
import { Link } from 'react-router';
import { errorCode } from '../../data/backend';
import type { Plan, UpNext } from '../../data/types';
import { BellIcon, ChevronRightIcon, OfflineIcon, PinIcon, PlusIcon } from '../../design/icons';
import { DateTile } from '../../design/ui/DateTile';
import { ScreenMessage } from '../../design/ui/ScreenMessage';
import { TabBar } from '../../design/ui/TabBar';
import ui from '../../design/ui/ui.module.css';
import {
  dayOfMonth,
  greeting,
  shortWhen,
  time,
  weekdayLong,
  weekdayShort,
} from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { LAUNCH_CITY } from '../onboarding/onboardingStore';
import { categoryLabel, priceLabel, spotsLeftShort } from '../plans/planCopy';
import { usePlansThisWeek, useUpNext } from '../plans/queries';
import styles from './home.module.css';
import { filterPlans, HOME_FILTERS, type HomeFilter } from './homeFilters';
import { HomeSkeleton } from './HomeSkeleton';

const FACE_TINTS = [ui.tintSand, ui.tintSky, ui.tintSage];

function UpNextCard({ plan, needsDish }: UpNext) {
  const when = `${weekdayLong(plan.startsAt, plan.timezone)} ${time(plan.startsAt, plan.timezone)}`;
  return (
    <Link to={`/plans/${plan.id}`} className={styles.upNext}>
      <DateTile iso={plan.startsAt} timeZone={plan.timezone} />
      <span className={styles.upNextText}>
        <span className={styles.upNextLabel}>Up next · {when}</span>
        <span className={styles.upNextTitle}>{plan.title}</span>
        <span className={`${styles.upNextNote} ${needsDish ? styles.upNextAttention : ''}`}>
          {needsDish ? 'Choose a dish to bring' : plan.areaName}
        </span>
      </span>
      <ChevronRightIcon size={16} strokeWidth={2.4} color="var(--color-outline)" />
    </Link>
  );
}

function FeaturedCard({ plan }: { plan: Plan }) {
  const tz = plan.timezone;
  return (
    <Link to={`/plans/${plan.id}`} className={styles.featured}>
      {plan.imagePath && (
        <img
          src={plan.imagePath}
          alt={plan.imageAlt ?? ''}
          className={styles.featuredImage}
          style={{ objectPosition: plan.imageFocus ?? 'center' }}
        />
      )}
      <span className={styles.featuredScrim} />
      <span className={styles.featuredDate} aria-hidden="true">
        <span className={styles.featuredWeekday}>{weekdayShort(plan.startsAt, tz)}</span>
        <span className={styles.featuredDay}>{dayOfMonth(plan.startsAt, tz)}</span>
      </span>
      <span className={styles.featuredBody}>
        <span className={styles.featuredLabel}>
          {categoryLabel(plan.category)} · {priceLabel(plan)}
        </span>
        <span className={styles.featuredTitle}>{plan.title}</span>
        <span className={styles.featuredMeta}>
          <span className="visually-hidden">{weekdayLong(plan.startsAt, tz)} </span>
          {time(plan.startsAt, tz)} · {plan.areaName} · hosted by {plan.hostName}
        </span>
        <span className={styles.featuredFooter}>
          <span className={styles.going}>
            {plan.goingCount > 0 && (
              <span className={styles.faces} aria-hidden="true">
                {plan.attendeeInitials.map((_, index) => (
                  <span key={index} className={`${styles.face} ${FACE_TINTS[index % 3]}`} />
                ))}
              </span>
            )}
            <span>{plan.goingCount} going</span>
          </span>
          <span className={styles.spotsPill}>{spotsLeftShort(plan)}</span>
        </span>
      </span>
    </Link>
  );
}

function PlanRailCard({ plan }: { plan: Plan }) {
  return (
    <li>
      <Link to={`/plans/${plan.id}`} className={styles.card}>
        <span className={styles.cardImage}>
          {plan.imagePath && (
            <img src={plan.imagePath} alt={plan.imageAlt ?? ''} loading="lazy" />
          )}
          <span className={styles.cardBadge}>{shortWhen(plan.startsAt, plan.timezone)}</span>
        </span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>{plan.title}</span>
          <span className={styles.cardMeta}>
            {plan.areaName} · {plan.goingCount} going
          </span>
        </span>
      </Link>
    </li>
  );
}

export function HomeScreen() {
  const { session, profile } = useAuth();
  const city = profile?.city ?? LAUNCH_CITY.name;
  const plans = usePlansThisWeek(city);
  const upNext = useUpNext();
  const [filter, setFilter] = useState<HomeFilter>('For you');

  if (plans.isPending) {
    return (
      <>
        <HomeSkeleton />
        <TabBar />
      </>
    );
  }

  if (plans.isError) {
    const offline = errorCode(plans.error) === 'network';
    return (
      <ScreenMessage
        title={offline ? 'Can’t reach PlantCircle' : 'Something went wrong on our side'}
        text={
          offline
            ? 'Check your connection and try again.'
            : 'It’s not you. Try again in a moment.'
        }
        {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
        actions={
          <button type="button" className={ui.primary} onClick={() => void plans.refetch()}>
            Try again
          </button>
        }
      />
    );
  }

  const [featured, ...rest] = filterPlans(plans.data, filter);
  const name = profile?.displayName.split(' ')[0];

  return (
    <>
      <main className={styles.screen}>
        <div className={styles.header}>
          <span className={styles.cityChip}>
            <PinIcon size={15} strokeWidth={2.3} />
            {city}
          </span>
          <span className={styles.headerActions}>
            {session && (
              <Link to="/my-plans" aria-label="Notifications" className={ui.iconButton}>
                <BellIcon />
              </Link>
            )}
            {session ? (
              <Link
                to="/profile"
                aria-label="Profile"
                className={`${styles.avatar} ${ui.tintSand}`}
              >
                {name?.charAt(0).toUpperCase() ?? ''}
              </Link>
            ) : (
              <Link to="/signup" className={styles.cityChip} style={{ textDecoration: 'none' }}>
                Sign in
              </Link>
            )}
          </span>
        </div>

        <div className={styles.heading}>
          <span className={styles.greeting}>
            {greeting(new Date())}
            {name ? `, ${name}` : ''}
          </span>
          <h1 className={styles.title}>This week in {city}</h1>
        </div>

        {upNext.data && <UpNextCard {...upNext.data} />}

        <div className={styles.filters} role="group" aria-label="Filter Plans">
          {HOME_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              className={styles.filter}
              onClick={() => {
                setFilter(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>

        {featured ? (
          <FeaturedCard plan={featured} />
        ) : (
          <p className={styles.empty}>
            {plans.data.length === 0
              ? `Nothing is planned in ${city} this week yet.`
              : 'No Plans match this filter this week.'}
          </p>
        )}

        {rest.length > 0 && (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Near you</h2>
              <Link to="/explore" className={styles.seeAll}>
                See all
              </Link>
            </div>
            <ul className={styles.rail}>
              {rest.map((plan) => (
                <PlanRailCard key={plan.id} plan={plan} />
              ))}
            </ul>
          </>
        )}
      </main>

      <Link to="/create" aria-label="Start a Plan" className={styles.fab}>
        <PlusIcon size={22} strokeWidth={2.4} />
      </Link>
      <TabBar />
    </>
  );
}
