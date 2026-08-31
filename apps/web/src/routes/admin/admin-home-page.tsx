import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui';

/**
 * The admin center's only screen for now. Every Phase 8 capability (audit log,
 * overview, tenants, usage, billing, support) shipped as backend endpoints with
 * the UI deliberately deferred — so `/admin` exists as a real, role-gated route
 * (`AdminLayout` in `App.tsx`) but has nothing to show yet. This page states that
 * plainly rather than 404ing an admin who follows the link.
 */
export function AdminHomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="size-7" aria-hidden />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t('admin.homeTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('admin.homeBody')}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/console">
          <ArrowLeft className="size-4" aria-hidden />
          {t('admin.backToConsole')}
        </Link>
      </Button>
    </div>
  );
}
