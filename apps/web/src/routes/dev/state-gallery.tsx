import { UserPlus } from 'lucide-react';
import { useState } from 'react';

import { FormField } from '../../components/form/field';
import { ErrorBoundary } from '../../components/state/error-boundary';
import { EmptyState } from '../../components/state/empty-state';
import { ErrorState } from '../../components/state/error-state';
import { QueryBoundary, type QueryLike } from '../../components/state/query-boundary';
import {
  SkeletonCard,
  SkeletonForm,
  SkeletonInvoicePreview,
  SkeletonList,
  SkeletonTable,
} from '../../components/state/skeletons';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Toast } from '../../components/ui/toast';
import { useToast } from '../../hooks/use-toast';
import { HttpError } from '../../lib/http-error';

/**
 * Backlog 0.4b.11 — dev-only gallery of every state primitive in every state, so
 * reviewing and QAing states is a single page instead of a hunt through screens.
 * Mounted at `/dev/states` only when `import.meta.env.DEV` (see `App.tsx`).
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

/** Fake a TanStack Query result without a real request. */
function fakeQuery<T>(over: Partial<QueryLike<T>>): QueryLike<T> {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    isPlaceholderData: false,
    refetch: () => undefined,
    ...over,
  };
}

function Boom(): never {
  throw new Error('Deliberate render error from the states gallery');
}

function BoundaryDemo() {
  const [crash, setCrash] = useState(false);
  return (
    <ErrorBoundary
      onReset={() => setCrash(false)}
      fallbackRender={({ error, reset }) => (
        <ErrorState variant="inline" error={error} onRetry={reset} />
      )}
    >
      {crash && <Boom />}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          Boundary is holding. Click to throw during render:
        </span>
        <Button size="sm" variant="destructive" onClick={() => setCrash(true)}>
          Trigger render error
        </Button>
      </div>
    </ErrorBoundary>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => toast.success('Client saved')}>
        success
      </Button>
      <Button size="sm" variant="destructive" onClick={() => toast.error('Could not save client')}>
        error
      </Button>
      <Button size="sm" variant="outline" onClick={() => toast.info('3 invoices imported')}>
        info
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          void toast.promise(new Promise((res) => setTimeout(res, 1500)), {
            loading: 'Generating PDF…',
            success: 'PDF ready',
            error: 'PDF generation failed',
          })
        }
      >
        loading → resolved
      </Button>
    </div>
  );
}

export function StateGallery() {
  const [fieldValue, setFieldValue] = useState('');
  const fieldError = fieldValue.trim() === '' ? 'Name is required' : undefined;

  return (
    <div className="flex flex-col gap-10 pb-16">
      <header>
        <h1 className="text-2xl font-semibold">UI state primitives</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Epic 0.4b. Dev-only. Every primitive, every state.
        </p>
      </header>

      <Section title="QueryBoundary — loading">
        <QueryBoundary query={fakeQuery<string[]>({ isPending: true })}>
          {(rows) => <div>{rows.join(', ')}</div>}
        </QueryBoundary>
      </Section>

      <Section title="QueryBoundary — error (with retry)">
        <QueryBoundary
          query={fakeQuery<string[]>({ isError: true, error: new HttpError(500, 'boom') })}
        >
          {(rows) => <div>{rows.join(', ')}</div>}
        </QueryBoundary>
      </Section>

      <Section title="QueryBoundary — empty (custom slot)">
        <QueryBoundary
          query={fakeQuery<string[]>({ data: [] })}
          empty={
            <EmptyState
              variant="nothing-yet"
              icon={UserPlus}
              title="No clients yet"
              description="Add a client and it'll be one tap to invoice them next time."
              action={<Button size="sm">Create your first client</Button>}
            />
          }
        >
          {(rows) => <div>{rows.join(', ')}</div>}
        </QueryBoundary>
      </Section>

      <Section title="QueryBoundary — success, background refetch">
        <QueryBoundary
          query={fakeQuery<string[]>({ data: ['Acme d.o.o.', 'Beta LLC'], isFetching: true })}
        >
          {(rows) => (
            <ul className="rounded-lg border border-border">
              {rows.map((r) => (
                <li key={r} className="border-b border-border px-4 py-3 text-sm last:border-0">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </Section>

      <Section title="Skeletons">
        <SkeletonList rows={3} />
        <SkeletonTable rows={4} columns={4} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="max-w-md">
          <SkeletonForm fields={3} />
        </div>
        <SkeletonInvoicePreview />
      </Section>

      <Section title="EmptyState — nothing yet vs nothing found">
        <EmptyState
          variant="nothing-yet"
          title="No invoices yet"
          description="Create your first invoice and download it as a PDF in under a minute."
          action={<Button size="sm">New invoice</Button>}
        />
        <EmptyState
          variant="nothing-found"
          title="No invoices match those filters"
          description="Try a wider date range or a different client."
          onClearFilters={() => undefined}
        />
      </Section>

      <Section title="ErrorState — inline vs page">
        <ErrorState variant="inline" error={new HttpError(503, 'x')} onRetry={() => undefined} />
        <ErrorState variant="page" error={new Error('network')} onRetry={() => undefined} />
      </Section>

      <Section title="Error boundary — recoverable fallback (runtime test)">
        <BoundaryDemo />
      </Section>

      <Section title="Toasts">
        <ToastDemo />
        <div className="flex flex-col gap-2">
          <Toast variant="success" title="Invoice saved" description="INV-2026-001" />
          <Toast
            variant="error"
            title="Email send failed"
            description="PDF is ready to download."
          />
          <Toast variant="loading" title="Generating PDF…" />
        </div>
      </Section>

      <Section title="Inline field validation">
        <form className="max-w-sm" onSubmit={(e) => e.preventDefault()}>
          <FormField label="Client name" required error={fieldError}>
            {({ controlProps, invalid }) => (
              <Input
                {...controlProps}
                invalid={invalid}
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                placeholder="Acme d.o.o."
              />
            )}
          </FormField>
        </form>
      </Section>

      <Section title="Button loading state (width preserved)">
        <div className="flex gap-3">
          <Button>Save changes</Button>
          <Button isLoading>Save changes</Button>
        </div>
      </Section>

      <Section title="Offline banner">
        <Card>
          <CardHeader>
            <CardTitle>How to test</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Toggle DevTools → Network → Offline. The banner slides in at the top of the shell.
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
