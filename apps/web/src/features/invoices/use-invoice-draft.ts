import { useCallback, useEffect, useRef, useState } from 'react';
import type { InvoiceInput, InvoiceResponse } from '@invoice-saas/shared';

import { useCreateInvoiceDraft, useFinalizeInvoice, useUpdateInvoiceDraft } from './use-invoices';

/**
 * Compose-time autosave (backlog 4.2.6). The form pushes its whole value into
 * `queueSave` on every change; once the user has entered something real this
 * debounce-persists it as a server `DRAFT` — `POST /invoices` the first time,
 * `PATCH` after. The draft carries no number; `finalize()` is the first *explicit*
 * Save that allocates one and flips the row to `ISSUED` (decision D20).
 *
 * The debounce, write serialisation and "chase a change that landed mid-save" all
 * live inside one `setTimeout` closure so there is no cross-callback recursion and
 * no setState in an effect body — the compose screen stays within the project's
 * hook-rules lint. The server echo (`serverInvoice`) is the source of truth for
 * totals (4.2.3); the form falls back to a local compute only between saves.
 */

export type DraftSaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 1200;

/** Don't create a draft row for a form the user only glanced at. */
function hasContent(value: InvoiceInput): boolean {
  return (
    value.clientId !== null ||
    value.lineItems.length > 0 ||
    (value.notes ?? '') !== '' ||
    (value.reference ?? '') !== '' ||
    (value.paymentMethod ?? '') !== '' ||
    (value.creditNoteRef ?? '') !== '' ||
    value.newTemplate !== null
  );
}

export interface UseInvoiceDraftResult {
  draftId: string | null;
  saveState: DraftSaveState;
  serverInvoice: InvoiceResponse | null;
  /** Push the latest form value; a save fires once it settles. */
  queueSave: (value: InvoiceInput) => void;
  /** Persist + issue. Creates the draft first if autosave hasn't yet. */
  finalize: (value: InvoiceInput) => Promise<InvoiceResponse>;
  isFinalizing: boolean;
}

export function useInvoiceDraft(): UseInvoiceDraftResult {
  const { mutateAsync: createDraft, isPending: creatingDraft } = useCreateInvoiceDraft();
  const { mutateAsync: updateDraft } = useUpdateInvoiceDraft();
  const { mutateAsync: finalizeMut, isPending: finalizing } = useFinalizeInvoice();

  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<DraftSaveState>('idle');
  const [serverInvoice, setServerInvoice] = useState<InvoiceResponse | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<InvoiceInput | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const lastSavedJsonRef = useRef<string | null>(null);

  const queueSave = useCallback(
    (value: InvoiceInput) => {
      pendingRef.current = value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(function run() {
        const payload = pendingRef.current;
        if (!payload || !hasContent(payload)) return;
        if (inFlightRef.current) {
          timerRef.current = setTimeout(run, 300);
          return;
        }
        const jsonStr = JSON.stringify(payload);
        if (jsonStr === lastSavedJsonRef.current) return;

        inFlightRef.current = true;
        setSaveState('saving');
        const write = draftIdRef.current
          ? updateDraft({ id: draftIdRef.current, input: payload })
          : createDraft(payload);
        write
          .then((saved) => {
            draftIdRef.current = saved.id;
            lastSavedJsonRef.current = jsonStr;
            setDraftId(saved.id);
            setServerInvoice(saved);
            setSaveState('saved');
          })
          .catch(() => setSaveState('error'))
          .finally(() => {
            inFlightRef.current = false;
            if (
              pendingRef.current &&
              JSON.stringify(pendingRef.current) !== lastSavedJsonRef.current
            ) {
              timerRef.current = setTimeout(run, 0);
            }
          });
      }, DEBOUNCE_MS);
    },
    [createDraft, updateDraft],
  );

  const finalize = useCallback(
    async (current: InvoiceInput): Promise<InvoiceResponse> => {
      if (timerRef.current) clearTimeout(timerRef.current);
      let id = draftIdRef.current;
      if (!id) {
        const created = await createDraft(current);
        id = created.id;
        draftIdRef.current = id;
        setDraftId(id);
      }
      const issued = await finalizeMut({ id, input: current });
      lastSavedJsonRef.current = JSON.stringify(current);
      setServerInvoice(issued);
      setSaveState('saved');
      return issued;
    },
    [createDraft, finalizeMut],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    draftId,
    saveState,
    serverInvoice,
    queueSave,
    finalize,
    isFinalizing: finalizing || creatingDraft,
  };
}
