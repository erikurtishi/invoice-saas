import {
  DOCUMENT_TYPES,
  type DocumentType,
  type InvoiceRenderData,
  LANGUAGE_ENDONYMS,
  PROFILE_LANGUAGES,
  type ProfileLanguage,
  sampleInvoiceData,
  type TemplateConfig,
} from '@invoice-saas/shared';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Select, Tabs, TabsContent, TabsList, TabsTrigger } from '../ui';
import { EditorControls } from './editor-controls';
import { InvoicePreview } from './invoice-preview';
import { usePreviewZoom } from './use-preview-zoom';

export interface TemplateEditorProps {
  config: TemplateConfig;
  onChange: (config: TemplateConfig) => void;
  /** Sample data for the preview; defaults to the shared trilingual sample. */
  previewData?: (language: ProfileLanguage, documentType: DocumentType) => InvoiceRenderData;
  /** Full-width bar above the split — name field, Save/Cancel (3.3 / 4.2.4). */
  header?: ReactNode;
}

/**
 * The visual template editor (backlog Epic 3.2): a controls panel and a live
 * preview that updates as you change toggles, colours, fonts, logo and block
 * order. Side-by-side on desktop, tabbed on tablet/mobile (3.2.1). The preview is
 * the shared render engine in `screen` mode, debounced and memoised so it stays
 * smooth while typing (3.2.9); a real PDF is only made on download/send.
 *
 * State lives in the parent (`config` / `onChange`) so the same editor works
 * standalone (3.3 "New template") and inline in the invoice form (4.2.4).
 */
export function TemplateEditor({ config, onChange, previewData, header }: TemplateEditorProps) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<ProfileLanguage>('EN');
  const [documentType, setDocumentType] = useState<DocumentType>('INVOICE');
  const zoom = usePreviewZoom();

  const data = useMemo(
    () =>
      previewData
        ? previewData(language, documentType)
        : sampleInvoiceData({ language, documentType }),
    [previewData, language, documentType],
  );

  const controls = (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <EditorControls config={config} onChange={onChange} />
    </div>
  );

  const previewToolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <Select
        aria-label={t('template.previewLanguage')}
        className="h-8 w-28 text-xs"
        options={PROFILE_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_ENDONYMS[l] }))}
        value={language}
        onValueChange={(v) => setLanguage(v as ProfileLanguage)}
      />
      <Select
        aria-label={t('template.previewType')}
        className="h-8 w-36 text-xs"
        options={DOCUMENT_TYPES.map((dt) => ({ value: dt, label: t(`docTypes.${dt}`) }))}
        value={documentType}
        onValueChange={(v) => setDocumentType(v as DocumentType)}
      />
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label={t('template.zoomOut')}
          onClick={zoom.zoomOut}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {zoom.zoom === 'fit' ? t('template.fit') : `${Math.round(zoom.zoom * 100)}%`}
        </span>
        <Button size="icon" variant="ghost" aria-label={t('template.zoomIn')} onClick={zoom.zoomIn}>
          <Plus className="size-4" aria-hidden />
        </Button>
        <Button size="icon" variant="ghost" aria-label={t('template.fit')} onClick={zoom.fit}>
          <Maximize2 className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );

  const preview = (
    <div className="flex h-full flex-col">
      {previewToolbar}
      <div className="min-h-0 flex-1">
        <InvoicePreview config={config} data={data} paperSize={config.paperSize} zoom={zoom.zoom} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {header}

      {/* Desktop: side by side. */}
      <div className="hidden min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="flex min-h-0 flex-col border-r border-border">{controls}</div>
        <div className="min-h-0">{preview}</div>
      </div>

      {/* Tablet / mobile: tabbed. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <Tabs defaultValue="design" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-3 mt-3 self-start">
            <TabsTrigger value="design">{t('template.designTab')}</TabsTrigger>
            <TabsTrigger value="preview">{t('template.previewTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="design" className="mt-0 flex min-h-0 flex-1 flex-col">
            {controls}
          </TabsContent>
          <TabsContent value="preview" className="mt-0 min-h-0 flex-1">
            {preview}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
