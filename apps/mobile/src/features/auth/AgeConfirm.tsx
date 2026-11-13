import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Checkbox } from '../../components/Checkbox';
import { color, size, type } from '../../components/theme';

/** The 18+ self-declaration every sign-in path shows, with the way out for anyone under 18. */
export function AgeConfirm({ value, onValueChange }: { value: boolean; onValueChange: (next: boolean) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <Checkbox label={t('auth.ageConfirm')} value={value} onValueChange={onValueChange} />
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          router.push('/under-18');
        }}
        style={styles.underAge}
      >
        <Text style={type(14, 'semibold', { color: color.secondary })}>{t('auth.underAge')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  underAge: { minHeight: size.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
