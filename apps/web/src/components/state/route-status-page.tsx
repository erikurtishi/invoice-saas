import { FileQuestion, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { useSession } from '../../features/auth/use-auth';
import { Button } from '../ui/button';

/**
 * Backlog X.7.19 — the designed 404 / 403 screens. Distinct from `<ErrorState>`
 * (a request or render *failed* and can be retried): these are a definitive
 * answer from the router or API — the thing isn't there, or isn't yours — so the
 * recovery is navigation, not a retry.
 *
 * i18n'd, and always offers a way out: "Go back" (history) when there is history
 * to go back to, plus a safe landing — the console for a signed-in user, the
 * marketing home for a visitor. Rendered inside whatever shell the matched route
 * tree provides (see `App.tsx`).
 */
export function RouteStatusPage({ status }: { status: 404 | 403 }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useSession();
  const Icon = status === 403 ? Lock : FileQuestion;
  const canGoBack = window.history.length > 1;
  const [homeTo, homeLabel] = user
    ? (['/console', t('routeStatus.goConsole')] as const)
    : (['/', t('routeStatus.goHome')] as const);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-7" aria-hidden />
      </div>
      <div>
        <p className="text-3xl font-semibold tabular-nums text-foreground">{status}</p>
        <h1 className="mt-1 text-base font-semibold text-foreground">
          {t(status === 403 ? 'routeStatus.forbiddenTitle' : 'routeStatus.notFoundTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(status === 403 ? 'routeStatus.forbiddenBody' : 'routeStatus.notFoundBody')}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {canGoBack && (
          <Button variant="outline" size="sm" onClick={() => void navigate(-1)}>
            {t('routeStatus.goBack')}
          </Button>
        )}
        <Button size="sm" onClick={() => void navigate(homeTo)}>
          {homeLabel}
        </Button>
      </div>
    </div>
  );
}
