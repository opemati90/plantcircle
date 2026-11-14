import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { describeNotification } from './notificationCopy';
import { onPushOpened } from './push';

/** A tapped push opens what it is about, the same way the Inbox row does. */
export function PushTapRouter() {
  const router = useRouter();
  const { t } = useTranslation();
  useEffect(() => {
    let last = '';
    return onPushOpened((data) => {
      const key = JSON.stringify(data);
      if (key === last) return;
      last = key;
      const type = typeof data['type'] === 'string' ? data['type'] : '';
      const { href } = describeNotification(t, {
        id: '',
        type,
        payload: data,
        readAt: null,
        createdAt: '',
      });
      if (href) router.push(href);
    });
  }, [router, t]);
  return null;
}
