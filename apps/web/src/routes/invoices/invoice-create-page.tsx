import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { InvoiceForm } from '../../components/invoices/invoice-form';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonForm } from '../../components/state/skeletons';
import { Button } from '../../components/ui';
import { useBusinessProfile } from '../../features/profile/use-profile';
import { useTemplates } from '../../features/templates/use-templates';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  back: 'Invoices',
  title: 'New invoice',
  subtitle: 'Fill in the details — the preview updates as you go, and drafts save automatically.',
} as const;

/**
 * The invoice creation screen (backlog Epic 4.2). Loads the two things the form
 * needs up front — the business profile (defaults + the "from" block) and the
 * tenant's templates — then hands off to `<InvoiceForm>`, which owns the form,
 * the live preview and compose-time autosave.
 */
export function InvoiceCreatePage() {
  const navigate = useNavigate();
  const profileQuery = useBusinessProfile();
  const templatesQuery = useTemplates();

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start"
          onClick={() => void navigate('/invoices')}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {COPY.back}
        </Button>
        <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
        <p className="text-sm text-muted-foreground">{COPY.subtitle}</p>
      </header>

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
                onIssued={(invoice) => void navigate(`/invoices/${invoice.id}`)}
                onCancel={() => void navigate('/invoices')}
              />
            )}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}
