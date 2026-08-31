import type { TemplateResponse } from '@invoice-saas/shared';
import { Check, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  getTransition,
  listContainerVariants,
  listItemTransition,
  listItemVariants,
} from '../../lib/motion-presets';

export function TemplatesListPage() {
  const { t } = useTranslation();
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
      toast.success(t('template.duplicatedToast'));
      void navigate(`/console/templates/${created.id}`);
    } catch (err) {
      toast.error(toUserMessage(err) || t('template.actionFailed'));
    }
  };

  const setDefault = async (template: TemplateResponse) => {
    try {
      await setDefaultMutation.mutateAsync(template.id);
      toast.success(t('template.defaultToast'));
    } catch (err) {
      toast.error(toUserMessage(err) || t('template.actionFailed'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(t('template.deletedToast'));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toUserMessage(err) || t('template.actionFailed'));
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('nav.templates')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('template.listDescription')}</p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link to="/console/templates/new">
              <Plus className="size-4" aria-hidden />
              {t('template.newTemplate')}
            </Link>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button disabled>
                  <Plus className="size-4" aria-hidden />
                  {t('template.newTemplate')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('template.locked')}</TooltipContent>
          </Tooltip>
        )}
      </header>

      {!canManage && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-4 p-4">
            <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {t('template.freeBannerTitle')}
              </p>
              <p className="text-sm text-muted-foreground">{t('template.freeBannerBody')}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/console/settings">{t('billing.seePlans')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <QueryBoundary
        name="templates"
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
          <motion.div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            variants={listContainerVariants}
            initial="initial"
            animate="animate"
          >
            {data.items.map((template) => (
              <motion.div
                key={template.id}
                variants={listItemVariants}
                transition={getTransition(listItemTransition)}
              >
                <Card className="flex h-full flex-col overflow-hidden">
                  <div className="flex justify-center border-b border-border bg-muted/40 p-4">
                    {canManage ? (
                      <Link
                        to={`/console/templates/${template.id}`}
                        aria-label={t('template.editAria', { name: template.name })}
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
                        {t('template.defaultBadge')}
                      </span>
                    )}
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('template.actions')}>
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => void navigate(`/console/templates/${template.id}`)}
                          >
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void duplicate(template)}>
                            {t('template.duplicate')}
                          </DropdownMenuItem>
                          {!template.isDefault && (
                            <DropdownMenuItem onSelect={() => void setDefault(template)}>
                              {t('template.setDefault')}
                            </DropdownMenuItem>
                          )}
                          {!template.isDefault && (
                            <DropdownMenuItem
                              destructive
                              onSelect={() => setDeleteTarget(template)}
                            >
                              {t('common.delete')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </QueryBoundary>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('template.deleteTitle')}
        description={
          deleteTarget ? t('template.deleteBody', { name: deleteTarget.name }) : undefined
        }
        confirmLabel={t('template.deleteConfirm')}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
