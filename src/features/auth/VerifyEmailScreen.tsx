import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useBackend } from '../../app/backend';
import { errorCode } from '../../data/backend';
import { emailCodeSchema } from '../../data/types';
import { ChevronLeftIcon, MailIcon } from '../../design/icons';
import ui from '../../design/ui/ui.module.css';
import styles from './auth.module.css';
import { safeNextPath } from './authRules';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;
const stateSchema = z.object({ email: z.string() });

function useCountdown(seconds: number): [number, () => void] {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => {
      setLeft(left - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [left]);
  return [
    left,
    () => {
      setLeft(seconds);
    },
  ];
}

export function VerifyEmailScreen() {
  const backend = useBackend();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const email = stateSchema.safeParse(location.state).data?.email;
  const [code, setCode] = useState('');
  const [secondsLeft, restartCountdown] = useCountdown(RESEND_SECONDS);

  const verify = useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      backend.verifyEmailCode(input.email, input.code),
    onSuccess: () => void navigate(next, { replace: true }),
  });
  const resend = useMutation({
    mutationFn: (address: string) => backend.requestEmailCode(address),
    onSuccess: restartCountdown,
  });

  // Reached without going through sign-up (reload, deep link): start over.
  if (!email) return <Navigate to={`/signup?next=${encodeURIComponent(next)}`} replace />;

  const complete = emailCodeSchema.safeParse(code).success;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (complete) verify.mutate({ email, code });
  };

  const error = verify.isError
    ? errorCode(verify.error) === 'invalid_code'
      ? 'That code didn’t work. Check it and try again, or request a new one.'
      : 'Couldn’t verify the code. Check your connection and try again.'
    : resend.isError
      ? 'Couldn’t send a new code. Try again in a moment.'
      : null;
  const countdown = `0:${String(secondsLeft).padStart(2, '0')}`;

  return (
    <main>
      <form className={styles.screen} onSubmit={submit}>
        <div className={styles.back}>
          <Link
            to={`/signup?next=${encodeURIComponent(next)}`}
            aria-label="Back"
            className={ui.iconButton}
          >
            <ChevronLeftIcon strokeWidth={2.2} />
          </Link>
        </div>
        <div className={styles.intro}>
          <span aria-hidden="true" className={styles.round}>
            <MailIcon size={36} strokeWidth={1.7} color="var(--color-accent)" />
          </span>
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.lead}>
            Enter the code we sent to <b>{email}</b>. It works for 10 minutes.
          </p>
        </div>
        <div className={styles.code}>
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`${styles.codeCell} ${
                index === Math.min(code.length, CODE_LENGTH - 1) ? styles.codeCellActive : ''
              }`}
            >
              {code[index] ?? ''}
            </span>
          ))}
          <input
            className={styles.codeInput}
            aria-label="6-digit code"
            aria-invalid={verify.isError}
            aria-describedby={error ? 'code-error' : undefined}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            autoFocus
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH));
              verify.reset();
            }}
          />
        </div>
        {error && (
          <p id="code-error" role="alert" className={ui.fieldError}>
            {error}
          </p>
        )}
        <p className={styles.hint}>
          Didn’t get it?{' '}
          {secondsLeft > 0 ? (
            <b>Resend in {countdown}</b>
          ) : (
            <button
              type="button"
              className={styles.resend}
              disabled={resend.isPending}
              onClick={() => {
                resend.mutate(email);
              }}
            >
              Resend code
            </button>
          )}{' '}
          · check spam
        </p>
        <div aria-hidden="true" className={ui.barFade} />
        <div className={`${ui.bar} ${ui.barStack}`}>
          <button type="submit" className={ui.primary} disabled={!complete || verify.isPending}>
            {verify.isPending ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      </form>
    </main>
  );
}
