import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Backend } from '../../lib/backend/backend';
import { appStorage } from '../../lib/storage';

export type PushOutcome = 'registered' | 'denied' | 'unavailable';
const TOKEN_KEY = 'pc.push.token';

/**
 * Asks the OS for permission and registers this device's Expo push token with the backend.
 * Web and simulators have no push: the outcome says so and nothing is stored.
 */
export async function registerForPush(backend: Backend): Promise<PushOutcome> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!status.granted) return 'denied';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'PlantCircle',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const token = await Notifications.getExpoPushTokenAsync();
  await backend.registerPushToken(token.data, Platform.OS === 'ios' ? 'ios' : 'android');
  await appStorage.set(TOKEN_KEY, token.data).catch(() => undefined);
  return 'registered';
}

/** True once this device registered for push (so the prompt is never shown again). */
export async function hasPushToken(): Promise<boolean> {
  return Boolean(await appStorage.get(TOKEN_KEY).catch(() => null));
}

/**
 * Signing out forgets this device: the next person to sign in here must not get the last
 * person's pushes. Best effort: a failure here never blocks the sign-out.
 */
export async function unregisterPush(backend: Backend): Promise<void> {
  const token = await appStorage.get(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await backend.removePushToken(token).catch(() => undefined);
  await appStorage.remove(TOKEN_KEY).catch(() => undefined);
}

/** Foreground pushes show as banners; the Inbox carries the same rows. */
export function configureForeground(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/**
 * The data a push carries (the notification's payload plus its type), for whoever handles a tap.
 * Returns null when there is nothing pending or on the web.
 */
export function onPushOpened(handle: (data: Record<string, unknown>) => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handle(response.notification.request.content.data as Record<string, unknown>);
  });
  // A tap that launched the app from cold.
  const cold = Notifications.getLastNotificationResponse();
  if (cold) handle(cold.notification.request.content.data as Record<string, unknown>);
  return () => { sub.remove(); };
}
