import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeleteAccountInput } from '@invoice-saas/shared';

import { clearAccessToken } from '../../lib/access-token';
import { apiFetch, apiFetchBlob } from '../../lib/api-client';
import { authKeys } from '../auth/use-auth';

/** Hand a fetched blob to the browser as a download with the given fallback name. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Account-level self-service (backlog X.4.4 / X.4.5): download a full data export,
 * or permanently delete the account. Delete clears the session cache and the
 * in-memory access token exactly like logout — the caller then redirects to
 * `/login?deleted=1`.
 */
export function useExportMyData() {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } = await apiFetchBlob('/profile/export', {}, 'application/json');
      triggerBlobDownload(blob, filename ?? 'invoice-saas-export.json');
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeleteAccountInput) =>
      apiFetch<void>('/profile', { method: 'DELETE', body, retryOnUnauthorized: false }),
    onSuccess: () => {
      clearAccessToken();
      qc.setQueryData(authKeys.session, null);
      qc.clear();
    },
  });
}
