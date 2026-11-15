import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { CameraIcon, ChevronRightIcon, CloseIcon, ImageIcon } from '../../components/icons';
import { BottomSheet, EmptyState, InlineState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { ScreenHeader } from '../../components/ScreenHeader';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import {
  captionLimit,
  COOK_KINDS,
  type CookKind,
  type PreparedPhoto,
} from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';
import { useRecipes } from '../learn/queries';
import { newIdempotencyKey, useMyCircles } from '../plans/queries';
import { pickCookPhoto, type PickSource } from './preparePhoto';
import { Toggle } from '../../components/Toggle';
import { features } from '../../lib/features';
import { themeLabel } from './challengeThemes';
import { useCircleChallenge, useShareCook } from './queries';

const ALT_MAX = 200;

const isKind = (value: string | undefined): value is CookKind =>
  (COOK_KINDS as readonly string[]).includes(value ?? '');

/**
 * Share with your Circle: the Circle it goes to first (so nobody posts to the wrong place), what
 * kind of post it is, then (for what you cooked) the photo, one line, an optional recipe and an
 * optional photo description. Tips, questions and finds take more words and an optional photo.
 */
export default function ComposerScreen() {
  const params = useLocalSearchParams<{
    circle?: string;
    recipe?: string;
    challenge?: string;
    kind?: string;
  }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useScreenInsets();
  const { session } = useAuth();
  const circles = useMyCircles();
  const recipes = useRecipes('');
  const share = useShareCook();

  const memberOf = circles.data ?? [];
  const [chosenCircle, setChosenCircle] = useState<string | null>(null);
  // Started from a Circle, or from a recipe ("I cooked this"): that Circle is the default.
  const recipeCircle = recipes.data?.find((r) => r.id === params.recipe)?.circleId;
  const suggested = params.circle ?? recipeCircle;
  const fromParam = memberOf.some((c) => c.id === suggested) ? (suggested ?? null) : null;
  const circleId =
    chosenCircle ?? fromParam ?? (memberOf.length === 1 ? (memberOf[0]?.id ?? null) : null);
  const circle = memberOf.find((c) => c.id === circleId) ?? null;

  // The challenge and a recipe are for what you cooked, so they start a Cooked post.
  const [kind, setKind] = useState<CookKind>(
    params.challenge === '1' || params.recipe
      ? 'cooked'
      : isKind(params.kind)
        ? params.kind
        : 'cooked',
  );
  const cooked = kind === 'cooked';
  const limit = captionLimit(kind);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [picking, setPicking] = useState<PickSource | null>(null);
  const [pickProblem, setPickProblem] = useState<'denied' | 'failed' | null>(null);
  const [caption, setCaption] = useState('');
  const [alt, setAlt] = useState('');
  const [describing, setDescribing] = useState(false);
  const [recipeId, setRecipeId] = useState<string | null>(params.recipe ?? null);
  const [recipePicker, setRecipePicker] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const challenge = useCircleChallenge(circleId, circleId !== null);
  const [entering, setEntering] = useState(params.challenge === '1');
  // The week this draft was started in, kept even if the week turns while it is open: a post
  // never moves to a new theme on its own. If it has ended, sharing says so and asks again.
  const [draftWeek, setDraftWeek] = useState<{ circleId: string; week: string } | null>(null);
  useEffect(() => {
    if (challenge.data && circleId && draftWeek?.circleId !== circleId) {
      setDraftWeek({ circleId, week: challenge.data.weekStart });
    }
  }, [challenge.data, circleId, draftWeek]);
  const challengeWeek =
    cooked && entering && draftWeek && draftWeek.circleId === circleId ? draftWeek.week : null;

  // A changed post is a new one, so the key follows the content; a retry keeps it. The upload
  // finishing is not a change: the same key covers the upload and the share that follows.
  const payload = JSON.stringify({
    circleId,
    kind,
    caption,
    alt,
    recipeId,
    challengeWeek,
    photo: photo?.previewUri,
  });
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [payload]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const header = <ScreenHeader backLabel={t('common.back')} onBack={goBack} />;

  if (!session) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          title={t('cooks.signInTitle')}
          text={t('cooks.signInText')}
          actions={
            <Button
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/cook/new' } });
              }}
            />
          }
        />
      </View>
    );
  }

  const choose = async (source: PickSource) => {
    setPickProblem(null);
    setPicking(source);
    try {
      const result = await pickCookPhoto(source);
      if (result.status === 'denied') setPickProblem('denied');
      if (result.status === 'picked') {
        setPhoto(result.photo);
        setUploadedPath(null);
      }
    } catch {
      setPickProblem('failed');
    } finally {
      setPicking(null);
    }
  };

  const linkable = (recipes.data ?? []).filter((r) => r.circleId === circleId);
  const linked = (recipes.data ?? []).find((r) => r.id === recipeId) ?? null;
  const trimmed = caption.trim();
  const over = caption.length - limit;
  const ready = Boolean(circleId && (photo || !cooked) && trimmed.length > 0 && over <= 0);

  const send = () => {
    if (!ready || !circleId) return;
    share.mutate(
      {
        kind,
        photo,
        uploadedPath,
        onUploaded: setUploadedPath,
        circleId,
        recipeId: cooked && linked && linked.circleId === circleId ? linked.id : null,
        caption: trimmed,
        photoAlt: photo ? alt.trim() || null : null,
        challengeWeek,
        key,
      },
      {
        onSuccess: (id) => {
          router.replace({ pathname: '/cook/[id]', params: { id, shared: '1' } });
        },
      },
    );
  };

  const shareError = share.isError ? errorCode(share.error) : null;
  const captionLabel =
    kind === 'tip'
      ? t('cooks.captionTip')
      : kind === 'question'
        ? t('cooks.captionQuestion')
        : kind === 'find'
          ? t('cooks.captionFind')
          : t('cooks.captionLabel');
  const captionPlaceholder =
    kind === 'tip'
      ? t('cooks.placeholderTip')
      : kind === 'question'
        ? t('cooks.placeholderQuestion')
        : kind === 'find'
          ? t('cooks.placeholderFind')
          : t('cooks.captionPlaceholder');

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {cooked ? t('cooks.composeTitle') : t('cooks.composeTitleOther')}
        </Text>

        {/* Where it goes, before anything else. */}
        {circles.isPending ? (
          <Skeleton width="100%" height={44} radius={radius.pill} />
        ) : circles.isError ? (
          <InlineState
            title={t('errors.serverTitle')}
            text={t('errors.serverText')}
            action={
              <Button
                variant="outline"
                label={t('common.retry')}
                onPress={() => void circles.refetch()}
              />
            }
          />
        ) : memberOf.length === 0 ? (
          <View style={styles.noCircle}>
            <Text maxFontSizeMultiplier={2.0} style={type(22, 'bold', { tracking: -0.5 })}>
              {t('cooks.noCircleTitle')}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}
            >
              {t('cooks.noCircleText')}
            </Text>
            <Button
              label={t('cooks.findCircle')}
              onPress={() => {
                router.replace('/explore');
              }}
            />
          </View>
        ) : memberOf.length === 1 && circle ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'medium', { color: color.secondary })}
          >
            {t('cooks.sharingWith', { circle: circle.name })}
          </Text>
        ) : (
          <View style={styles.field}>
            <Text maxFontSizeMultiplier={2.0} style={styles.label}>
              {t('cooks.circleLabel')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="radiogroup"
              accessibilityLabel={t('cooks.circleLabel')}
              contentContainerStyle={styles.chips}
            >
              {memberOf.map((option) => {
                const selected = option.id === circleId;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    aria-checked={selected}
                    onPress={() => {
                      setChosenCircle(option.id);
                    }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(15, selected ? 'semibold' : 'medium', {
                        color: selected ? color.surface : color.ink,
                      })}
                    >
                      {option.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {memberOf.length > 0 ? (
          <>
            <View style={styles.field}>
              <Text maxFontSizeMultiplier={2.0} style={styles.label}>
                {t('cooks.kindLabel')}
              </Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('cooks.kindLabel')}
                style={styles.kinds}
              >
                {COOK_KINDS.map((option) => {
                  const selected = option === kind;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      aria-checked={selected}
                      onPress={() => {
                        setKind(option);
                      }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text
                        maxFontSizeMultiplier={2.0}
                        style={type(15, selected ? 'semibold' : 'medium', {
                          color: selected ? color.surface : color.ink,
                        })}
                      >
                        {t(`cooks.kinds.${option}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {photo ? (
              <View style={styles.photo}>
                <Photo
                  source={{ uri: photo.previewUri }}
                  alt={alt.trim() || t('cooks.yourPhoto')}
                />
                <View style={styles.photoActions}>
                  {!cooked ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('cooks.removePhoto')}
                      onPress={() => {
                        setPhoto(null);
                        setUploadedPath(null);
                        setAlt('');
                      }}
                      style={styles.glass}
                    >
                      <CloseIcon size={16} strokeWidth={2.2} color="#FFFFFF" />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('cooks.changePhoto')}
                    onPress={() => void choose('library')}
                    style={styles.glass}
                  >
                    <ImageIcon size={16} strokeWidth={2} color="#FFFFFF" />
                    <Text
                      maxFontSizeMultiplier={1.6}
                      style={type(14, 'semibold', { color: '#FFFFFF' })}
                    >
                      {t('cooks.change')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : !cooked ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void choose('library')}
                disabled={picking !== null}
                style={styles.row}
              >
                <ImageIcon size={18} color={color.secondary} />
                <Text maxFontSizeMultiplier={2.0} style={[type(16, 'medium'), styles.grow]}>
                  {t('cooks.addPhotoOptional')}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyText}>
                  <Text
                    maxFontSizeMultiplier={1.6}
                    style={type(20, 'bold', { tracking: -0.4, leading: 1.2 })}
                  >
                    {t('cooks.addPhotoTitle')}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={2.0}
                    style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}
                  >
                    {t('cooks.addPhotoText')}
                  </Text>
                </View>
                <View style={styles.emptyButtons}>
                  <Button
                    label={t('cooks.takePhoto')}
                    icon={<CameraIcon size={18} color={color.surface} />}
                    loading={picking === 'camera'}
                    disabled={picking !== null}
                    onPress={() => void choose('camera')}
                  />
                  <Button
                    variant="outline"
                    label={t('cooks.choosePhoto')}
                    icon={<ImageIcon size={18} />}
                    loading={picking === 'library'}
                    disabled={picking !== null}
                    onPress={() => void choose('library')}
                  />
                </View>
              </View>
            )}
            {pickProblem ? (
              <View style={styles.notice} role="alert">
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(15, 'regular', { color: color.danger, leading: 1.45 })}
                >
                  {pickProblem === 'denied' ? t('cooks.photoDenied') : t('cooks.photoFailed')}
                </Text>
                {pickProblem === 'denied' ? (
                  <Button
                    variant="outline"
                    label={t('cooks.openSettings')}
                    onPress={() => void Linking.openSettings()}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.field}>
              <Text maxFontSizeMultiplier={2.0} style={styles.label}>
                {captionLabel}
              </Text>
              <TextInput
                maxFontSizeMultiplier={2.0}
                accessibilityLabel={captionLabel}
                placeholder={captionPlaceholder}
                placeholderTextColor={color.controlOff}
                value={caption}
                onChangeText={setCaption}
                // Up to the longest any kind takes; a Cooked post shows what is too much.
                maxLength={captionLimit('tip')}
                multiline
                style={[styles.input, type(17), !cooked && styles.inputTall]}
              />
              {over > 0 ? (
                <Text
                  maxFontSizeMultiplier={2.0}
                  role="alert"
                  style={type(13, 'semibold', { color: color.danger })}
                >
                  {t('cooks.tooLong', { count: over })}
                </Text>
              ) : caption.length > limit - 20 ? (
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(13, 'regular', { color: color.secondary })}
                >
                  {t('cooks.charactersLeft', { count: limit - caption.length })}
                </Text>
              ) : null}
            </View>

            {cooked && challenge.data ? (
              <Toggle
                label={t('cooks.forChallenge', {
                  theme: themeLabel(t, challenge.data.theme, challenge.data.weekStart),
                })}
                note={t('cooks.forChallengeNote')}
                value={entering}
                onValueChange={setEntering}
              />
            ) : null}

            {cooked && features.recipes ? (
              <>
                <View style={styles.field}>
                  <Text maxFontSizeMultiplier={2.0} style={styles.label}>
                    {t('cooks.recipeLabel')}
                  </Text>
                  {linked ? (
                    <View style={styles.linked}>
                      <Text
                        maxFontSizeMultiplier={2.0}
                        numberOfLines={2}
                        style={[type(16, 'semibold', { color: color.brand }), styles.grow]}
                      >
                        {linked.title}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('cooks.unlinkRecipe', { title: linked.title })}
                        onPress={() => {
                          setRecipeId(null);
                        }}
                        style={styles.unlink}
                      >
                        <CloseIcon size={16} strokeWidth={2.4} color={color.brand} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setRecipePicker(true);
                      }}
                      style={styles.row}
                    >
                      <Text
                        maxFontSizeMultiplier={2.0}
                        style={[type(16, 'medium'), styles.grow]}
                      >
                        {t('cooks.linkRecipe')}
                      </Text>
                      <ChevronRightIcon size={16} strokeWidth={2.2} color={color.secondary} />
                    </Pressable>
                  )}
                  {linked && linked.circleId !== circleId ? (
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(13, 'regular', { color: color.secondary })}
                    >
                      {t('cooks.recipeOtherCircle')}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

            {!photo ? null : describing ? (
              <View style={styles.field}>
                <Text maxFontSizeMultiplier={2.0} style={styles.label}>
                  {t('cooks.altLabel')}
                </Text>
                <TextInput
                  maxFontSizeMultiplier={2.0}
                  accessibilityLabel={t('cooks.altLabel')}
                  placeholder={t('cooks.altPlaceholder')}
                  placeholderTextColor={color.controlOff}
                  value={alt}
                  onChangeText={setAlt}
                  maxLength={ALT_MAX}
                  multiline
                  style={[styles.input, type(16)]}
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDescribing(true);
                }}
                style={styles.textLink}
              >
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(15, 'semibold', { color: color.secondary })}
                >
                  {t('cooks.describePhoto')}
                </Text>
              </Pressable>
            )}

            {shareError ? (
              <Text
                maxFontSizeMultiplier={2.0}
                role="alert"
                style={type(15, 'regular', { color: color.danger, leading: 1.45 })}
              >
                {shareError === 'rate_limited'
                  ? t('cooks.errorRateLimited')
                  : shareError === 'challenge_ended'
                    ? t('cooks.errorChallengeEnded')
                    : shareError === 'suspended'
                      ? t('cooks.errorPaused')
                      : shareError === 'network'
                        ? t('cooks.errorOffline')
                        : t('cooks.errorShare')}
              </Text>
            ) : null}
            {shareError === 'challenge_ended' ? (
              <Button
                variant="outline"
                label={t('cooks.challengeNewWeek')}
                onPress={() => {
                  void challenge.refetch().then((next) => {
                    if (next.data && circleId) {
                      setDraftWeek({ circleId, week: next.data.weekStart });
                    }
                    // Joining the new week's challenge is the member's choice.
                    setEntering(false);
                    share.reset();
                  });
                }}
              />
            ) : null}

            <Button
              label={
                circle
                  ? share.isError
                    ? t('common.tryAgain')
                    : t('cooks.shareWith', { circle: circle.name })
                  : t('cooks.chooseCircleFirst')
              }
              loading={share.isPending}
              disabled={!ready}
              onPress={send}
            />
            {!ready && circle ? (
              <Text
                maxFontSizeMultiplier={2.0}
                style={[type(13, 'regular', { color: color.secondary }), styles.center]}
              >
                {cooked && !photo
                  ? t('cooks.needPhoto')
                  : over > 0
                    ? t('cooks.tooLong', { count: over })
                    : cooked
                      ? t('cooks.needCaption')
                      : t('cooks.needText')}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <BottomSheet
        open={recipePicker}
        onClose={() => {
          setRecipePicker(false);
        }}
        title={t('cooks.recipePickerTitle')}
        {...(circle ? { lead: t('cooks.recipePickerLead', { circle: circle.name }) } : {})}
      >
        {recipes.isPending ? (
          <Skeleton width="100%" height={56} radius={radius.card} />
        ) : linkable.length === 0 ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}
          >
            {t('cooks.recipePickerEmpty')}
          </Text>
        ) : (
          <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerContent}>
            {linkable.map((recipe) => (
              <Pressable
                key={recipe.id}
                accessibilityRole="button"
                onPress={() => {
                  setRecipeId(recipe.id);
                  setRecipePicker(false);
                }}
                style={styles.row}
              >
                <View style={styles.grow}>
                  <Text maxFontSizeMultiplier={2.0} style={type(16, 'semibold')}>
                    {recipe.title}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={2.0}
                    style={type(13, 'regular', { color: color.secondary })}
                  >
                    {recipe.authorName ?? t('circles.requests.someone')}
                  </Text>
                </View>
                <ChevronRightIcon size={16} strokeWidth={2.2} color={color.secondary} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 16, gap: 20 },
  label: { ...type(14, 'semibold', { color: color.secondary }) },
  field: { gap: 8 },
  chips: { gap: 8, paddingRight: 24 },
  chip: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  chipSelected: { backgroundColor: color.ink },
  photo: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: color.fill,
  },
  photoActions: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputTall: { minHeight: 120 },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: extra.glassDark,
  },
  empty: {
    gap: 20,
    padding: 24,
    borderRadius: radius.card,
    backgroundColor: color.fill,
  },
  emptyText: { gap: 6 },
  emptyButtons: { gap: 10 },
  notice: { gap: 10 },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    textAlignVertical: 'top',
    color: color.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  linked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: radius.control,
    backgroundColor: color.brandTint,
  },
  unlink: {
    width: size.touchMin,
    height: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, minWidth: 0 },
  textLink: { minHeight: size.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  center: { textAlign: 'center' },
  noCircle: { gap: 12, paddingTop: 8 },
  pickerList: { maxHeight: 360 },
  pickerContent: { gap: 10 },
});
