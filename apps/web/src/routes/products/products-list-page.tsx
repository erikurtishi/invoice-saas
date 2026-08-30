import { bpToPercentString, minorToAmountString, type ProductResponse } from '@invoice-saas/shared';
import { MoreHorizontal, Plus, Search } from 'lucide-react';
import { useState } from 'react';

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

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Products',
  description: 'Saved products and services — reuse them as invoice lines.',
  newProduct: 'New product',
  searchPlaceholder: 'Search by name or description',
  searchLabel: 'Search products',
  colName: 'Name',
  colUnit: 'Unit',
  colPrice: 'Default price',
  colTax: 'Tax rate',
  rowActions: 'Product actions',
  edit: 'Edit',
  delete: 'Delete',
  none: '—',
  noTax: '0%',
  nothingYetTitle: 'No products yet',
  nothingYetBody: 'Save a product or service and it’ll be one click to add on an invoice.',
  nothingYetCta: 'Add your first product',
  nothingFoundTitle: 'No products match that search',
  nothingFoundBody: 'Try a different name or description.',
  deleteTitle: 'Delete this product?',
  deleteBody: (name: string) =>
    `“${name}” will be removed from your product list and the picker. Invoices that already use it keep their line details.`,
  deleteConfirm: 'Delete product',
  deletedToast: 'Product deleted.',
  deleteFailed: "Couldn't delete this product. Try again.",
  pagePrev: 'Previous',
  pageNext: 'Next',
  pageStatus: (page: number, total: number) => `Page ${page} of ${total}`,
} as const;

function formatPrice(product: ProductResponse, currencyCode: string | undefined): string {
  if (product.defaultPriceMinor == null) return COPY.none;
  const amount = minorToAmountString(product.defaultPriceMinor);
  return currencyCode ? `${amount} ${currencyCode}` : amount;
}

export function ProductsListPage() {
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
      toast.success(COPY.deletedToast);
      if (page > 1 && query.data?.items.length === 1) setPage((p) => Math.max(1, p - 1));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.deleteFailed);
      throw err;
    }
  };

  const searchActive = search.length > 0;
  const currencyCode = profile.data?.defaultCurrency;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          {COPY.newProduct}
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
            aria-label={COPY.searchLabel}
            placeholder={COPY.searchPlaceholder}
            value={searchInput}
            onChange={(e) => changeSearch(e.target.value)}
          />
        </div>
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
                    <TableHead>{COPY.colUnit}</TableHead>
                    <TableHead>{COPY.colPrice}</TableHead>
                    <TableHead>{COPY.colTax}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.unit ?? COPY.none}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatPrice(product, currencyCode)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.defaultTaxRateBp > 0
                          ? `${bpToPercentString(product.defaultTaxRateBp)}%`
                          : COPY.noTax}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={COPY.rowActions}>
                              <MoreHorizontal className="size-4" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(product)}>
                              {COPY.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onSelect={() => setDeleteTarget(product)}>
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
        title={COPY.deleteTitle}
        description={deleteTarget ? COPY.deleteBody(deleteTarget.name) : undefined}
        confirmLabel={COPY.deleteConfirm}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
