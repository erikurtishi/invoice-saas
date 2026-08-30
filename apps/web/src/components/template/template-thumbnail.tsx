import {
  paperGeometry,
  renderInvoiceHtml,
  sampleInvoiceData,
  type TemplateConfig,
} from '@invoice-saas/shared';
import { useMemo } from 'react';

import { env } from '../../config/env';
import { cn } from '../../lib/cn';

const MM_TO_PX = 96 / 25.4;
const THUMB_WIDTH = 220;

export interface TemplateThumbnailProps {
  config: TemplateConfig;
  className?: string;
}

/**
 * A small, non-interactive render of a template (backlog 3.3.2 — "visual thumbnail
 * previews, not just names"). Same render engine as the editor and the PDF, just
 * scaled down into a `pointer-events: none` iframe so the list shows real designs,
 * not names.
 */
export function TemplateThumbnail({ config, className }: TemplateThumbnailProps) {
  const html = useMemo(
    () =>
      renderInvoiceHtml(config, sampleInvoiceData(), {
        media: 'screen',
        assetBaseUrl: env.VITE_API_URL,
      }),
    [config],
  );

  const geo = paperGeometry(config.paperSize);
  const pageW = Math.round(geo.widthMm * MM_TO_PX);
  const pageH = Math.round(geo.heightMm * MM_TO_PX);
  const scale = THUMB_WIDTH / pageW;

  return (
    <div
      className={cn('overflow-hidden rounded border border-border bg-white', className)}
      style={{ width: THUMB_WIDTH, height: Math.round(pageH * scale) }}
    >
      <iframe
        title=""
        aria-hidden
        tabIndex={-1}
        srcDoc={html}
        sandbox=""
        style={{
          width: pageW,
          height: pageH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
