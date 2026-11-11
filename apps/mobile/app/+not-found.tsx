import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/parts';

export default function NotFound() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('errors.notFoundTitle')}
      text={t('errors.notFoundText')}
      actions={
        <Button
          label={t('common.backToHome')}
          onPress={() => {
            router.replace('/home');
          }}
        />
      }
    />
  );
}
