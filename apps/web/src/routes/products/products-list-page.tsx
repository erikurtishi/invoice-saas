import { bpToPercentString, minorToAmountString, type ProductResponse } from '@invoice-saas/shared';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProductFormDialog } from '../../components/products/product-form-dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui';
import { useBusinessProfile } from '../../features/profile/use-profile';
import { useDeleteProduct, useProducts } from '../../features/products/use-products';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';

function formatPrice(
  product: ProductResponse,
  currencyCode: string | undefined,
  noneLabel: string,
): string {
  if (product.defaultPriceMinor == null) return noneLabel;
  const amount = minorToAmountString(product.defaultPriceMinor);
  return currencyCode ? `${amount} ${currencyCode}` : amount;
}

export function ProductsListPage() {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState<{ open: boolean; product?: ProductResponse }>({
    open: false,
  });
  const [deleteTarget, setDeleteTarget] = useState<ProductResponse | null>(null);

  const toast = useToast();
  const deleteMutation = useDeleteProduct();
  const profile = useBusinessProfile();

  const query = useProducts({ search: search || undefined, page });

  const changeSearch = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };

  const openCreate = () => setDialog({ open: true });
  const openEdit = (product: ProductResponse) => setDialog({ open: true, product });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(t('products.deletedToast'));
      if (page > 1 && query.data?.items.length === 1) setPage((p) => Math.max(1, p - 1));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || t('products.deleteFailed'));
      throw err;
    }
  };

  const searchActive = search.length > 0;
  const currencyCode = profile.data?.defaultCurrency;

  const rowMenu = (product: ProductResponse) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('products.rowActions')}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openEdit(product)}>{t('common.edit')}</DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={() => setDeleteTarget(product)}>
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const nameCell = (product: ProductResponse) => (
    <>
      <button
        type="button"
        onClick={() => openEdit(product)}
        className="rounded text-left font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {product.name}
      </button>
      {product.description && (
        <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
          {product.description}
        </p>
      )}
    </>
  );

  const taxLabel = (product: ProductResponse) =>
    product.defaultTaxRateBp > 0
      ? `${bpToPercentString(product.defaultTaxRateBp)}%`
      : t('common.zeroPercent');

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('products.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('products.description')}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          {t('products.newProduct')}
        </Button>
      </header>

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            type="search"
            aria-label={t('products.searchLabel')}
            placeholder={t('products.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => changeSearch(e.target.value)}
          />
        </div>
      </div>

      <QueryBoundary
        name="products"
        query={query}
        loading={<SkeletonTable rows={8} columns={4} />}
        isEmpty={(data) => data.total === 0}
        empty={
          searchActive ? (
            <EmptyState
              variant="nothing-found"
              title={t('products.nothingFoundTitle')}
              description={t('products.nothingFoundBody')}
              onClearFilters={() => changeSearch('')}
            />
          ) : (
            <EmptyState
              variant="nothing-yet"
              title={t('products.nothingYetTitle')}
              description={t('products.nothingYetBody')}
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  {t('products.nothingYetCta')}
                </Button>
              }
            />
          )
        }
      >
        {(data) => (
          <div className="flex flex-col gap-4">
            <RecordCardList className="flex flex-col gap-3 md:hidden">
              {data.items.map((product) => (
                <RecordCard
                  key={product.id}
                  title={nameCell(product)}
                  actions={rowMenu(product)}
                  fields={[
                    { label: t('products.colUnit'), value: product.unit ?? t('common.none') },
                    {
                      label: t('products.colPrice'),
                      value: formatPrice(product, currencyCode, t('common.none')),
                    },
                    { label: t('products.colTaxRate'), value: taxLabel(product) },
                  ]}
                />
              ))}
            </RecordCardList>

            <div className="hidden overflow-hidden rounded-lg border border-border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('products.colName')}</TableHead>
                    <TableHead>{t('products.colUnit')}</TableHead>
                    <TableHead>{t('products.colPrice')}</TableHead>
                    <TableHead>{t('products.colTaxRate')}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>{nameCell(product)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.unit ?? t('common.none')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatPrice(product, currencyCode, t('common.none'))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{taxLabel(product)}</TableCell>
                      <TableCell>{rowMenu(product)}</TableCell>
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

      <ProductFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
        product={dialog.product}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('products.deleteTitle')}
        description={
          deleteTarget ? t('products.deleteBody', { name: deleteTarget.name }) : undefined
        }
        confirmLabel={t('products.deleteConfirm')}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
