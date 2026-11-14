import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { BellIcon } from '../../components/icons';
import { Photo } from '../../components/Photo';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useUpdateSettings } from '../account/queries';
import { welcomePhoto } from '../plans/planImage';
import { registerForPush } from './push';

/**
 * Never miss a spot: the notifications prompt, shown once after the first RSVP (never at
 * sign-up), as the NotifPermission design has it: the photo, two sample notifications, "Turn on"
 * (the OS prompt) and "Not now" (not asked again for 14 days).
 */
export default function NotificationPromptScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const backend = useBackend();
  const update = useUpdateSettings();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'failed' | 'denied' | 'unavailable' | null>(null);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const dismiss = () => {
    update.mutate({ notifPromptDismissed: true }, { onSettled: leave });
  };
  const turnOn = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await registerForPush(backend);
      if (result === 'registered') {
        update.mutate({ notifPromptDismissed: true }, { onSettled: leave });
        return;
      }
      // Nothing was turned on: say so; "Not now" remains the way out.
      setOutcome(result);
      setBusy(false);
    } catch {
      setOutcome('failed');
      setBusy(false);
    }
  };

  const samples = [
    { when: t('notify.sampleNow'), text: t('notify.sampleOffer') },
    { when: '9:00', text: t('notify.sampleReminder') },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.headerTop + 8, paddingBottom: 40 + insets.bottom },
        ]}
      >
        <View style={styles.hero}>
          <View style={styles.photo}>
            <Photo source={welcomePhoto} />
          </View>
          <View style={styles.samples}>
            {samples.map((s) => (
              <View key={s.when} style={styles.sample}>
                <View style={styles.sampleIcon}>
                  <BellIcon size={16} strokeWidth={2} color={color.brand} />
                </View>
                <View style={styles.sampleText}>
                  <View style={styles.sampleHead}>
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(12, 'bold', { tracking: 0.2 })}
                    >
                      PlantCircle
                    </Text>
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(12, 'regular', { color: color.secondary })}
                    >
                      {s.when}
                    </Text>
                  </View>
                  <Text
                    maxFontSizeMultiplier={2.0}
                    style={type(13, 'regular', { leading: 1.35 })}
                  >
                    {s.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('notify.promptTitle')}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}
        >
          {t('notify.promptLead')}
        </Text>
        {outcome ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(15, 'regular', {
              color: outcome === 'unavailable' ? color.secondary : color.danger,
            })}
          >
            {outcome === 'denied'
              ? t('notify.promptDenied')
              : outcome === 'unavailable'
                ? t('notify.promptUnavailable')
                : t('notify.promptError')}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Button
            label={t('notify.turnOn')}
            loading={busy || update.isPending}
            onPress={() => {
              void turnOn();
            }}
          />
          <Button
            variant="ghost"
            label={t('notify.notNow')}
            disabled={busy}
            onPress={dismiss}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, gap: 14 },
  hero: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: color.fill,
    marginBottom: 10,
  },
  photo: { width: '100%', height: 220 },
  samples: { position: 'absolute', left: 14, right: 14, bottom: 14, gap: 8 },
  sample: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  sampleIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: color.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleText: { flex: 1, minWidth: 0, gap: 1 },
  sampleHead: { flexDirection: 'row', justifyContent: 'space-between' },
  buttons: { gap: 6, paddingTop: 10 },
});
