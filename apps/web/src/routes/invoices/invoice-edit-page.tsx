import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { InvoiceEditForm } from '../../components/invoices/invoice-edit-form';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonForm } from '../../components/state/skeletons';
import { Button } from '../../components/ui';
import { useInvoice } from '../../features/invoices/use-invoices';
import { useBusinessProfile } from '../../features/profile/use-profile';
import { useTemplates } from '../../features/templates/use-templates';

/**
 * Edit a saved invoice (backlog Epic 4.4). Loads the invoice, the business
 * profile and the template list, then hands off to `<InvoiceEditForm>`, which
 * owns Save / Cancel semantics and the edit-screen Download / Send.
 */
export function InvoiceEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invoiceQuery = useInvoice(id);
  const profileQuery = useBusinessProfile();
  const templatesQuery = useTemplates();

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start"
          onClick={() => void navigate(id ? `/console/invoices/${id}` : '/console/invoices')}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('invoices.editBack')}
        </Button>
        <h1 className="text-xl font-semibold text-foreground">{t('invoices.editTitle')}</h1>
      </header>

      <QueryBoundary
        query={invoiceQuery}
        loading={<SkeletonForm fields={8} />}
        isEmpty={() => false}
      >
        {(invoice) => (
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
                  <InvoiceEditForm
                    invoice={invoice}
                    profile={profile}
                    templates={templates.items}
                    onSaved={(saved) => void navigate(`/console/invoices/${saved.id}`)}
                    onCancel={() => void navigate(`/console/invoices/${invoice.id}`)}
                  />
                )}
              </QueryBoundary>
            )}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}
