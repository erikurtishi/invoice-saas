import type { ClientResponse, ClientSort } from '@invoice-saas/shared';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  RecordCard,
  RecordCardList,
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

const SORT_VALUES: {
  value: ClientSort;
  labelKey: 'sortNameAsc' | 'sortNameDesc' | 'sortNewest' | 'sortOldest';
}[] = [
  { value: 'name', labelKey: 'sortNameAsc' },
  { value: '-name', labelKey: 'sortNameDesc' },
  { value: 'newest', labelKey: 'sortNewest' },
  { value: 'oldest', labelKey: 'sortOldest' },
];

export function ClientsListPage() {
  const { t } = useTranslation();
  const SORT_OPTIONS = SORT_VALUES.map((o) => ({
    value: o.value,
    label: t(`clients.${o.labelKey}`),
  }));
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
      toast.success(t('clients.deletedToast'));
      // Deleting the last row on a page beyond the first would land on an empty
      // page — step back so the user still sees data.
      if (page > 1 && query.data?.items.length === 1) setPage((p) => Math.max(1, p - 1));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || t('clients.deleteFailed'));
      throw err; // keep the confirm dialog open
    }
  };

  const searchActive = search.length > 0;

  const rowMenu = (client: ClientResponse) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('clients.rowActions')}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openEdit(client)}>{t('common.edit')}</DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={() => setDeleteTarget(client)}>
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const nameButton = (client: ClientResponse) => (
    <button
      type="button"
      onClick={() => openEdit(client)}
      className="rounded text-left font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {client.name}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('clients.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('clients.description')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          {t('clients.newClient')}
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
            aria-label={t('clients.searchLabel')}
            placeholder={t('clients.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => changeSearch(e.target.value)}
          />
        </div>
        <Select
          aria-label={t('clients.sortLabel')}
          className="w-48"
          options={SORT_OPTIONS}
          value={sort}
          onValueChange={(value) => changeSort(value as ClientSort)}
        />
      </div>

      <QueryBoundary
        name="clients"
        query={query}
        loading={<SkeletonTable rows={8} columns={4} />}
        isEmpty={(data) => data.total === 0}
        empty={
          searchActive ? (
            <EmptyState
              variant="nothing-found"
              title={t('clients.nothingFoundTitle')}
              description={t('clients.nothingFoundBody')}
              onClearFilters={() => changeSearch('')}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('clients.nothingYetTitle')}
              description={t('clients.nothingYetBody')}
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  {t('clients.nothingYetCta')}
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <RecordCardList className="flex flex-col gap-3 md:hidden">
              {data.items.map((client) => (
                <RecordCard
                  key={client.id}
                  title={nameButton(client)}
                  actions={rowMenu(client)}
                  fields={[
                    { label: t('clients.colEmail'), value: client.email ?? t('common.none') },
                    { label: t('clients.colTaxId'), value: client.taxId ?? t('common.none') },
                    {
                      label: t('clients.colCurrency'),
                      value: client.currency ?? t('common.default'),
                    },
                  ]}
                />
              ))}
            </RecordCardList>

            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('clients.colName')}</TableHead>
                    <TableHead>{t('clients.colEmail')}</TableHead>
                    <TableHead>{t('clients.colTaxId')}</TableHead>
                    <TableHead>{t('clients.colCurrency')}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>{nameButton(client)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.email ?? t('common.none')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.taxId ?? t('common.none')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.currency ?? t('common.default')}
                      </TableCell>
                      <TableCell>{rowMenu(client)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground" role="status">
                  {t('common.pageStatus', { page: data.page, total: data.totalPages })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={data.page <= 1}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={data.page >= data.totalPages}
                  >
                    {t('common.next')}
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
        title={t('clients.deleteTitle')}
        description={
          deleteTarget ? t('clients.deleteBody', { name: deleteTarget.name }) : undefined
        }
        confirmLabel={t('clients.deleteConfirm')}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
