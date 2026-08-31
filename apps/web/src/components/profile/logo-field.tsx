import { LOGO_ACCEPT_ATTR, LOGO_ACCEPTED_MIME, LOGO_MAX_BYTES } from '@invoice-saas/shared';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRemoveLogo, useUploadLogo } from '../../features/profile/use-profile';
import { useToast } from '../../hooks/use-toast';
import { resolveAssetUrl } from '../../lib/asset-url';
import { toUserMessage } from '../../lib/error-message';
import { HttpError } from '../../lib/http-error';
import { Button } from '../ui';

/**
 * Logo upload / replace / remove (backlog 1.2.3). Deliberately *not* part of the
 * React Hook Form: it has its own mutations and its own success/error feedback, so
 * a failed upload never blocks saving the rest of the profile (five-states
 * "Partial" — one widget failing doesn't fail the surface).
 */
export function LogoField({ logoUrl }: { logoUrl: string | null }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const toast = useToast();

  const src = resolveAssetUrl(logoUrl);
  const busy = upload.isPending || remove.isPending;

  function pick() {
    setFieldError(null);
    inputRef.current?.click();
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;

    if (!LOGO_ACCEPTED_MIME.includes(file.type as (typeof LOGO_ACCEPTED_MIME)[number])) {
      setFieldError(t('profile.logoWrongType'));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setFieldError(t('profile.logoTooLarge'));
      return;
    }

    upload.mutate(file, {
      onSuccess: () => toast.success(t('profile.logoUploaded')),
      onError: (err) => {
        const message =
          err instanceof HttpError && err.fields?.logo?.[0]
            ? err.fields.logo[0]
            : toUserMessage(err);
        setFieldError(message);
        toast.error(message);
      },
    });
  }

  function onRemove() {
    setFieldError(null);
    remove.mutate(undefined, {
      onSuccess: () => toast.success(t('profile.logoRemoved')),
      onError: (err) => toast.error(toUserMessage(err)),
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{t('profile.logoLabel')}</span>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {src ? (
            <img src={src} alt={t('profile.logoAlt')} className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={pick}
            isLoading={upload.isPending}
            disabled={busy}
          >
            <Upload className="size-4" aria-hidden />
            {logoUrl ? t('profile.logoReplace') : t('profile.logoUpload')}
          </Button>
          {logoUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              isLoading={remove.isPending}
              disabled={busy}
            >
              <Trash2 className="size-4" aria-hidden />
              {t('profile.logoRemove')}
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={LOGO_ACCEPT_ATTR}
          className="hidden"
          onChange={onFile}
        />
      </div>

      {fieldError ? (
        <p className="text-xs font-medium text-destructive">{fieldError}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('profile.logoHint')}</p>
      )}
    </div>
  );
}
