import {
  defaultTemplateConfig,
  type TemplateConfig,
  type TemplateResponse,
  templateNameSchema,
} from '@invoice-saas/shared';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { TemplateEditor } from '../../components/template/template-editor';
import { QueryBoundary } from '../../components/state/query-boundary';
import { SkeletonForm } from '../../components/state/skeletons';
import { Button, ConfirmDialog, Input } from '../../components/ui';
import { useSession } from '../../features/auth/use-auth';
import {
  useCreateTemplate,
  useTemplate,
  useUpdateTemplate,
} from '../../features/templates/use-templates';
import { useToast } from '../../hooks/use-toast';
import { toUserMessage } from '../../lib/error-message';

/** TODO(X.1.1): placeholder copy, see D9. */
const COPY = {
  back: 'Templates',
  namePlaceholder: 'Template name',
  nameRequired: 'Enter a template name.',
  save: 'Save',
  saveNew: 'Create template',
  saved: 'Template saved.',
  created: 'Template created.',
  saveFailed: "Couldn't save this template. Try again.",
  unsaved: 'Unsaved changes',
  discardTitle: 'Discard changes?',
  discardBody: 'Your edits to this template will be lost.',
  discardConfirm: 'Discard',
} as const;

/**
 * The template editor screen (backlog 3.3 — hosting the Epic 3.2 editor with
 * persistence). `/templates/new` starts from the default config; `/templates/:id`
 * loads an existing one. Free tier can't reach here (3.3.6) — bounced to the list.
 */
export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useSession();

  if (user && user.tier === 'FREE') return <Navigate to="/templates" replace />;

  if (id === undefined) return <EditorForm mode="new" />;
  return <LoadExisting id={id} />;
}

function LoadExisting({ id }: { id: string }) {
  const query = useTemplate(id);
  return (
    <QueryBoundary query={query} loading={<SkeletonForm fields={6} />} isEmpty={() => false}>
      {(template) => <EditorForm mode="edit" template={template} />}
    </QueryBoundary>
  );
}

interface EditorFormProps {
  mode: 'new' | 'edit';
  template?: TemplateResponse;
}

function EditorForm({ mode, template }: EditorFormProps) {
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
    void navigate('/templates');
  };
  const onBack = () => {
    if (dirty) setShowDiscard(true);
    else leave();
  };

  const save = async () => {
    const parsedName = templateNameSchema.safeParse(name);
    if (!parsedName.success) {
      setNameError(parsedName.error.issues[0]?.message ?? COPY.nameRequired);
      return;
    }
    setNameError(null);
    const input = { name: parsedName.data, config };
    try {
      if (mode === 'edit' && template) {
        await updateMutation.mutateAsync({ id: template.id, input });
        toast.success(COPY.saved);
      } else {
        await createMutation.mutateAsync(input);
        toast.success(COPY.created);
      }
      void navigate('/templates');
    } catch (err) {
      toast.error(toUserMessage(err) || COPY.saveFailed);
    }
  };

  const header = (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-3 py-2">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        {COPY.back}
      </Button>
      <div className="flex min-w-0 flex-1 flex-col">
        <Input
          aria-label={COPY.namePlaceholder}
          placeholder={COPY.namePlaceholder}
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
      {dirty && <span className="text-xs text-muted-foreground">{COPY.unsaved}</span>}
      <Button
        onClick={() => void save()}
        isLoading={isPending}
        disabled={mode === 'edit' && !dirty}
      >
        {mode === 'edit' ? COPY.save : COPY.saveNew}
      </Button>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-9rem)] min-h-[560px] overflow-hidden rounded-lg border border-border">
      <TemplateEditor config={config} onChange={setConfig} header={header} />

      <ConfirmDialog
        open={showDiscard}
        onOpenChange={setShowDiscard}
        title={COPY.discardTitle}
        description={COPY.discardBody}
        confirmLabel={COPY.discardConfirm}
        destructive
        onConfirm={leave}
      />
    </div>
  );
}
