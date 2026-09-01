import type { ManualGrant } from '@invoice-saas/shared';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateGrant } from '../../features/admin/use-admin';
import { HttpError } from '../../lib/http-error';
import { toUserMessage } from '../../lib/error-message';
import { FormField } from '../form/field';
import { Button, Input, Select, Textarea } from '../ui';
import { addMonthsISODate, todayISODate } from './grant-dates';

const PRESETS = [1, 2, 3, 6, 12] as const;

/**
 * "Issue a manual grant" form (backlog `L2.4.1`). One `POST /admin/grants` keyed
 * on the tenant's email (already resolved by the surrounding Grants view). Tier is
 * `BASIC` | `PREMIUM`; the quick presets set `endDate` to N months from the start.
 * `note` is the free-text "amount received" record. On success the parent reloads
 * the tenant's grants and fires the toast (`X.7.9`).
 */
export function GrantForm({
  email,
  onIssued,
}: {
  email: string;
  onIssued: (grant: ManualGrant) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateGrant();

  const [tier, setTier] = useState<'BASIC' | 'PREMIUM'>('BASIC');
  const [startDate, setStartDate] = useState(todayISODate());
  const [endDate, setEndDate] = useState(addMonthsISODate(todayISODate(), 1));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const dateOrderInvalid = endDate < startDate;

  const applyPreset = (months: number) => {
    const base = startDate || todayISODate();
    setStartDate(base);
    setEndDate(addMonthsISODate(base, months));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (dateOrderInvalid) return;
    try {
      const grant = await create.mutateAsync({
        email,
        tier,
        startDate,
        endDate,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setNote('');
      onIssued(grant);
    } catch (err) {
      setError(err instanceof HttpError && err.message ? err.message : toUserMessage(err));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t('admin.grants.tier')}
          </span>
          <Select
            aria-label={t('admin.grants.tier')}
            value={tier}
            onValueChange={(v) => setTier(v as 'BASIC' | 'PREMIUM')}
            options={[
              { value: 'BASIC', label: 'Basic' },
              { value: 'PREMIUM', label: 'Premium' },
            ]}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            {t('admin.grants.presets')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((m) => (
              <Button
                key={m}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(m)}
              >
                {t('admin.grants.presetMonths', { count: m })}
              </Button>
            ))}
          </div>
        </div>

        <FormField label={t('admin.grants.startDate')}>
          {({ controlProps }) => (
            <Input
              {...controlProps}
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          )}
        </FormField>

        <FormField
          label={t('admin.grants.endDate')}
          error={dateOrderInvalid ? t('admin.grants.endBeforeStart') : undefined}
        >
          {({ controlProps }) => (
            <Input
              {...controlProps}
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          )}
        </FormField>
      </div>

      <FormField label={t('admin.grants.note')} hint={t('admin.grants.noteHint')}>
        {({ controlProps }) => (
          <Textarea
            {...controlProps}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.grants.notePlaceholder')}
          />
        )}
      </FormField>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" isLoading={create.isPending} disabled={dateOrderInvalid}>
          {t('admin.grants.issue')}
        </Button>
      </div>
    </form>
  );
}
