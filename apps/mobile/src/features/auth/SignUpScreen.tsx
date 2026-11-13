import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { IconButton } from '../../components/Button';
import { ChevronLeftIcon, ChevronRightIcon, SproutIcon } from '../../components/icons';
import { color, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { useBackend } from '../../lib/backend/BackendProvider';
import { emailSchema } from '../../lib/backend/types';
import { safeNextPath } from './authRules';
import { ProviderButtons } from './ProviderButtons';
import { useAuth } from './useAuth';

export default function SignUpScreen() {
  const backend = useBackend();
  const router = useRouter();
  const insets = useScreenInsets();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNextPath(params.next);
  const { session } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);

  const requestCode = useMutation({
    mutationFn: (address: string) => backend.requestEmailCode(address),
    onSuccess: (_data, address) => {
      router.push({ pathname: '/verify', params: { email: address, next } });
    },
  });

  // Signed in already: the privacy choices decide whether to ask or move straight on.
  if (session) return <Redirect href={{ pathname: '/privacy-choices', params: { next } }} />;

  const submit = () => {
    const parsed = emailSchema.safeParse(email.trim());
    setInvalid(!parsed.success);
    if (parsed.success) requestCode.mutate(parsed.data);
  };

  const error = invalid
    ? t('auth.invalidEmail')
    : requestCode.isError
      ? errorCode(requestCode.error) === 'rate_limited'
        ? t('auth.rateLimited')
        : t('auth.sendFailed')
      : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.headerTop, paddingBottom: Math.max(34, insets.bottom + 12) },
        ]}
      >
        <View style={styles.row}>
          <IconButton
            label={t('common.back')}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/welcome');
            }}
          >
            <ChevronLeftIcon strokeWidth={2.2} />
          </IconButton>
        </View>
        <View style={styles.intro}>
          <View aria-hidden style={styles.logo}>
            <SproutIcon size={32} color={color.brand} />
          </View>
          <Text
            accessibilityRole="header"
            style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
          >
            {t('auth.createTitle')}
          </Text>
          <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
            {t('auth.createLead')}
          </Text>
        </View>
        <ProviderButtons
          onSignedIn={() => {
            router.replace({ pathname: '/privacy-choices', params: { next } });
          }}
        />
        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={type(14, 'regular', { color: color.secondary })}>
            {t('auth.orEmail')}
          </Text>
          <View style={styles.rule} />
        </View>
        <View style={styles.form}>
          <View style={styles.emailRow}>
            <TextInput
              accessibilityLabel={t('auth.email')}
              aria-invalid={invalid}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={submit}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={color.secondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              returnKeyType="go"
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('auth.continueEmail')}
              aria-disabled={requestCode.isPending}
              disabled={requestCode.isPending}
              onPress={submit}
              style={[styles.submit, requestCode.isPending && styles.dim]}
            >
              <ChevronRightIcon size={20} strokeWidth={2.6} color="#FFFFFF" />
            </Pressable>
          </View>
          {error ? (
            <Text
              role="alert"
              style={type(15, 'regular', { color: color.danger, leading: 1.4 })}
            >
              {error}
            </Text>
          ) : null}
        </View>
        <Text
          style={[type(14, 'regular', { color: color.secondary, leading: 1.5 }), styles.terms]}
        >
          {t('auth.terms')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { flexGrow: 1, paddingHorizontal: 24, gap: 26 },
  row: { flexDirection: 'row' },
  intro: { gap: 14 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.card,
    backgroundColor: color.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: color.line },
  form: { gap: 8 },
  emailRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: color.borderControl,
    borderRadius: radius.button,
    backgroundColor: color.surface,
    ...type(17),
  },
  submit: {
    width: 54,
    height: 54,
    borderRadius: radius.button,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.55 },
  terms: { marginTop: 'auto', textAlign: 'center' },
});
