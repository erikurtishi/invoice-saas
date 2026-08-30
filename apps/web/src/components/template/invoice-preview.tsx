import { paperGeometry, type PaperSize, renderInvoiceHtml } from '@invoice-saas/shared';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { env } from '../../config/env';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { cn } from '../../lib/cn';

/** mm → CSS px at 96dpi. */
const MM_TO_PX = 96 / 25.4;

export interface InvoicePreviewProps {
  /** A `TemplateConfig` (parsed or raw — the renderer re-parses). */
  config: unknown;
  /** An `InvoiceRenderData` (parsed or raw). */
  data: unknown;
  /** Paper size, to size the page box; defaults to A4 if not derivable. */
  paperSize?: PaperSize;
  /** `'fit'` scales the page to the container width; a number is an explicit zoom. */
  zoom?: number | 'fit';
  /** Debounce (ms) before the iframe reloads — keeps typing smooth (3.2.9). */
  debounceMs?: number;
  className?: string;
  title?: string;
}

/**
 * Live invoice preview (backlog 3.1.2 / 3.2.2 / 3.2.8). The shared render engine's
 * HTML goes into a sandboxed `<iframe srcDoc>` so the invoice's own CSS is fully
 * isolated from the app — what shows here is the exact DOM the PDF is made from.
 *
 * The page renders at its true mm size (converted to px) and is scaled with a CSS
 * transform for zoom / fit-to-width; the wrapper is sized to the scaled box so
 * scrollbars stay correct. HTML regeneration is debounced and memoised so holding
 * a key in the accent-hex field doesn't thrash the iframe (3.2.9).
 */
export const InvoicePreview = memo(function InvoicePreview({
  config,
  data,
  paperSize = 'A4',
  zoom = 'fit',
  debounceMs = 180,
  className,
  title = 'Invoice preview',
}: InvoicePreviewProps) {
  const html = useMemo(
    () => renderInvoiceHtml(config, data, { media: 'screen', assetBaseUrl: env.VITE_API_URL }),
    [config, data],
  );
  const debouncedHtml = useDebouncedValue(html, debounceMs);

  const geo = paperGeometry(paperSize);
  const pageWidthPx = Math.round(geo.widthMm * MM_TO_PX);
  const pageHeightPx = Math.round(geo.heightMm * MM_TO_PX);

  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  useLayoutEffect(() => {
    if (zoom !== 'fit') return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const available = el.clientWidth - 32; // matches the p-4 padding
      setFitScale(Math.min(1, Math.max(0.2, available / pageWidthPx)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [zoom, pageWidthPx]);

  const scale = zoom === 'fit' ? fitScale : zoom;

  return (
    <div ref={containerRef} className={cn('h-full w-full overflow-auto bg-muted p-4', className)}>
      <div className="mx-auto" style={{ width: pageWidthPx * scale, height: pageHeightPx * scale }}>
        <iframe
          title={title}
          srcDoc={debouncedHtml}
          sandbox=""
          style={{
            width: pageWidthPx,
            height: pageHeightPx,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 0,
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08)',
          }}
        />
      </div>
    </div>
  );
});
