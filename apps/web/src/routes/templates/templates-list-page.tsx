import type { TemplateResponse } from '@invoice-saas/shared';
import { Check, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { TemplateThumbnail } from '../../components/template/template-thumbnail';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonCard } from '../../components/state/skeletons';
import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui';
import { useSession } from '../../features/auth/use-auth';
import {
  useDeleteTemplate,
  useDuplicateTemplate,
  useSetDefaultTemplate,
  useTemplates,
} from '../../features/templates/use-templates';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  title: 'Templates',
  description: 'Saved invoice designs. Pick one when you create an invoice.',
  newTemplate: 'New template',
  locked: 'Designing templates is on Basic and Premium.',
  freeBannerTitle: 'Templates are a paid feature',
  freeBannerBody:
    'Your invoices use the default design. Upgrade to Basic or Premium to create and customise your own templates.',
  freeBannerCta: 'See plans',
  defaultBadge: 'Default',
  edit: 'Edit',
  duplicate: 'Duplicate',
  setDefault: 'Set as default',
  delete: 'Delete',
  actions: 'Template actions',
  duplicatedToast: 'Template duplicated.',
  defaultToast: 'Default template updated.',
  deletedToast: 'Template deleted.',
  actionFailed: 'That didn’t work. Try again.',
  deleteTitle: 'Delete this template?',
  deleteBody: (name: string) =>
    `“${name}” will be removed from the picker. Invoices already using it keep their design.`,
  deleteConfirm: 'Delete template',
} as const;

export function TemplatesListPage() {
  const { data: user } = useSession();
  const canManage = user ? user.tier !== 'FREE' : false;

  const query = useTemplates();
  const navigate = useNavigate();
  const toast = useToast();

  const duplicateMutation = useDuplicateTemplate();
  const setDefaultMutation = useSetDefaultTemplate();
  const deleteMutation = useDeleteTemplate();

  const [deleteTarget, setDeleteTarget] = useState<TemplateResponse | null>(null);

  const duplicate = async (template: TemplateResponse) => {
    try {
      const created = await duplicateMutation.mutateAsync({ id: template.id });
      toast.success(COPY.duplicatedToast);
      void navigate(`/templates/${created.id}`);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.actionFailed);
    }
  };

  const setDefault = async (template: TemplateResponse) => {
    try {
      await setDefaultMutation.mutateAsync(template.id);
      toast.success(COPY.defaultToast);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.actionFailed);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(COPY.deletedToast);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.actionFailed);
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{COPY.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.description}</p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link to="/templates/new">
              <Plus className="size-4" aria-hidden />
              {COPY.newTemplate}
            </Link>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button disabled>
                  <Plus className="size-4" aria-hidden />
                  {COPY.newTemplate}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{COPY.locked}</TooltipContent>
          </Tooltip>
        )}
      </header>

      {!canManage && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{COPY.freeBannerTitle}</p>
              <p className="text-sm text-muted-foreground">{COPY.freeBannerBody}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">{COPY.freeBannerCta}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <QueryBoundary
        query={query}
        loading={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        }
        isEmpty={() => false}
      >
        {(data) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((template) => (
              <Card key={template.id} className="flex flex-col overflow-hidden">
                <div className="flex justify-center border-b border-border bg-muted/40 p-4">
                  {canManage ? (
                    <Link
                      to={`/templates/${template.id}`}
                      aria-label={`Edit ${template.name}`}
                      className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <TemplateThumbnail config={template.config} />
                    </Link>
                  ) : (
                    <TemplateThumbnail config={template.config} />
                  )}
                </div>
                <div className="flex items-center gap-2 p-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {template.name}
                  </span>
                  {template.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      <Check className="size-3" aria-hidden />
                      {COPY.defaultBadge}
                    </span>
                  )}
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={COPY.actions}>
                          <MoreHorizontal className="size-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => void navigate(`/templates/${template.id}`)}
                        >
                          {COPY.edit}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void duplicate(template)}>
                          {COPY.duplicate}
                        </DropdownMenuItem>
                        {!template.isDefault && (
                          <DropdownMenuItem onSelect={() => void setDefault(template)}>
                            {COPY.setDefault}
                          </DropdownMenuItem>
                        )}
                        {!template.isDefault && (
                          <DropdownMenuItem destructive onSelect={() => setDeleteTarget(template)}>
                            {COPY.delete}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryBoundary>

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
