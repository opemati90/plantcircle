import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { dayOfMonth, monthShort } from '../lib/dates';
import { IconButton } from './Button';
import { AlertIcon, CloseIcon } from './icons';
import { color, extra, radius, shadow, size, type } from './theme';
import { useScreenInsets } from './useScreenInsets';
import { useSavedPlansAvailable } from '../lib/savedPlans';

/** Decorative calendar tile; the date is always also present as text nearby. */
export function DateTile({ iso, timeZone }: { iso: string; timeZone: string }) {
  return (
    <View aria-hidden style={styles.dateTile}>
      <View style={styles.dateMonth}>
        <Text
          allowFontScaling={false}
          style={type(11, 'bold', { color: '#FFFFFF', tracking: 0.8 })}
        >
          {monthShort(iso, timeZone)}
        </Text>
      </View>
      <View style={styles.dateDay}>
        <Text allowFontScaling={false} style={type(22, 'bold', { tracking: -0.5 })}>
          {dayOfMonth(iso, timeZone)}
        </Text>
      </View>
    </View>
  );
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      subscription.remove();
    };
  }, []);
  return reduce;
}

interface SkeletonProps {
  width: DimensionValue;
  height: number;
  radius: number;
}

/** Placeholder block; the pulse is off when Reduce Motion is on. */
export function Skeleton({ width, height, radius: corner }: SkeletonProps) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity, reduce]);
  return (
    <Animated.View
      style={{ width, height, borderRadius: corner, backgroundColor: extra.skeleton, opacity }}
    />
  );
}

/** Blur bar over a white fade, so content never shows through behind the action. */
/** Height of the on-screen keyboard, so a bar pinned to the bottom can rise above it. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // Android resizes the window for the keyboard already, so lifting again would double it.
    if (Platform.OS !== 'ios') return;
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setHeight(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return height;
}

export function FloatingActionBar({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { barBottom } = useScreenInsets();
  // Absolutely positioned, so a keyboard-avoiding view cannot lift it; lift it here.
  const keyboardHeight = useKeyboardHeight();
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        locations={[0, 0.55]}
        style={styles.fade}
      />
      <View style={[styles.bar, { bottom: barBottom + keyboardHeight }]}>
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={style}>{children}</View>
      </View>
    </>
  );
}

interface ToastProps {
  title: string;
  detail?: string;
  icon?: ReactNode;
  /** Errors interrupt; confirmations wait their turn. */
  tone: 'alert' | 'status';
  action?: { label: string; onPress: () => void };
}

export function Toast({ title, detail, icon, tone, action }: ToastProps) {
  const { headerTop } = useScreenInsets();
  return (
    <View
      role={tone}
      accessibilityLiveRegion={tone === 'alert' ? 'assertive' : 'polite'}
      style={[styles.toast, { top: headerTop }]}
    >
      {icon}
      <View style={styles.toastText}>
        <Text style={type(15, 'semibold', { color: '#FFFFFF' })}>{title}</Text>
        {detail ? (
          <Text style={type(13, 'regular', { color: '#FFFFFF' })}>{detail}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.toastAction}
        >
          <Text style={type(14, 'semibold')}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  lead?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, lead, children }: BottomSheetProps) {
  const { bottom } = useScreenInsets();
  const { t } = useTranslation();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={styles.sheetScrim}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(34, bottom + 12) }]}
        >
          <View aria-hidden style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeading}>
              <Text accessibilityRole="header" style={type(24, 'bold', { tracking: -0.6 })}>
                {title}
              </Text>
              {lead ? (
                <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>
                  {lead}
                </Text>
              ) : null}
            </View>
            <IconButton label={t('common.close')} onPress={onClose}>
              <CloseIcon strokeWidth={2.2} />
            </IconButton>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

interface EmptyStateProps {
  title: string;
  text: string;
  icon?: ReactNode;
  /** Always offer a next step. */
  actions: ReactNode;
  /**
   * Server and connection errors, as the ServerError design has it: "Your Plans still work",
   * leading to My Plans, which is saved on the phone. Pass the handler that opens it.
   */
  onSavedPlans?: () => void;
  /** A short reference for support ("Error reference: …"), when the failure carried one. */
  reference?: string | null;
}

/** Full-screen state: errors, missing content, areas that are not built yet. */
export function EmptyState({
  title,
  text,
  icon,
  actions,
  onSavedPlans,
  reference,
}: EmptyStateProps) {
  const { headerTop } = useScreenInsets();
  const { t } = useTranslation();
  const savedPlans = useSavedPlansAvailable();
  return (
    <View style={[styles.empty, { paddingTop: headerTop + 56 }]}>
      <View style={styles.emptyBody}>
        <View aria-hidden style={styles.emptyIcon}>
          {icon ?? <AlertIcon size={36} strokeWidth={1.7} />}
        </View>
        <Text
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {title}
        </Text>
        <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
          {text}
        </Text>
        {onSavedPlans && savedPlans ? (
          <Pressable accessibilityRole="link" onPress={onSavedPlans} style={styles.savedCard}>
            <View style={styles.savedText}>
              <Text style={type(16, 'semibold')}>{t('errors.savedTitle')}</Text>
              <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>
                {t('errors.savedText')}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {reference ? (
          <Text style={type(13, 'regular', { color: color.secondary })}>
            {t('errors.reference', { ref: reference })}
          </Text>
        ) : null}
      </View>
      <View style={styles.emptyActions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateTile: {
    width: size.tileLead,
    height: size.tileLead,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  dateMonth: {
    height: 18,
    backgroundColor: color.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 },
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: color.bar,
    boxShadow: shadow.bar,
    overflow: 'hidden',
  },
  toast: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 18,
    backgroundColor: color.ink,
    boxShadow: shadow.toast,
  },
  toastText: { flex: 1, gap: 1, minHeight: size.touchMin, justifyContent: 'center' },
  toastAction: {
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheetScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: extra.scrim,
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    paddingTop: 10,
    paddingHorizontal: 24,
    gap: 14,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: color.surface,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: extra.sheetHandle,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetHeading: { flex: 1, gap: 6 },
  empty: { flex: 1, paddingHorizontal: 24, gap: 26, backgroundColor: color.surface },
  emptyBody: { gap: 14 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActions: { gap: 10 },
  savedCard: {
    minHeight: size.touchMin,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: color.fill,
    marginTop: 6,
  },
  savedText: { gap: 3 },
});

/** A message inside a screen that keeps its other controls usable: empty, error and "later" states. */
export function InlineState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <View style={inlineStyles.wrap}>
      <Text accessibilityRole="header" style={type(22, 'bold', { tracking: -0.5 })}>
        {title}
      </Text>
      <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>{text}</Text>
      {action}
    </View>
  );
}

const inlineStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 16 },
});
