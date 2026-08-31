import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { UpgradeCallout } from '../../components/billing/upgrade-callout';
import { InvoiceForm } from '../../components/invoices/invoice-form';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonForm } from '../../components/state/skeletons';
import { Button } from '../../components/ui';
import { useEntitlements } from '../../features/billing/use-billing';
import { useBusinessProfile } from '../../features/profile/use-profile';
import { useTemplates } from '../../features/templates/use-templates';

/**
 * The invoice creation screen (backlog Epic 4.2). Loads the two things the form
 * needs up front — the business profile (defaults + the "from" block) and the
 * tenant's templates — then hands off to `<InvoiceForm>`, which owns the form,
 * the live preview and compose-time autosave.
 */
export function InvoiceCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profileQuery = useBusinessProfile();
  const templatesQuery = useTemplates();
  const entitlementsQuery = useEntitlements();

  // Only act on a definitive answer — while entitlements load or fail we show the
  // form and let the server enforce (6.1.4). `remaining` is null when unlimited.
  const invoices = entitlementsQuery.data?.invoices;
  const limitReached = invoices ? !invoices.unlimited && (invoices.remaining ?? 0) <= 0 : false;
  const onLastInvoice = invoices
    ? !invoices.unlimited && invoices.remaining === 1 && invoices.used === 0
    : false;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start"
          onClick={() => void navigate('/console/invoices')}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('invoices.detailBack')}
        </Button>
        <h1 className="text-xl font-semibold text-foreground">{t('invoices.createTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('invoices.createSubtitle')}</p>
      </header>

      {limitReached ? (
        <UpgradeCallout
          variant="card"
          title={t('invoices.limitReachedTitle')}
          description={t('invoices.limitReachedBody')}
        />
      ) : (
        <>
          {onLastInvoice && (
            <UpgradeCallout
              className="mb-4"
              title={t('invoices.lastOneTitle')}
              description={t('invoices.lastOneBody')}
            />
          )}
          <QueryBoundary
            query={profileQuery}
            loading={<SkeletonForm fields={8} />}
            isEmpty={() => false}
          >
            {(profile) => (
              <QueryBoundary
                query={templatesQuery}
                loading={<SkeletonForm fields={8} />}
                isEmpty={() => false}
              >
                {(templates) => (
                  <InvoiceForm
                    profile={profile}
                    templates={templates.items}
                    entitlements={entitlementsQuery.data}
                    onIssued={(invoice) => void navigate(`/console/invoices/${invoice.id}`)}
                    onCancel={() => void navigate('/console/invoices')}
                  />
                )}
              </QueryBoundary>
            )}
          </QueryBoundary>
        </>
      )}
    </div>
  );
}
