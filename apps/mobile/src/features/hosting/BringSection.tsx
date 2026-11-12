import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { BottomSheet } from '../../components/parts';
import { Stepper } from '../../components/Stepper';
import { color, extra, radius, size, type } from '../../components/theme';
import type { BringItem } from '../../lib/backend/types';
import { newIdempotencyKey } from '../plans/queries';
import { useAddBringItem, useRemoveBringItem, useUpdateBringItem } from './queries';

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;

type Sheet = { kind: 'add' } | { kind: 'edit'; item: BringItem } | null;

/**
 * What guests can bring, as the host manages it. Items change while the Plan is live; a claimed
 * item cannot be removed, and cannot drop below what has already been brought.
 */
export function BringSection({
  planId,
  items,
  editable,
}: {
  planId: string;
  items: BringItem[];
  editable: boolean;
}) {
  const { t } = useTranslation();
  const add = useAddBringItem(planId);
  const update = useUpdateBringItem(planId);
  const remove = useRemoveBringItem(planId);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState(1);
  // The key for a save follows what it saves, so a retry of the same save replays it.
  const saveKey = useRef(newIdempotencyKey());
  const removeKeys = useRef(new Map<string, string>());
  // A changed label or quantity is a different save, so it gets a new key.
  useEffect(() => {
    saveKey.current = newIdempotencyKey();
  }, [label, quantity]);

  const open = (next: Sheet) => {
    setSheet(next);
    setLabel(next?.kind === 'edit' ? next.item.label : '');
    setQuantity(next?.kind === 'edit' ? next.item.quantity : 1);
  };

  const trimmed = label.trim();
  // Counted in characters, as the database counts them, so emoji and accents are not penalised.
  const valid = trimmed.length > 0 && Array.from(trimmed).length <= 60;
  const save = () => {
    if (!valid || sheet === null) return;
    const item = { label: trimmed, quantity };
    const done = {
      onSuccess: () => {
        setSheet(null);
        saveKey.current = newIdempotencyKey();
      },
    };
    if (sheet.kind === 'add') {
      add.mutate({ item, key: saveKey.current }, done);
    } else {
      update.mutate({ itemId: sheet.item.id, item, key: saveKey.current }, done);
    }
  };

  const drop = (item: BringItem) => {
    const key = removeKeys.current.get(item.id) ?? newIdempotencyKey();
    removeKeys.current.set(item.id, key);
    remove.mutate(
      { itemId: item.id, key },
      {
        onSuccess: () => {
          removeKeys.current.delete(item.id);
        },
      },
    );
  };

  const busy = add.isPending || update.isPending;

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={type(20, 'semibold', { tracking: -0.4 })}>
        {t('host.bringTitle')}
      </Text>
      {!editable ? (
        <Text style={type(15, 'regular', { color: color.secondary })}>{t('host.bringLocked')}</Text>
      ) : null}
      {items.length === 0 ? (
        <Text style={type(15, 'regular', { color: color.secondary })}>{t('host.bringEmpty')}</Text>
      ) : (
        items.map((item) => {
          const claimed = item.claimedCount;
          return (
            <View key={item.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={type(17, 'semibold', { tracking: -0.3 })}>{item.label}</Text>
                <Text style={type(15, 'regular', { color: color.secondary })}>
                  {t('host.bringBrought', { claimed, quantity: item.quantity })}
                </Text>
                {claimed > 0 ? (
                  <Text style={type(14, 'regular', { color: color.secondary })}>
                    {item.claimedBy.join(', ')}
                  </Text>
                ) : null}
              </View>
              {editable ? (
                <View style={styles.actions}>
                  <Button
                    variant="outline"
                    label={t('host.bringEdit')}
                    accessibilityLabel={`${t('host.bringEdit')} ${item.label}`}
                    onPress={() => {
                      open({ kind: 'edit', item });
                    }}
                  />
                  <Button
                    variant="outline"
                    label={t('host.bringRemove')}
                    accessibilityLabel={`${t('host.bringRemove')} ${item.label}`}
                    disabled={claimed > 0 || remove.isPending}
                    loading={remove.isPending && remove.variables.itemId === item.id}
                    onPress={() => {
                      drop(item);
                    }}
                  />
                </View>
              ) : null}
              {claimed > 0 ? (
                <Text style={type(13, 'regular', { color: color.secondary })}>
                  {t('host.bringTaken')}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
      {editable ? (
        <Button
          variant="outline"
          label={t('host.bringAdd')}
          onPress={() => {
            open({ kind: 'add' });
          }}
        />
      ) : null}
      {remove.isError ? (
        <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
          {t('host.error')}
        </Text>
      ) : null}

      <BottomSheet
        open={sheet !== null}
        onClose={() => {
          setSheet(null);
        }}
        title={sheet?.kind === 'edit' ? t('host.bringSheetEdit') : t('host.bringSheetAdd')}
      >
        <View style={styles.form}>
          <Text style={type(14, 'semibold', { color: color.secondary })}>{t('host.bringLabel')}</Text>
          <TextInput
            accessibilityLabel={t('host.bringLabel')}
            value={label}
            onChangeText={setLabel}
            maxLength={120}
            style={[styles.field, type(17)]}
          />
          <Text style={type(14, 'semibold', { color: color.secondary })}>{t('host.bringQuantity')}</Text>
          <Stepper
            value={quantity}
            min={MIN_QUANTITY}
            max={MAX_QUANTITY}
            label={t('host.bringQuantity')}
            decreaseLabel={t('learn.fewer')}
            increaseLabel={t('learn.more')}
            onChange={setQuantity}
          />
          {add.isError || update.isError ? (
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('host.error')}
            </Text>
          ) : null}
          <Button
            label={t('host.bringSave')}
            disabled={!valid}
            loading={busy}
            onPress={save}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingTop: 16 },
  item: {
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  itemText: { gap: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  form: { gap: 12 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
});
