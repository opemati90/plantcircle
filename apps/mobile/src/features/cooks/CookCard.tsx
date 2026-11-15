import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Button, IconButton } from '../../components/Button';
import { ChevronRightIcon, LeafIcon, MoreIcon } from '../../components/icons';
import { BottomSheet } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, shadow, size, type } from '../../components/theme';
import { errorCode } from '../../lib/backend/backend';
import type { Cook } from '../../lib/backend/types';
import { postedAgo } from './postedAgo';
import { newIdempotencyKey } from '../plans/queries';
import { useBlockUser } from '../safety/queries';
import { themeLabel } from './challengeThemes';
import { useCookReaction, useDeleteCook } from './queries';

/** Initial on a soft tint, the same three tints the rest of the app uses for people. */
export function Initial({ name, size: side = 36 }: { name: string; size?: number }) {
  const sum = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const tint = extra.tints[sum % extra.tints.length] ?? extra.tints[0];
  return (
    <View
      aria-hidden
      style={[
        styles.initial,
        { width: side, height: side, borderRadius: side / 2, backgroundColor: tint.background },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={type(side * 0.42, 'semibold', { color: tint.text })}
      >
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export const photoLabel = (t: TFunction, cook: Cook) =>
  cook.photoAlt ?? t('cooks.photoOf', { caption: cook.caption });

/** "Yum": a toggle with its count, a small spring when it turns on (none under Reduce Motion). */
export function YumButton({ cook }: { cook: Cook }) {
  const { t } = useTranslation();
  const react = useCookReaction();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const leaf = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (cook.mine) {
    return cook.reactions > 0 ? (
      <View style={styles.count}>
        <LeafIcon size={18} color={color.brand} filled />
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(14, 'semibold', { color: color.secondary })}
        >
          {t('cooks.yumCount', { count: cook.reactions })}
        </Text>
      </View>
    ) : null;
  }
  return (
    <View style={styles.yumWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('cooks.yum')}, ${t('cooks.yumCount', { count: cook.reactions })}`}
        // Native screen readers read `selected`; the web reads aria-pressed.
        accessibilityState={{ selected: cook.reacted, disabled: react.isPending }}
        aria-pressed={cook.reacted}
        disabled={react.isPending}
        hitSlop={4}
        onPress={() => {
          if (!cook.reacted && !reduceMotion) {
            scale.value = withSequence(
              withSpring(1.28, { damping: 9, stiffness: 420 }),
              withSpring(1, { damping: 12, stiffness: 260 }),
            );
          }
          react.mutate({ cookId: cook.id, on: !cook.reacted });
        }}
        style={({ pressed }) => [
          styles.pill,
          cook.reacted && styles.pillOn,
          pressed && styles.pressed,
        ]}
      >
        <Animated.View style={leaf}>
          <LeafIcon size={18} color={color.brand} filled={cook.reacted} />
        </Animated.View>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(14, 'semibold', { color: cook.reacted ? color.brand : color.ink })}
        >
          {cook.reactions > 0 ? `${t('cooks.yum')} · ${cook.reactions}` : t('cooks.yum')}
        </Text>
      </Pressable>
      {react.isError ? (
        <Text
          maxFontSizeMultiplier={2.0}
          role="alert"
          style={type(13, 'regular', { color: color.danger })}
        >
          {errorCode(react.error) === 'network'
            ? t('cooks.errorOffline')
            : t('cooks.errorAction')}
        </Text>
      ) : null}
    </View>
  );
}

/** One post in a feed: who, the photo, the recipe and caption, then Yum and Ask how. */
export function CookCard({
  cook,
  now,
  showCircle = true,
  onGone,
}: {
  cook: Cook;
  now: Date;
  /** After the viewer deletes the post or blocks its author (the post screen leaves). */
  onGone?: () => void;
  /** Hidden inside a Circle's own feed, where it would repeat the page title. */
  showCircle?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [options, setOptions] = useState(false);
  const open = () => {
    router.push({ pathname: '/cook/[id]', params: { id: cook.id } });
  };
  const meta = [showCircle ? cook.circleName : null, postedAgo(t, cook.createdAt, now)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.card}>
      <View style={styles.byline}>
        <Initial name={cook.mine ? t('cooks.you') : cook.authorName} />
        <View style={styles.bylineText}>
          <Text maxFontSizeMultiplier={2.0} style={type(15, 'semibold', { tracking: -0.2 })}>
            {cook.mine ? t('cooks.you') : cook.authorName}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(13, 'regular', { color: color.secondary })}
          >
            {meta}
          </Text>
        </View>
        <IconButton
          label={t('cooks.options')}
          onPress={() => {
            setOptions(true);
          }}
        >
          <MoreIcon size={20} strokeWidth={2.4} />
        </IconButton>
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${photoLabel(t, cook)}. ${t('cooks.openPost')}`}
        onPress={open}
        style={({ pressed }) => [styles.photo, pressed && styles.pressedPhoto]}
      >
        <Photo source={cook.photo} alt={photoLabel(t, cook)} />
      </Pressable>

      <View style={styles.body}>
        {cook.challengeWeek ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={[type(12, 'bold', { color: color.brand, tracking: 1 }), styles.upper]}
          >
            {t('cooks.challengeTag', {
              theme: themeLabel(t, cook.challengeTheme, cook.challengeWeek),
            })}
          </Text>
        ) : null}
        <Text maxFontSizeMultiplier={2.0} style={type(17, 'regular', { leading: 1.4 })}>
          {cook.caption}
        </Text>
        {cook.recipeTitle && cook.recipeId ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('cooks.fromRecipe', { title: cook.recipeTitle })}
            onPress={() => {
              router.push({ pathname: '/recipe/[id]', params: { id: cook.recipeId ?? '' } });
            }}
            style={styles.recipe}
          >
            <Text
              maxFontSizeMultiplier={2.0}
              numberOfLines={1}
              style={[type(13, 'semibold', { color: color.brand }), styles.shrink]}
            >
              {t('cooks.fromRecipe', { title: cook.recipeTitle })}
            </Text>
            <ChevronRightIcon size={14} strokeWidth={2.4} color={color.brand} />
          </Pressable>
        ) : null}
        <View style={styles.actions}>
          <YumButton cook={cook} />
          {cook.mine ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('cooks.askHowName', { name: cook.authorName })}
              onPress={() => {
                router.push({
                  pathname: '/chat/direct/[id]',
                  params: {
                    id: cook.authorId,
                    draft: t('cooks.askHowDraft', { caption: cook.caption }),
                  },
                });
              }}
              style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
            >
              <Text maxFontSizeMultiplier={2.0} style={type(14, 'semibold')}>
                {t('cooks.askHow')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <CookOptions
        cook={cook}
        open={options}
        onClose={() => {
          setOptions(false);
        }}
        {...(onGone ? { onDeleted: onGone } : {})}
      />
    </View>
  );
}

/** The compact card for Home's rail: a portrait thumbnail, the caption, who and where. */
export function CookTile({ cook, width = 148 }: { cook: Cook; width?: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const who = cook.mine ? t('cooks.you') : cook.authorName;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${cook.caption}, ${t('cooks.byIn', { name: who, circle: cook.circleName })}`}
      onPress={() => {
        router.push({ pathname: '/cook/[id]', params: { id: cook.id } });
      }}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <View style={[styles.tilePhoto, { width }]}>
        <Photo source={cook.thumb} />
        {cook.reactions > 0 ? (
          <View style={styles.tileYum}>
            <LeafIcon size={13} color={color.brand} filled />
            <Text maxFontSizeMultiplier={2.0} style={type(12, 'semibold')}>
              {cook.reactions}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        maxFontSizeMultiplier={2.0}
        numberOfLines={3}
        style={type(15, 'semibold', { tracking: -0.2, leading: 1.3 })}
      >
        {cook.caption}
      </Text>
      <Text
        maxFontSizeMultiplier={2.0}
        numberOfLines={2}
        style={type(13, 'regular', { color: color.secondary })}
      >
        {t('cooks.byIn', { name: who, circle: cook.circleName })}
      </Text>
    </Pressable>
  );
}

/** Report, block or (your own) delete, in a sheet; blocking and deleting ask once more. */
export function CookOptions({
  cook,
  open,
  onClose,
  onDeleted,
}: {
  cook: Cook;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const remove = useDeleteCook();
  const block = useBlockUser();
  const [blockKey] = useState(newIdempotencyKey);
  // One key for this delete, kept across retries, so a lost answer is replayed, not refused.
  const [deleteKey] = useState(newIdempotencyKey);
  const [confirm, setConfirm] = useState<'block' | 'delete' | null>(null);
  const close = () => {
    setConfirm(null);
    onClose();
  };
  const failed = remove.isError || block.isError;

  const title =
    confirm === 'delete'
      ? t('cooks.deleteTitle')
      : confirm === 'block'
        ? t('person.blockName', { name: cook.authorName })
        : t('cooks.optionsTitle');
  const lead =
    confirm === 'delete'
      ? t('cooks.deleteLead')
      : confirm === 'block'
        ? t('safety.alsoBlockNote')
        : undefined;

  return (
    <BottomSheet open={open} onClose={close} title={title} {...(lead ? { lead } : {})}>
      {confirm === 'delete' ? (
        <Button
          label={t('cooks.delete')}
          loading={remove.isPending}
          onPress={() => {
            remove.mutate(
              { cookId: cook.id, key: deleteKey },
              {
                onSuccess: () => {
                  close();
                  onDeleted?.();
                },
              },
            );
          }}
        />
      ) : confirm === 'block' ? (
        <Button
          label={t('person.block')}
          loading={block.isPending}
          onPress={() => {
            block.mutate(
              { userId: cook.authorId, key: blockKey },
              {
                onSuccess: () => {
                  close();
                  onDeleted?.();
                },
              },
            );
          }}
        />
      ) : cook.mine ? (
        <Button
          variant="outline"
          label={t('cooks.delete')}
          onPress={() => {
            setConfirm('delete');
          }}
        />
      ) : (
        <View style={styles.sheetActions}>
          <Button
            variant="outline"
            label={t('safety.report.cook')}
            onPress={() => {
              close();
              router.push({
                pathname: '/report',
                params: {
                  type: 'cook',
                  id: cook.id,
                  name: cook.caption,
                  userId: cook.authorId,
                },
              });
            }}
          />
          <Button
            variant="outline"
            label={t('person.blockName', { name: cook.authorName })}
            onPress={() => {
              setConfirm('block');
            }}
          />
        </View>
      )}
      {failed ? (
        <Text
          maxFontSizeMultiplier={2.0}
          role="alert"
          style={type(15, 'regular', { color: color.danger })}
        >
          {errorCode(remove.error ?? block.error) === 'network'
            ? t('errors.offlineText')
            : t('cooks.errorAction')}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bylineText: { flex: 1, minWidth: 0, gap: 1 },
  initial: { alignItems: 'center', justifyContent: 'center' },
  photo: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: color.fill,
  },
  pressedPhoto: { opacity: 0.94 },
  body: { gap: 10, paddingHorizontal: 2 },
  upper: { textTransform: 'uppercase' },
  recipe: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 32,
    maxWidth: '100%',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.brandTint,
  },
  shrink: { flexShrink: 1 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  pillOn: { backgroundColor: color.brandTint },
  yumWrap: { gap: 4 },
  pressed: { transform: [{ scale: 0.97 }] },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: size.touchMin },
  tile: { gap: 6 },
  tilePhoto: {
    aspectRatio: 4 / 5,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: color.fill,
    boxShadow: shadow.nav,
    marginBottom: 4,
  },
  tileYum: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  sheetActions: { gap: 10 },
});
