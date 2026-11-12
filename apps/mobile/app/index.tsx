import { Redirect } from 'expo-router';
import { useAuth } from '../src/features/auth/useAuth';
import { getOnboarding } from '../src/features/onboarding/onboardingStore';

/** Entry point: first launch goes to onboarding, everyone else to Home. */
export default function Index() {
  const { session, isLoading } = useAuth();
  if (isLoading) return null;
  return <Redirect href={session || getOnboarding().done ? '/home' : '/welcome'} />;
}
