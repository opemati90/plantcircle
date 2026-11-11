import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router';
import type { Backend } from '../data/backend';
import { BackendError } from '../data/backend';
import { ScreenMessage } from '../design/ui/ScreenMessage';
import ui from '../design/ui/ui.module.css';
import { AuthCallbackScreen } from '../features/auth/AuthCallbackScreen';
import { SignUpScreen } from '../features/auth/SignUpScreen';
import { useSessionSync } from '../features/auth/useAuth';
import { VerifyEmailScreen } from '../features/auth/VerifyEmailScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { WelcomeScreen } from '../features/onboarding/WelcomeScreen';
import { PlanScreen } from '../features/plans/PlanScreen';
import { BackendProvider } from './backend';
import { NotBuiltScreen } from './NotBuiltScreen';

function Root({ fixtures }: { fixtures: boolean }) {
  useSessionSync();
  return (
    <>
      {fixtures && (
        <div className={ui.devBadge} data-dev-badge>
          Dev fixtures · email code 000000
        </div>
      )}
      <Outlet />
    </>
  );
}

function ErrorScreen({ notFound }: { notFound?: boolean }) {
  return (
    <ScreenMessage
      title={notFound ? 'Page not found' : 'Something went wrong'}
      text={notFound ? 'That link doesn’t lead anywhere.' : 'Reload the page to try again.'}
      actions={
        <Link to="/home" className={ui.primary} reloadDocument={!notFound}>
          Back to Home
        </Link>
      }
    />
  );
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retry transient network failures once; never retry "not found" or auth errors.
        retry: (count, error) =>
          count < 1 && error instanceof BackendError && error.code === 'network',
      },
      mutations: { retry: false },
    },
  });
}

function createRouter(fixtures: boolean) {
  return createBrowserRouter([
    {
      element: <Root fixtures={fixtures} />,
      errorElement: <ErrorScreen />,
      children: [
        { path: '/', element: <WelcomeScreen /> },
        { path: '/home', element: <HomeScreen /> },
        { path: '/plans/:planId', element: <PlanScreen /> },
        { path: '/signup', element: <SignUpScreen /> },
        { path: '/verify', element: <VerifyEmailScreen /> },
        { path: '/auth/callback', element: <AuthCallbackScreen /> },
        { path: '/explore', element: <NotBuiltScreen name="Explore" /> },
        { path: '/my-plans', element: <NotBuiltScreen name="My Plans" /> },
        { path: '/inbox', element: <NotBuiltScreen name="Inbox" /> },
        { path: '/profile', element: <NotBuiltScreen name="Profile" signOut /> },
        { path: '/create', element: <NotBuiltScreen name="Starting a Plan" /> },
        { path: '*', element: <ErrorScreen notFound /> },
      ],
    },
  ]);
}

export function App({ backend }: { backend: Backend }) {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createRouter(backend.kind === 'fixtures'));
  return (
    <BackendProvider backend={backend}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </BackendProvider>
  );
}
