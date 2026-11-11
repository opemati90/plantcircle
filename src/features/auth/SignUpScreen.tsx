import { useMutation } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useBackend } from '../../app/backend';
import { errorCode } from '../../data/backend';
import { emailSchema } from '../../data/types';
import { ChevronLeftIcon, ChevronRightIcon, SproutIcon } from '../../design/icons';
import ui from '../../design/ui/ui.module.css';
import styles from './auth.module.css';
import { safeNextPath } from './authRules';
import { ProviderButtons } from './ProviderButtons';
import { useAuth } from './useAuth';

export function SignUpScreen() {
  const backend = useBackend();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);

  const requestCode = useMutation({
    mutationFn: (address: string) => backend.requestEmailCode(address),
    onSuccess: (_data, address) => {
      void navigate(`/verify?next=${encodeURIComponent(next)}`, { state: { email: address } });
    },
  });

  if (session) return <Navigate to={next} replace />;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email.trim());
    setInvalid(!parsed.success);
    if (parsed.success) requestCode.mutate(parsed.data);
  };

  const error = invalid
    ? 'Enter a valid email address.'
    : requestCode.isError
      ? errorCode(requestCode.error) === 'rate_limited'
        ? 'Too many attempts. Wait a minute and try again.'
        : 'Couldn’t send the code. Check your connection and try again.'
      : null;

  return (
    <main className={styles.screen}>
      <div className={styles.back}>
        <Link to="/" aria-label="Back" className={ui.iconButton}>
          <ChevronLeftIcon strokeWidth={2.2} />
        </Link>
      </div>
      <div className={styles.intro}>
        <span aria-hidden="true" className={styles.logo}>
          <SproutIcon size={32} color="var(--color-accent)" />
        </span>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.lead}>
          So hosts know you’re coming and you get reminders. No password needed.
        </p>
      </div>
      <ProviderButtons next={next} />
      <div className={styles.divider}>or with email</div>
      <form className={styles.emailForm} onSubmit={submit} noValidate>
        <div className={styles.emailRow}>
          <label htmlFor="email" className="visually-hidden">
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className={styles.emailInput}
            value={email}
            aria-invalid={invalid}
            aria-describedby={error ? 'email-error' : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <button
            type="submit"
            aria-label="Continue with email"
            className={styles.emailSubmit}
            disabled={requestCode.isPending}
          >
            <ChevronRightIcon size={20} strokeWidth={2.6} />
          </button>
        </div>
        {error && (
          <p id="email-error" role="alert" className={ui.fieldError}>
            {error}
          </p>
        )}
      </form>
      <p className={`${styles.terms} ${styles.signUpTerms}`}>
        By continuing you confirm you’re 18+ and accept the Terms and Privacy Policy.
      </p>
    </main>
  );
}
