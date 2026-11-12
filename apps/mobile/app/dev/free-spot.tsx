import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

type FreeSpotHook = { __pcFixtures?: { freeSpot: (planId: string) => void } };

/**
 * Development only: `plantcircle://dev/free-spot?plan=<id>` frees a spot in the
 * fixture backend, so the offer flow can be walked through on a device. The hook
 * exists only when the fixture backend is loaded (dev builds without Supabase);
 * anywhere else this route just returns to My Plans.
 */
export default function FreeSpotRoute() {
  const { plan } = useLocalSearchParams<{ plan?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (__DEV__ && plan) {
      (globalThis as FreeSpotHook).__pcFixtures?.freeSpot(plan);
      // The spot changed behind the app's back, so cached views are out of date.
      void queryClient.invalidateQueries();
    }
    router.replace('/my-plans');
  }, [plan, router, queryClient]);

  return <View />;
}
