import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { ChevronLeftIcon } from '../../components/icons';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { CircleAccess } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey, useCreateCircle } from '../plans/queries';

const ACCESS: CircleAccess[] = ['open', 'request'];

/** Start a Circle in your home city. Anyone can join open ones; request ones need approval. */
export default function CreateCircleScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session, profile, profileError, retryProfile } = useAuth();
  const create = useCreateCircle();
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [access, setAccess] = useState<CircleAccess>('open');
  const [question, setQuestion] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const cityId = profile?.cityId ?? null;
  const valid = name.trim().length >= 2 && cityId !== null;

  // Editing the Circle makes a new one, so the key changes with the input. A retry with the same
  // input keeps the key, so a double tap or a lost response can never make two Circles.
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [name, tagline, access, question]);

  const back = (
    <IconButton
      label={t('common.back')}
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/explore');
      }}
      style={[styles.back, { top: insets.top + 8 }]}
    >
      <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />
    </IconButton>
  );

  const save = () => {
    if (!cityId || !valid) return;
    create.mutate(
      {
        key,
        circle: {
          name: name.trim(),
          tagline: tagline.trim() || null,
          cityId,
          access,
          joinQuestion: access === 'request' ? question.trim() || null : null,
        },
      },
      {
        onSuccess: (id) => {
          router.replace({ pathname: '/circle/[id]', params: { id } });
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 64, paddingBottom: 40 + insets.bottom },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('circles.createTitle')}
        </Text>

        <Text style={label}>{t('circles.nameLabel')}</Text>
        <TextInput
          accessibilityLabel={t('circles.nameLabel')}
          value={name}
          onChangeText={setName}
          maxLength={60}
          style={[styles.field, type(17)]}
        />

        <Text style={label}>{t('circles.taglineLabel')}</Text>
        <TextInput
          accessibilityLabel={t('circles.taglineLabel')}
          value={tagline}
          onChangeText={setTagline}
          maxLength={120}
          style={[styles.field, type(17)]}
        />

        <Text style={label}>{t('circles.accessLabel')}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('circles.accessLabel')}
          style={styles.options}
        >
          {ACCESS.map((option) => {
            const selected = access === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                aria-checked={selected}
                onPress={() => {
                  setAccess(option);
                }}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={type(17, 'semibold', { tracking: -0.3 })}>
                  {t(`circles.access.${option}`)}
                </Text>
                <Text style={type(14, 'regular', { color: color.secondary })}>
                  {t(`circles.access.${option}Lead`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {access === 'request' ? (
          <>
            <Text style={label}>{t('circles.questionLabel')}</Text>
            <TextInput
              accessibilityLabel={t('circles.questionLabel')}
              value={question}
              onChangeText={setQuestion}
              maxLength={300}
              style={[styles.field, type(17)]}
            />
          </>
        ) : null}

        {!session ? (
          <View style={styles.notice}>
            <Text style={type(15, 'regular', { color: color.secondary })}>
              {t('circles.signUpLead')}
            </Text>
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/circle/new' } });
              }}
            />
          </View>
        ) : profileError ? (
          <View style={styles.notice}>
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('errors.serverText')}
            </Text>
            <Button variant="outline" label={t('common.retry')} onPress={retryProfile} />
          </View>
        ) : cityId === null ? (
          <View style={styles.notice}>
            <Text role="status" style={type(15, 'regular', { color: color.secondary })}>
              {t('circles.needCity')}
            </Text>
            <Button
              variant="outline"
              label={t('home.changeCity')}
              onPress={() => {
                router.replace('/home');
              }}
            />
          </View>
        ) : null}
        {create.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {errorCode(create.error) === 'rate_limited'
              ? t('circles.rateLimited')
              : t('circles.genericError')}
          </Text>
        ) : null}

        <Button
          label={t('circles.save')}
          disabled={!valid}
          loading={create.isPending}
          onPress={save}
        />
      </ScrollView>
    </View>
  );
}

const label = { ...type(14, 'semibold', { color: color.secondary }), marginTop: 4 };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  content: { paddingHorizontal: 20, gap: 12 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  options: { gap: 10 },
  option: {
    gap: 4,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  optionSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  notice: { gap: 12 },
});
