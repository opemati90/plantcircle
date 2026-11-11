import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { EmptyState } from '../src/components/parts';

export default function NotFound() {
  const router = useRouter();
  return (
    <EmptyState
      title="Page not found"
      text="That link doesn’t lead anywhere."
      actions={
        <Button
          label="Back to Home"
          onPress={() => {
            router.replace('/home');
          }}
        />
      }
    />
  );
}
