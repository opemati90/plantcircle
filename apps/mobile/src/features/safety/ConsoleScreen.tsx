import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { STAFF_ACTIONS, type StaffAction } from '../../lib/backend/types';
import { shortWhen } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../plans/queries';
import {
  useStaffAppealDecide,
  useStaffAppeals,
  useStaffAudit,
  useStaffCase,
  useStaffCities,
  useStaffCityMerge,
  useStaffDecide,
  useStaffQueue,
  useStaffViewMessages,
} from './queries';

type Tab = 'queue' | 'appeals' | 'cities' | 'audit';
const SEVERITY_TINT: Record<string, string> = {
  urgent: '#FFE8E5',
  high: '#FFF6E5',
  routine: color.fill,
};

/**
 * The safety console, as the Console design has it, built for the web: the queue by severity,
 * one case with the reporter's account (identity hidden), history, messages behind a reason,
 * and the decision with its reason; appeals for a second reviewer; the audit log.
 * The database refuses anyone without the staff role, so this screen only shapes what it returns.
 */
export default function ConsoleScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const staff = profile?.role === 'staff';
  const [tab, setTab] = useState<Tab>('queue');
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useStaffQueue(staff);
  const current = useStaffCase(selected);
  const appeals = useStaffAppeals(staff && tab === 'appeals');
  const audit = useStaffAudit(staff && tab === 'audit');
  const cities = useStaffCities(staff && tab === 'cities');
  const cityMerge = useStaffCityMerge();
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const [mergeReason, setMergeReason] = useState('');
  const [mergeKey, setMergeKey] = useState(newIdempotencyKey);
  useEffect(() => {
    setMergeKey(newIdempotencyKey());
  }, [mergeFrom, mergeInto, mergeReason]);
  const decide = useStaffDecide();
  const view = useStaffViewMessages();
  const appealDecide = useStaffAppealDecide();
  const [action, setAction] = useState<StaffAction | null>(null);
  const [reason, setReason] = useState('');
  const [rule, setRule] = useState('');
  const [days, setDays] = useState('7');
  const [viewReason, setViewReason] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  // The expiry is fixed with the key, so a retry of the same attempt carries the same request.
  const [untilAt, setUntilAt] = useState<string | null>(null);
  useEffect(() => {
    setKey(newIdempotencyKey());
    setUntilAt(
      action === 'suspend' || action === 'freeze_messages'
        ? new Date(Date.now() + Math.max(1, Number(days) || 7) * 86_400_000).toISOString()
        : null,
    );
  }, [action, reason, rule, days, selected]);
  // One key per appeal and answer for this reason text: a retry replays, a different appeal does not.
  const appealKeys = useRef(new Map<string, string>());
  const appealKey = (appealId: string, uphold: boolean) => {
    const attempt = `${appealId}:${uphold}:${appealReason.trim()}`;
    const found = appealKeys.current.get(attempt) ?? newIdempotencyKey();
    appealKeys.current.set(attempt, found);
    return found;
  };
  useEffect(() => {
    setAction(null);
    setReason('');
    setRule('');
    view.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (session === undefined || (session && profile === undefined)) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <View style={styles.pad}>
          <Skeleton width="100%" height={120} radius={radius.card} />
        </View>
      </View>
    );
  }
  if (!session) {
    return (
      <View style={styles.screen}>
        <EmptyState
          title={t('people.signedOut.title')}
          text={t('safety.consoleSignedOut')}
          actions={
            <Button
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/console' } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (!staff) {
    return (
      <View style={styles.screen}>
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
      </View>
    );
  }

  const wide = Platform.OS === 'web';
  const tabs: { id: Tab; label: string }[] = [
    { id: 'queue', label: t('safety.console.queue') },
    { id: 'appeals', label: t('safety.console.appeals') },
    { id: 'cities', label: t('safety.console.cities') },
    { id: 'audit', label: t('safety.console.audit') },
  ];

  const submit = () => {
    if (!selected || !action || !reason.trim()) return;
    decide.mutate({
      reportId: selected,
      action,
      reason: reason.trim(),
      rule: rule.trim() || null,
      until: untilAt,
      key,
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.pad,
          { paddingTop: insets.headerTop, paddingBottom: 60 + insets.bottom },
        ]}
      >
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text accessibilityRole="header" style={type(28, 'bold', { tracking: -0.9 })}>
              {t('safety.console.title')}
            </Text>
            <Text style={type(14, 'regular', { color: color.secondary })}>
              {t('safety.console.signedInAs', { name: profile.displayName })}
            </Text>
          </View>
          <View accessibilityRole="tablist" style={styles.tabs}>
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setTab(item.id);
                  }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={type(15, 'semibold', { color: active ? '#FFFFFF' : color.ink })}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {tab === 'queue' ? (
          <View style={[styles.columns, wide && styles.columnsWide]}>
            <View style={[styles.column, wide && styles.queueColumn]}>
              <Text accessibilityRole="header" style={type(17, 'semibold')}>
                {t('safety.console.queueLead')}
              </Text>
              {queue.isPending ? (
                <Skeleton width="100%" height={80} radius={radius.card} />
              ) : queue.isError ? (
                <InlineState
                  title={t('errors.serverTitle')}
                  text={t('errors.serverText')}
                  action={
                    <Button
                      variant="outline"
                      label={t('common.retry')}
                      onPress={() => void queue.refetch()}
                    />
                  }
                />
              ) : queue.data.length === 0 ? (
                <InlineState
                  title={t('safety.console.queueEmpty')}
                  text={t('safety.console.queueEmptyText')}
                />
              ) : (
                queue.data.map((row) => {
                  const active = selected === row.id;
                  return (
                    <Pressable
                      key={row.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.caseRef} · ${t(`safety.category.${row.category}`)}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setSelected(row.id);
                      }}
                      style={[styles.caseRow, active && styles.caseRowActive]}
                    >
                      <View style={styles.caseTop}>
                        <Text
                          style={[
                            type(12, 'bold', { tracking: 0.4 }),
                            styles.pill,
                            { backgroundColor: SEVERITY_TINT[row.severity] },
                          ]}
                        >
                          {t(`safety.severity.${row.severity}`).toUpperCase()}
                        </Text>
                        <Text style={type(13, 'regular', { color: color.secondary })}>
                          {shortWhen(row.createdAt, 'UTC')}
                        </Text>
                      </View>
                      <Text
                        style={type(16, 'semibold')}
                      >{`${row.caseRef} · ${t(`safety.category.${row.category}`)}`}</Text>
                      <Text
                        numberOfLines={1}
                        style={type(14, 'regular', { color: color.secondary })}
                      >
                        {`${t(`safety.target.${row.targetType}`)}${row.targetLabel ? ` · ${row.targetLabel}` : ''}`}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>

            <View style={[styles.column, wide && styles.caseColumn]}>
              {!selected ? (
                <InlineState
                  title={t('safety.console.pickCase')}
                  text={t('safety.console.pickCaseText')}
                />
              ) : current.isPending ? (
                <Skeleton width="100%" height={200} radius={radius.card} />
              ) : current.isError ? (
                <InlineState
                  title={t('errors.serverTitle')}
                  text={t('errors.serverText')}
                  action={
                    <Button
                      variant="outline"
                      label={t('common.retry')}
                      onPress={() => void current.refetch()}
                    />
                  }
                />
              ) : (
                <View style={styles.caseBody}>
                  <Text accessibilityRole="header" style={type(22, 'bold', { tracking: -0.6 })}>
                    {`${current.data.caseRef} · ${t(`safety.category.${current.data.category}`)}`}
                  </Text>
                  <Text style={type(14, 'regular', { color: color.secondary })}>
                    {t('safety.console.caseMeta', {
                      severity: t(`safety.severity.${current.data.severity}`),
                      due: shortWhen(current.data.slaDueAt, 'UTC'),
                      status: current.data.status,
                    })}
                  </Text>
                  <Text style={type(15, 'medium')}>
                    {`${t(`safety.target.${current.data.targetType}`)}: ${current.data.targetLabel ?? current.data.targetId}${current.data.targetUserName ? ` (${current.data.targetUserName})` : ''}`}
                  </Text>

                  <View style={styles.block}>
                    <Text
                      style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}
                    >
                      {t('safety.console.reportersAccount').toUpperCase()}
                    </Text>
                    <Text style={type(16, 'regular', { leading: 1.45 })}>
                      {current.data.details}
                    </Text>
                    <Text style={type(13, 'regular', { color: color.secondary })}>
                      {t('safety.console.reporterHidden', {
                        count: current.data.evidenceCount,
                      })}
                    </Text>
                  </View>

                  <View style={styles.block}>
                    <Text
                      style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}
                    >
                      {t('safety.console.history').toUpperCase()}
                    </Text>
                    {current.data.history.length === 0 ? (
                      <Text style={type(14, 'regular', { color: color.secondary })}>
                        {t('safety.console.historyEmpty')}
                      </Text>
                    ) : (
                      current.data.history.map((h, i) => (
                        <Text
                          key={i}
                          style={type(14, 'regular', { leading: 1.45 })}
                        >{`${shortWhen(h.when, 'UTC')} · ${h.what}`}</Text>
                      ))
                    )}
                  </View>

                  {current.data.targetType === 'message' ? (
                    <View style={styles.block}>
                      <Text
                        style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}
                      >
                        {t('safety.console.messages').toUpperCase()}
                      </Text>
                      <Text style={type(14, 'regular', { color: color.secondary })}>
                        {t('safety.console.messagesNeedReason')}
                      </Text>
                      <TextInput
                        accessibilityLabel={t('safety.console.viewReason')}
                        placeholder={t('safety.console.viewReason')}
                        placeholderTextColor={color.secondary}
                        value={viewReason}
                        onChangeText={setViewReason}
                        style={[styles.field, type(15)]}
                      />
                      <Button
                        variant="outline"
                        label={t('safety.console.viewMessages')}
                        disabled={!viewReason.trim()}
                        loading={view.isPending}
                        onPress={() => {
                          view.mutate({ reportId: current.data.id, reason: viewReason.trim() });
                        }}
                      />
                      {view.isError ? (
                        <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
                          {t('safety.error')}
                        </Text>
                      ) : null}
                      {view.data?.map((m) => (
                        <Text
                          key={m.id}
                          style={type(14, 'regular', { leading: 1.45 })}
                        >{`${m.senderName}: ${m.body}`}</Text>
                      ))}
                    </View>
                  ) : null}

                  {current.data.actions.length > 0 ? (
                    <View style={styles.block}>
                      <Text
                        style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}
                      >
                        {t('safety.console.decisionApplied').toUpperCase()}
                      </Text>
                      {current.data.actions.map((a) => (
                        <Text
                          key={a.id}
                          style={type(14, 'regular', { leading: 1.45 })}
                        >{`${t(`safety.action.${a.action}`)} · ${a.reason}`}</Text>
                      ))}
                      <Text style={type(13, 'regular', { color: color.secondary })}>
                        {t('safety.console.memberTold')}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.block}>
                      <Text
                        style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}
                      >
                        {t('safety.console.decision').toUpperCase()}
                      </Text>
                      <View
                        accessibilityRole="radiogroup"
                        accessibilityLabel={t('safety.console.decision')}
                        style={styles.actions}
                      >
                        {STAFF_ACTIONS.map((a) => {
                          const on = action === a;
                          return (
                            <Pressable
                              key={a}
                              accessibilityRole="radio"
                              aria-checked={on}
                              onPress={() => {
                                setAction(a);
                              }}
                              style={[styles.chip, on && styles.chipOn]}
                            >
                              <Text
                                style={type(14, 'semibold', {
                                  color: on ? '#FFFFFF' : color.ink,
                                })}
                              >
                                {t(`safety.action.${a}`)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {action === 'suspend' || action === 'freeze_messages' ? (
                        <TextInput
                          accessibilityLabel={t('safety.console.days')}
                          value={days}
                          onChangeText={setDays}
                          keyboardType="number-pad"
                          style={[styles.field, styles.short, type(15)]}
                        />
                      ) : null}
                      <TextInput
                        accessibilityLabel={t('safety.console.rule')}
                        placeholder={t('safety.console.rule')}
                        placeholderTextColor={color.secondary}
                        value={rule}
                        onChangeText={setRule}
                        style={[styles.field, type(15)]}
                      />
                      <TextInput
                        accessibilityLabel={t('safety.console.reason')}
                        placeholder={t('safety.console.reason')}
                        placeholderTextColor={color.secondary}
                        value={reason}
                        onChangeText={setReason}
                        multiline
                        textAlignVertical="top"
                        style={[
                          styles.field,
                          styles.tall,
                          type(15, 'regular', { leading: 1.4 }),
                        ]}
                      />
                      {decide.isError ? (
                        <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
                          {t('safety.error')}
                        </Text>
                      ) : null}
                      <Button
                        label={
                          action ? t('safety.console.apply') : t('safety.console.chooseAction')
                        }
                        disabled={!action || !reason.trim()}
                        loading={decide.isPending}
                        onPress={submit}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        ) : null}

        {tab === 'appeals' ? (
          <View style={styles.column}>
            <Text style={type(14, 'regular', { color: color.secondary })}>
              {t('safety.console.appealsLead')}
            </Text>
            {appeals.isPending ? (
              <Skeleton width="100%" height={80} radius={radius.card} />
            ) : appeals.isError ? (
              <InlineState
                title={t('errors.serverTitle')}
                text={t('errors.serverText')}
                action={
                  <Button
                    variant="outline"
                    label={t('common.retry')}
                    onPress={() => void appeals.refetch()}
                  />
                }
              />
            ) : appeals.data.length === 0 ? (
              <InlineState
                title={t('safety.console.appealsEmpty')}
                text={t('safety.console.appealsEmptyText')}
              />
            ) : (
              appeals.data.map((a) => (
                <View key={a.id} style={styles.caseRow}>
                  <Text
                    style={type(16, 'semibold')}
                  >{`${a.caseRef ?? t('safety.console.noCase')} · ${t(`safety.action.${a.action}`)} · ${a.memberName ?? ''}`}</Text>
                  <Text style={type(13, 'regular', { color: color.secondary })}>
                    {t('safety.console.originalBy', { name: a.originalActorName ?? '' })}
                  </Text>
                  <Text
                    style={type(14, 'regular', { leading: 1.45 })}
                  >{`${t('safety.console.originalReason')}: ${a.originalReason}`}</Text>
                  <Text
                    style={type(14, 'regular', { leading: 1.45 })}
                  >{`${t('safety.console.memberAppeal')}: “${a.statement}”`}</Text>
                  <TextInput
                    accessibilityLabel={t('safety.console.reason')}
                    placeholder={t('safety.console.reason')}
                    placeholderTextColor={color.secondary}
                    value={appealReason}
                    onChangeText={setAppealReason}
                    style={[styles.field, type(15)]}
                  />
                  <View style={styles.actions}>
                    <Button
                      variant="outline"
                      label={t('safety.console.uphold')}
                      disabled={!appealReason.trim()}
                      loading={appealDecide.isPending}
                      onPress={() => {
                        appealDecide.mutate({
                          appealId: a.id,
                          uphold: true,
                          reason: appealReason.trim(),
                          key: appealKey(a.id, true),
                        });
                      }}
                    />
                    <Button
                      label={t('safety.console.reverse')}
                      disabled={!appealReason.trim()}
                      loading={appealDecide.isPending}
                      onPress={() => {
                        appealDecide.mutate({
                          appealId: a.id,
                          uphold: false,
                          reason: appealReason.trim(),
                          key: appealKey(a.id, false),
                        });
                      }}
                    />
                  </View>
                  {appealDecide.isError ? (
                    <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
                      {t('safety.error')}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === 'cities' ? (
          <View style={styles.column}>
            <Text style={type(14, 'regular', { color: color.secondary })}>
              {t('safety.console.citiesLead')}
            </Text>
            {cities.isPending ? (
              <Skeleton width="100%" height={80} radius={radius.card} />
            ) : cities.isError ? (
              <InlineState
                title={t('errors.serverTitle')}
                text={t('errors.serverText')}
                action={
                  <Button
                    variant="outline"
                    label={t('common.retry')}
                    onPress={() => void cities.refetch()}
                  />
                }
              />
            ) : (
              <>
                {(['from', 'into'] as const).map((side) => (
                  <View key={side} style={styles.column}>
                    <Text accessibilityRole="header" style={type(15, 'semibold')}>
                      {side === 'from'
                        ? t('safety.console.mergeFrom')
                        : t('safety.console.mergeInto')}
                    </Text>
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel={
                        side === 'from'
                          ? t('safety.console.mergeFrom')
                          : t('safety.console.mergeInto')
                      }
                      style={styles.column}
                    >
                      {cities.data.map((c) => {
                        const selected = (side === 'from' ? mergeFrom : mergeInto) === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            accessibilityRole="radio"
                            aria-checked={selected}
                            onPress={() => {
                              if (side === 'from') setMergeFrom(c.id);
                              else setMergeInto(c.id);
                            }}
                            style={[styles.caseRow, selected && styles.caseRowActive]}
                          >
                            <Text
                              style={type(15, 'semibold')}
                            >{`${c.name} · ${c.countryCode}`}</Text>
                            <Text style={type(13, 'regular', { color: color.secondary })}>
                              {t('safety.console.cityCounts', {
                                members: c.members,
                                plans: c.plans,
                                circles: c.circles,
                              })}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <TextInput
                  accessibilityLabel={t('safety.console.mergeReason')}
                  placeholder={t('safety.console.mergeReason')}
                  placeholderTextColor={color.secondary}
                  value={mergeReason}
                  onChangeText={setMergeReason}
                  style={[styles.field, type(15)]}
                />
                <Button
                  label={t('safety.console.mergeAction')}
                  disabled={
                    !mergeFrom ||
                    !mergeInto ||
                    mergeFrom === mergeInto ||
                    mergeReason.trim().length < 3
                  }
                  loading={cityMerge.isPending}
                  onPress={() => {
                    if (!mergeFrom || !mergeInto) return;
                    cityMerge.mutate(
                      {
                        fromId: mergeFrom,
                        intoId: mergeInto,
                        reason: mergeReason.trim(),
                        key: mergeKey,
                      },
                      {
                        onSuccess: () => {
                          setMergeFrom(null);
                          setMergeReason('');
                        },
                      },
                    );
                  }}
                />
                {cityMerge.isSuccess ? (
                  <Text role="status" style={type(14, 'regular', { color: color.brand })}>
                    {t('safety.console.mergeDone', cityMerge.data)}
                  </Text>
                ) : null}
                {cityMerge.isError ? (
                  <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
                    {t('errors.serverText')}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {tab === 'audit' ? (
          <View style={styles.column}>
            <Text style={type(14, 'regular', { color: color.secondary })}>
              {t('safety.console.auditLead')}
            </Text>
            {audit.isPending ? (
              <Skeleton width="100%" height={80} radius={radius.card} />
            ) : audit.isError ? (
              <InlineState
                title={t('errors.serverTitle')}
                text={t('errors.serverText')}
                action={
                  <Button
                    variant="outline"
                    label={t('common.retry')}
                    onPress={() => void audit.refetch()}
                  />
                }
              />
            ) : audit.data.length === 0 ? (
              <InlineState
                title={t('safety.console.auditEmpty')}
                text={t('safety.console.auditEmptyText')}
              />
            ) : (
              audit.data.map((row) => (
                <View key={row.id} style={styles.auditRow}>
                  <Text style={type(13, 'regular', { color: color.secondary })}>
                    {shortWhen(row.createdAt, 'UTC')}
                  </Text>
                  <Text
                    style={type(15, 'semibold')}
                  >{`${row.actorName ?? row.actorRole} · ${row.action}`}</Text>
                  {row.reason ? (
                    <Text style={type(14, 'regular', { color: color.secondary, leading: 1.4 })}>
                      {row.reason}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  pad: { paddingHorizontal: 24, gap: 20 },
  head: { gap: 14 },
  headText: { gap: 2 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  tabActive: { backgroundColor: color.ink },
  columns: { gap: 20 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { gap: 12, minWidth: 0 },
  queueColumn: { flex: 2 },
  caseColumn: { flex: 3 },
  caseRow: {
    gap: 6,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  caseRowActive: { borderColor: color.ink, backgroundColor: color.fill },
  caseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  caseBody: { gap: 12 },
  block: { gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: extra.cardBorder },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  short: { width: 100 },
  tall: { minHeight: 96, paddingVertical: 12 },
  auditRow: {
    gap: 2,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
});
