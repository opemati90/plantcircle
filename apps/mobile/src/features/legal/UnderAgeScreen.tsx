import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { SproutIcon } from '../../components/icons';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';

/**
 * PlantCircle is for adults, as the AgeBlocked design has it. Nothing is stored: this screen is
 * reached before any account exists, and leaves nothing behind.
 */
export default function UnderAgeScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.headerTop + 32, paddingBottom: 40 + insets.bottom },
        ]}
      >
        <View style={styles.badge}>
          <SproutIcon size={30} color={color.brand} />
        </View>
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('legal.underAgeTitle')}
        </Text>
        <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
          {t('legal.underAgeLead')}
        </Text>
        <View style={styles.card}>
          <Text style={type(17, 'semibold')}>{t('legal.browseRecipes')}</Text>
          <Text style={type(14, 'regular', { color: color.secondary })}>
            {t('legal.browseRecipesNote')}
          </Text>
          <Button
            variant="outline"
            label={t('legal.browseRecipes')}
            onPress={() => {
              router.replace('/explore');
            }}
          />
        </View>
        <Button
          label={t('legal.gotIt')}
          onPress={() => {
            router.replace('/welcome');
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, gap: 14 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  card: {
    gap: 8,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    marginTop: 10,
  },
});
