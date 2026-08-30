# UI state primitives (Epic 0.4b)

The reusable building blocks for the five mandatory UI states
(loading / empty / success / error / partial — see the backlog's five-states table).
Built in Phase 0 so every feature screen inherits correct states instead of
hand-rolling them. **Feature code imports these; it never re-implements a
loading/empty/error surface.**

Live gallery of every primitive in every state: `/dev/states` (dev builds only).

| Task | Primitive | Import from |
|---|---|---|
| 0.4b.1 | `<QueryBoundary>` | `components/state` |
| 0.4b.2 | `SkeletonList` / `SkeletonTable` / `SkeletonCard` / `SkeletonForm` / `SkeletonInvoicePreview` | `components/state` |
| 0.4b.3 | `<EmptyState>` (`nothing-yet` \| `nothing-found`) | `components/state` |
| 0.4b.4 | `<ErrorState>` (`inline` \| `page`) | `components/state` |
| 0.4b.5 | `<AppErrorBoundary>` (root) + `<ErrorBoundary>` (reusable) | `components/AppErrorBoundary`, `components/state` |
| 0.4b.6 | `<ToastProvider>` + `useToast()` | `components/state`, `hooks/use-toast` |
| 0.4b.7 | `useZodForm()` + `<FormField>` | `lib/use-zod-form`, `components/form/field` |
| 0.4b.8 | `<Button isLoading>` | `components/ui/button` |
| 0.4b.9 | `<OfflineBanner>` (mounted in `AppShell`) | `components/state` |
| 0.4b.10 | `optimisticUpdate()` | `lib/optimistic-mutation` |
| 0.4b.11 | `<StateGallery>` at `/dev/states` | `routes/dev/state-gallery` |

Shared helper: `toUserMessage(error)` / `devDetail(error)` in `lib/error-message`
turn any thrown value into one plain-language sentence — used by both `<ErrorState>`
and the toast system so a failure reads identically wherever it surfaces.

---

## 0.4b.1 — `<QueryBoundary>`

Wraps a TanStack Query result and renders the right state off `isPending` /
`isError` / `data` / `isFetching`. No feature invents a parallel loading boolean.

```tsx
const clients = useQuery({ queryKey: ['clients'], queryFn: fetchClients });

<QueryBoundary
  query={clients}
  loading={<SkeletonTable columns={5} />}
  empty={
    <EmptyState
      variant="nothing-yet"
      title={t('clients.empty.title')}
      description={t('clients.empty.body')}
      action={<Button onClick={openCreate}>{t('clients.empty.cta')}</Button>}
    />
  }
>
  {(data) => <ClientsTable rows={data} />}
</QueryBoundary>
```

Precedence: error-with-no-data → first load → empty → success. On success, a
background refetch of already-shown data shows a thin top bar rather than
collapsing to a skeleton (X.7.25). Override `isEmpty` for non-list shapes; the
default treats `null`, `[]`, `{ items: [] }` and `{ data: [] }` as empty.

## 0.4b.2 — Skeletons

Match layout, not detail: same row count, same column rhythm, same card height, so
nothing shifts when data lands. `SkeletonInvoicePreview` holds true paper
proportions so the preview pane never jumps (X.7.2). `SkeletonList` is the generic
default `<QueryBoundary>` falls back to.

## 0.4b.3 — `<EmptyState>`

Two **non-interchangeable** variants:

- `nothing-yet` — new account, zero data. Onboarding tone, one primary CTA
  (`action`). Default icon: inbox.
- `nothing-found` — a search/filter matched nothing. Neutral tone, recovery is
  `onClearFilters` (renders the standard "Clear filters" button). Default icon:
  search-x.

Per-surface copy lives at the call site (X.7.5 / X.7.6).

## 0.4b.4 — `<ErrorState>`

- `inline` — one widget/list failed inside a working page; sits in place with its
  own retry. This is what `<QueryBoundary>` renders and what each widget on a
  partial surface uses (X.7.13 / X.7.20).
- `page` — the whole surface failed; centred, larger, still recoverable.

Always plain language + a recovery action. Dev builds append the raw error as a
detail line; production never shows it.

## 0.4b.5 — Error boundaries

- `<AppErrorBoundary>` — root, last resort. Standalone full-page fallback on 0.4
  tokens (no shell — the shell itself might be what broke). Wired to
  `QueryErrorResetBoundary`.
- `<ErrorBoundary>` — the reusable class. A second instance sits inside `AppShell`
  around the router (`App.tsx`), keyed on pathname, so a route crash keeps the nav
  usable and navigating away clears it. `fallbackRender={({ error, reset }) => …}`.

Runtime-verified: `/dev/states` → "Trigger render error" throws during render; the
nested boundary catches it, shows the recoverable fallback, and "Try again"
restores the subtree.

## 0.4b.6 — Toast system

`useToast()` → `success` / `error` / `info` / `loading` / `update` / `dismiss` /
`promise`. Queued (cap 4, oldest non-loading dropped on overflow), auto-dismiss
~5s (`loading` never auto-dismisses), Motion enter/exit with `layout` stacking,
polite `aria-live`. `<ToastProvider>` is mounted once in `main.tsx`.

```tsx
const toast = useToast();

toast.success(t('client.saved'));

await toast.promise(api.generatePdf(id), {
  loading: t('pdf.generating'),
  success: t('pdf.ready'),
  error: (e) => toUserMessage(e),
}); // same toast id flips loading → success/error; re-throws so callers can catch
```

Toasts are confirmation, never a blocker — anything the user must act on is an
inline `<ErrorState>`, not a toast.

## 0.4b.7 — Inline field validation

One pattern, every form: **Zod schema (shared with the API) → `useZodForm` →
`<FormField>` → error text under the input.**

```tsx
const form = useZodForm(clientSchema); // mode: onBlur, reValidate: onChange

<FormField label={t('client.name')} required error={form.formState.errors.name?.message}>
  {({ controlProps, invalid }) => (
    <Input {...controlProps} invalid={invalid} {...form.register('name')} />
  )}
</FormField>
```

`<FormField>` owns id / `aria-invalid` / `aria-describedby` wiring so accessibility
isn't left to the call site. Errors are inline under the field — never a summary at
the top (X.7.12).

## 0.4b.8 — `<Button isLoading>`

Disables the control, sets `aria-busy`, overlays a spinner on the label while the
label stays mounted but invisible — so the button keeps its exact width and never
reflows mid-action. Standard for every async action.

## 0.4b.9 — `<OfflineBanner>`

Mounted in `AppShell`. Reads `navigator.onLine` via `useSyncExternalStore`; shows a
persistent warning-coloured banner while offline so a user never assumes an edit
saved when the request never left the machine.

## 0.4b.10 — Optimistic update + rollback

`optimisticUpdate(queryClient, queryKey, apply)` returns
`{ onMutate, onError, onSettled }` for `useMutation`. Handles `cancelQueries` (so an
in-flight refetch can't clobber the optimistic value), snapshots + restores the
previous cache on error, and `invalidateQueries` on settle so the **server stays
the source of truth** (matches "frontend calculation for display only", 4.2.3).

```tsx
const qc = useQueryClient();
useMutation({
  mutationFn: (patch: ClientPatch) => api.updateClient(id, patch),
  ...optimisticUpdate<Client[], ClientPatch>(qc, ['clients'], (patch) => (list) =>
    (list ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
  ),
  onError: (e) => toast.error(toUserMessage(e)),
});
```

## 0.4b.11 — States gallery

`/dev/states`, dev builds only (tree-shaken from production via
`import.meta.env.DEV`). Every primitive in every state on one page, so state review
and QA (X.7.26) is a single scroll, not a hunt.

---

### i18n note

All copy in these primitives is placeholder English in a local `COPY` object with a
`TODO(X.1.1)` marker (decision D9). Call sites already pass their own strings;
swapping the primitives' internal copy to `react-i18next` is a per-file one-liner
when X.1.1 lands.
