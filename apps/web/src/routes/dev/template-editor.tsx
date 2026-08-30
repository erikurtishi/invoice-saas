import { defaultTemplateConfig, TEMPLATE_PRESETS, type TemplateConfig } from '@invoice-saas/shared';
import { useState } from 'react';

import { TemplateEditor } from '../../components/template/template-editor';
import { Button } from '../../components/ui';

/**
 * Dev-only host for the visual template editor (backlog Epic 3.2), mounted at
 * `/dev/template-editor` when `import.meta.env.DEV`. Not the real Templates pages
 * (3.3 adds those with save/load) — just enough to exercise every control against
 * the live preview.
 */
export function TemplateEditorDevPage() {
  const [config, setConfig] = useState<TemplateConfig>(() => defaultTemplateConfig());
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Start from:</span>
        {TEMPLATE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            variant="outline"
            onClick={() => setConfig(preset.config)}
          >
            {preset.name}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setConfig(defaultTemplateConfig())}>
          Reset
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => setShowJson((v) => !v)}
        >
          {showJson ? 'Hide' : 'Show'} JSON
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <TemplateEditor config={config} onChange={setConfig} />
      </div>

      {showJson && (
        <pre className="max-h-48 overflow-auto border-t border-border bg-muted p-3 text-xs">
          {JSON.stringify(config, null, 2)}
        </pre>
      )}
    </div>
  );
}
