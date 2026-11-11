import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { Button, IconButton } from '../../components/Button';
import { ChevronLeftIcon, MailIcon } from '../../components/icons';
import { FloatingActionBar } from '../../components/parts';
import { color, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { useBackend } from '../../lib/backend/BackendProvider';
import { emailCodeSchema, emailSchema } from '../../lib/backend/types';
import { safeNextPath } from './authRules';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;

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

export default function VerifyEmailScreen() {
  const backend = useBackend();
  const router = useRouter();
  const insets = useScreenInsets();
  const params = useLocalSearchParams<{ email?: string; next?: string }>();
  const next = safeNextPath(params.next);
  const email = emailSchema.safeParse(params.email).data;
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [secondsLeft, restartCountdown] = useCountdown(RESEND_SECONDS);

  const verify = useMutation({
    mutationFn: (input: { email: string; code: string }) =>
      backend.verifyEmailCode(input.email, input.code),
    onSuccess: () => {
      router.dismissTo(next);
    },
  });
  const resend = useMutation({
    mutationFn: (address: string) => backend.requestEmailCode(address),
    onSuccess: restartCountdown,
  });

  // Reached without an email (deep link, restored state): start over.
  if (!email) return <Redirect href={{ pathname: '/signup', params: { next } }} />;

  const complete = emailCodeSchema.safeParse(code).success;
  const submit = () => {
    if (complete) verify.mutate({ email, code });
  };

  const error = verify.isError
    ? errorCode(verify.error) === 'invalid_code'
      ? 'That code didn’t work. Check it and try again, or request a new one.'
      : 'Couldn’t verify the code. Check your connection and try again.'
    : resend.isError
      ? 'Couldn’t send a new code. Try again in a moment.'
      : null;
  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.headerTop }]}
      >
        <View style={styles.row}>
          <IconButton
            label="Back"
            onPress={() => {
              router.back();
            }}
          >
            <ChevronLeftIcon strokeWidth={2.2} />
          </IconButton>
        </View>
        <View style={styles.intro}>
          <View aria-hidden style={styles.icon}>
            <MailIcon size={36} strokeWidth={1.7} color={color.brand} />
          </View>
          <Text
            accessibilityRole="header"
            style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
          >
            Check your email
          </Text>
          <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
            Enter the code we sent to <Text style={styles.strong}>{email}</Text>. It works for
            10 minutes.
          </Text>
        </View>
        <View style={styles.code}>
          {Array.from({ length: CODE_LENGTH }, (_, index) => (
            <View
              key={index}
              aria-hidden
              style={[styles.cell, focused && index === activeIndex && styles.cellActive]}
            >
              <Text allowFontScaling={false} style={type(26, 'bold')}>
                {code[index] ?? ''}
              </Text>
            </View>
          ))}
          {/* One real input stretched over the six cells; the active cell shows focus. */}
          <TextInput
            accessibilityLabel="6-digit code"
            aria-invalid={verify.isError}
            value={code}
            onChangeText={(text) => {
              setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH));
              verify.reset();
            }}
            onSubmitEditing={submit}
            onFocus={() => {
              setFocused(true);
            }}
            onBlur={() => {
              setFocused(false);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            autoFocus
            caretHidden
            style={styles.codeInput}
          />
        </View>
        {error ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger, leading: 1.4 })}>
            {error}
          </Text>
        ) : null}
        <View style={styles.hint}>
          <Text style={type(15, 'regular', { color: color.secondary })}>Didn’t get it? </Text>
          {secondsLeft > 0 ? (
            <Text style={type(15, 'bold')}>
              Resend in 0:{String(secondsLeft).padStart(2, '0')}
            </Text>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={resend.isPending}
              onPress={() => {
                resend.mutate(email);
              }}
              style={styles.resend}
            >
              <Text style={[type(15, 'bold'), styles.underline]}>Resend code</Text>
            </Pressable>
          )}
          <Text style={type(15, 'regular', { color: color.secondary })}> · check spam</Text>
        </View>
      </ScrollView>
      <FloatingActionBar style={styles.bar}>
        <Button
          label="Verify"
          disabled={!complete}
          loading={verify.isPending}
          onPress={submit}
        />
      </FloatingActionBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 190, gap: 26 },
  row: { flexDirection: 'row' },
  intro: { gap: 14 },
  icon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: color.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strong: { fontWeight: '700', color: color.ink },
  code: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 62,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: { borderColor: color.ink },
  codeInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.01,
    color: 'transparent',
  },
  hint: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: -8 },
  resend: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  bar: { padding: 12 },
});
