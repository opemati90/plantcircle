import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { SproutIcon } from '../../design/icons';
import ui from '../../design/ui/ui.module.css';
import { useAuth } from '../auth/useAuth';
import styles from './onboarding.module.css';
import { GOALS, LAUNCH_CITY, readOnboarding, saveOnboarding } from './onboardingStore';

type Step = 'welcome' | 'goals' | 'city';

const toStep = (value: string | null): Step =>
  value === 'goals' || value === 'city' ? value : 'welcome';

function Progress({ step }: { step: 1 | 2 }) {
  return (
    <div className={styles.progress} role="img" aria-label={`Step ${step} of 2`}>
      <span className={styles.progressDone} />
      <span className={step === 2 ? styles.progressDone : undefined} />
    </div>
  );
}

/** First run: welcome → what brings you here → city. Steps live in the URL so Back works. */
export function WelcomeScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [stored] = useState(readOnboarding);
  const [goals, setGoals] = useState(stored.goals);
  const step = toStep(params.get('step'));

  if (session || stored.done) return <Navigate to="/home" replace />;

  const finish = () => {
    saveOnboarding({ goals, done: true });
    void navigate('/home');
  };

  if (step === 'welcome') {
    return (
      <main className={styles.hero}>
        <span className={styles.heroScrim} />
        <div className={styles.brand}>
          <SproutIcon size={22} />
          <span>PlantCircle</span>
        </div>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>Find your people.</h1>
          <p className={styles.heroLead}>
            Cook, eat and buy food together with plant-based people in {LAUNCH_CITY.name}.
          </p>
          <button
            type="button"
            className={styles.heroCta}
            onClick={() => void navigate('/?step=goals')}
          >
            Get started
          </button>
          <Link to="/signup" className={styles.heroLink}>
            I already have an account
          </Link>
        </div>
      </main>
    );
  }

  if (step === 'goals') {
    return (
      <main className={styles.step}>
        <Progress step={1} />
        <h1 className={styles.stepTitle}>What brings you here?</h1>
        <p className={styles.stepLead}>Choose any. You can change this later.</p>
        <div className={styles.goals}>
          {GOALS.map((goal) => {
            const selected = goals.includes(goal);
            return (
              <button
                key={goal}
                type="button"
                aria-pressed={selected}
                className={styles.goal}
                onClick={() => {
                  setGoals(selected ? goals.filter((g) => g !== goal) : [...goals, goal]);
                }}
              >
                <span>{goal}</span>
                <span className={styles.goalDot} />
              </button>
            );
          })}
        </div>
        <div className={styles.stepActions}>
          <button
            type="button"
            className={`${ui.primary} ${styles.continue}`}
            onClick={() => {
              saveOnboarding({ goals, done: false });
              void navigate('/?step=city');
            }}
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.step}>
      <Progress step={2} />
      <h1 className={styles.stepTitle}>Where are you based?</h1>
      <p className={styles.stepLead}>Just your city. Never your exact location.</p>
      <div className={styles.city}>
        <span className={styles.cityName}>{LAUNCH_CITY.name}</span>
        <span className={styles.cityCountry}>{LAUNCH_CITY.country}</span>
      </div>
      <p className={styles.note}>
        Somewhere else? PlantCircle is starting in {LAUNCH_CITY.name}. More cities will follow.
      </p>
      <div className={styles.stepActions}>
        <button type="button" className={`${ui.primary} ${styles.continue}`} onClick={finish}>
          Continue
        </button>
        <p className={ui.legal}>
          By continuing you confirm you’re 18+ and agree to the community rules.
        </p>
      </div>
    </main>
  );
}
