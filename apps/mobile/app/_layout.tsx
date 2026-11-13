import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { PolicyGate } from '../src/features/legal/PolicyGate';
import { configureForeground } from '../src/features/notifications/push';
import { PushTapRouter } from '../src/features/notifications/PushTapRouter';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { color, type } from '../src/components/theme';
import { useSessionSync } from '../src/features/auth/useAuth';
import { loadOnboarding } from '../src/features/onboarding/onboardingStore';
import { loadBackend } from '../src/lib/backend';
import { BackendError, type Backend } from '../src/lib/backend/backend';
import { BackendProvider } from '../src/lib/backend/BackendProvider';
import { initI18n } from '../src/lib/i18n';

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

function SessionSync() {
  useSessionSync();
  return null;
}

function StartupFailed() {
  const { t } = useTranslation();
  return (
    <View style={styles.failed}>
      <Text accessibilityRole="header" style={type(24, 'bold')}>
        {t('errors.startTitle')}
      </Text>
      <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
        {t('errors.startText')}
      </Text>
    </View>
  );
}

type Startup = { backend: Backend } | { failed: true } | null;

configureForeground();

export default function RootLayout() {
  const [startup, setStartup] = useState<Startup>(null);
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    // Copy first, so that even the start-up failure screen is in the person's language.
    initI18n()
      .then(() => Promise.all([loadBackend(), loadOnboarding()]))
      .then(
        ([backend]) => {
          setStartup({ backend });
        },
        (error: unknown) => {
          console.error(error);
          setStartup({ failed: true });
        },
      );
  }, []);

  // The native splash screen stays up while this resolves.
  if (!startup) return null;

  if ('failed' in startup) return <StartupFailed />;

  return (
    <SafeAreaProvider>
      <BackendProvider backend={startup.backend}>
        <QueryClientProvider client={queryClient}>
          <SessionSync />
          <PolicyGate />
          <PushTapRouter />
          <StatusBar style="auto" />
          {/* Phones use the full width; larger screens keep the phone layout centred. */}
          <View style={styles.backdrop}>
            <View style={styles.frame}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.surface },
                }}
              />
              {startup.backend.kind === 'fixtures' ? (
                <View pointerEvents="none" style={styles.devBadge} testID="dev-badge">
                  <Text style={type(11, 'semibold', { color: '#FFFFFF' })}>
                    Dev fixtures · email code 000000
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </QueryClientProvider>
      </BackendProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: color.fill },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    backgroundColor: color.surface,
  },
  failed: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: color.surface,
  },
  devBadge: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: color.warning,
  },
});
