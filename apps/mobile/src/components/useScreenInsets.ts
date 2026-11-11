import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Design spacing reconciled with the device's safe areas. */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    /** Top of scrolling content on tab screens (design: 58). */
    top: Math.max(58, insets.top + 12),
    /** Top of header buttons on detail/form screens (design: 54). */
    headerTop: Math.max(54, insets.top + 8),
    /** Floating bars sit 20–22 above the bottom edge or the home indicator. */
    barBottom: Math.max(22, insets.bottom + 6),
    tabBarBottom: Math.max(20, insets.bottom),
    bottom: insets.bottom,
  };
}
