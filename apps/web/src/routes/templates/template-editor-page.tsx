import {
  defaultTemplateConfig,
  type TemplateConfig,
  type TemplateResponse,
  templateNameSchema,
} from '@invoice-saas/shared';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { TemplateEditor } from '../../components/template/template-editor';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonTemplateEditor } from '../../components/state/skeletons';
import { Button, ConfirmDialog, Input } from '../../components/ui';
import { useSession } from '../../features/auth/use-auth';
import {
  useCreateTemplate,
  useTemplate,
  useUpdateTemplate,
} from '../../features/templates/use-templates';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';

/**
 * The template editor screen (backlog 3.3 — hosting the Epic 3.2 editor with
 * persistence). `/templates/new` starts from the default config; `/templates/:id`
 * loads an existing one. Free tier can't reach here (3.3.6) — bounced to the list.
 */
export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useSession();

  if (user && user.tier === 'FREE') return <Navigate to="/console/templates" replace />;

  if (id === undefined) return <EditorForm mode="new" />;
  return <LoadExisting id={id} />;
}

function LoadExisting({ id }: { id: string }) {
  const query = useTemplate(id);
  return (
    <QueryBoundary
      query={query}
      loading={
        <div className="h-[calc(100dvh-9rem)] min-h-[560px]">
          <SkeletonTemplateEditor />
        </div>
      }
      isEmpty={() => false}
    >
      {(template) => <EditorForm mode="edit" template={template} />}
    </QueryBoundary>
  );
}

interface EditorFormProps {
  mode: 'new' | 'edit';
  template?: TemplateResponse;
}

function EditorForm({ mode, template }: EditorFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const initialConfig = template?.config ?? defaultTemplateConfig();
  const initialName = template?.name ?? '';

  const [config, setConfig] = useState<TemplateConfig>(initialConfig);
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const dirty = name !== initialName || JSON.stringify(config) !== JSON.stringify(initialConfig);

  const leave = () => {
    void navigate('/console/templates');
  };
  const onBack = () => {
    if (dirty) setShowDiscard(true);
    else leave();
  };

  const save = async () => {
    const parsedName = templateNameSchema.safeParse(name);
    if (!parsedName.success) {
      setNameError(parsedName.error.issues[0]?.message ?? t('templateEditor.nameRequired'));
      return;
    }
    setNameError(null);
    const input = { name: parsedName.data, config };
    try {
      if (mode === 'edit' && template) {
        await updateMutation.mutateAsync({ id: template.id, input });
        toast.success(t('templateEditor.saved'));
      } else {
        await createMutation.mutateAsync(input);
        toast.success(t('templateEditor.created'));
      }
      void navigate('/console/templates');
    } catch (err) {
      toast.error(toUserMessage(err) || t('templateEditor.saveFailed'));
    }
  };

  const header = (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-3 py-2">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        {t('nav.templates')}
      </Button>
      <div className="flex min-w-0 flex-1 flex-col">
        <Input
          aria-label={t('templateEditor.namePlaceholder')}
          placeholder={t('templateEditor.namePlaceholder')}
          value={name}
          invalid={nameError !== null}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          className="max-w-xs"
        />
        {nameError && <span className="mt-1 text-xs text-destructive">{nameError}</span>}
      </div>
      {dirty && (
        <span className="text-xs text-muted-foreground">{t('templateEditor.unsaved')}</span>
      )}
      <Button
        onClick={() => void save()}
        isLoading={isPending}
        disabled={mode === 'edit' && !dirty}
      >
        {mode === 'edit' ? t('common.save') : t('templateEditor.saveNew')}
      </Button>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-9rem)] min-h-[560px] overflow-hidden rounded-lg border border-border">
      <TemplateEditor config={config} onChange={setConfig} header={header} />

      <ConfirmDialog
        open={showDiscard}
        onOpenChange={setShowDiscard}
        title={t('templateEditor.discardTitle')}
        description={t('templateEditor.discardBody')}
        confirmLabel={t('templateEditor.discardConfirm')}
        destructive
        onConfirm={leave}
      />
    </div>
  );
}
