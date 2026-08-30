import type { ClientResponse, ClientSort } from '@invoice-saas/shared';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { ClientFormDialog } from '../../components/clients/client-form-dialog';
import { EmptyState } from '../../components/state/empty-state';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonTable } from '../../components/state/skeletons';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import { useClients, useDeleteClient } from '../../features/clients/use-clients';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Clients',
  description: 'Your customers — saved once, reused on any invoice.',
  newClient: 'New client',
  searchPlaceholder: 'Search by name, email or tax ID',
  searchLabel: 'Search clients',
  sortLabel: 'Sort clients',
  colName: 'Name',
  colEmail: 'Email',
  colTaxId: 'Tax ID',
  colCurrency: 'Currency',
  rowActions: 'Client actions',
  edit: 'Edit',
  delete: 'Delete',
  currencyDefault: 'Default',
  noEmail: '—',
  nothingYetTitle: 'No clients yet',
  nothingYetBody: 'Add a client and they’ll be ready to pick on your next invoice.',
  nothingYetCta: 'Add your first client',
  nothingFoundTitle: 'No clients match that search',
  nothingFoundBody: 'Try a different name, email or tax ID.',
  deleteTitle: 'Delete this client?',
  deleteBody: (name: string) =>
    `“${name}” will be removed from your client list and pickers. Invoices that already use this client keep their details and still open normally.`,
  deleteConfirm: 'Delete client',
  deletedToast: 'Client deleted.',
  deleteFailed: "Couldn't delete this client. Try again.",
  pagePrev: 'Previous',
  pageNext: 'Next',
  pageStatus: (page: number, total: number) => `Page ${page} of ${total}`,
} as const;

const SORT_OPTIONS: { value: ClientSort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

export function ClientsListPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [sort, setSort] = useState<ClientSort>('name');
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState<{ open: boolean; client?: ClientResponse }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<ClientResponse | null>(null);

  const toast = useToast();
  const deleteMutation = useDeleteClient();

  const query = useClients({ search: search || undefined, sort, page });

  // Search and sort always restart at page 1 — handled where they change rather
  // than in an effect, so there is no render-then-correct round trip.
  const changeSearch = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };
  const changeSort = (value: ClientSort) => {
    setSort(value);
    setPage(1);
  };

  const openCreate = () => setDialog({ open: true });
  const openEdit = (client: ClientResponse) => setDialog({ open: true, client });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(COPY.deletedToast);
      // Deleting the last row on a page beyond the first would land on an empty
      // page — step back so the user still sees data.
      if (page > 1 && query.data?.items.length === 1) setPage((p) => Math.max(1, p - 1));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.deleteFailed);
      throw err; // keep the confirm dialog open
    }
  };

  const searchActive = search.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          {COPY.newClient}
        </Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            type="search"
            aria-label={COPY.searchLabel}
            placeholder={COPY.searchPlaceholder}
            value={searchInput}
            onChange={(e) => changeSearch(e.target.value)}
          />
        </div>
        <Select
          aria-label={COPY.sortLabel}
          className="w-48"
          options={SORT_OPTIONS}
          value={sort}
          onValueChange={(value) => changeSort(value as ClientSort)}
        />
      </div>

      <QueryBoundary
        query={query}
        loading={<SkeletonTable rows={8} columns={4} />}
        isEmpty={(data) => data.total === 0}
        empty={
          searchActive ? (
            <EmptyState
              variant="nothing-found"
              title={COPY.nothingFoundTitle}
              description={COPY.nothingFoundBody}
              onClearFilters={() => changeSearch('')}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={COPY.nothingYetTitle}
              description={COPY.nothingYetBody}
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  {COPY.nothingYetCta}
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{COPY.colName}</TableHead>
                    <TableHead>{COPY.colEmail}</TableHead>
                    <TableHead>{COPY.colTaxId}</TableHead>
                    <TableHead>{COPY.colCurrency}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => openEdit(client)}
                          className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {client.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.email ?? COPY.noEmail}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.taxId ?? COPY.noEmail}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.currency ?? COPY.currencyDefault}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={COPY.rowActions}>
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(client)}>
                              {COPY.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onSelect={() => setDeleteTarget(client)}>
                              {COPY.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground" role="status">
                  {COPY.pageStatus(data.page, data.totalPages)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={data.page <= 1}
                  >
                    {COPY.pagePrev}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={data.page >= data.totalPages}
                  >
                    {COPY.pageNext}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </QueryBoundary>

      <ClientFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        client={dialog.client}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={COPY.deleteTitle}
        description={deleteTarget ? COPY.deleteBody(deleteTarget.name) : undefined}
        confirmLabel={COPY.deleteConfirm}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
