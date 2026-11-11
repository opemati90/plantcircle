import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from './Button';

describe('Button', () => {
  it('calls onPress and exposes its label as the accessible name', async () => {
    const onPress = jest.fn();
    await render(<Button label="Join" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not respond while disabled, and says so to assistive technology', async () => {
    const onPress = jest.fn();
    await render(<Button label="Full" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Full' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('keeps its name and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Verify" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Verify' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
  });
});
