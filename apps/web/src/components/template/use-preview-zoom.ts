import { useState } from 'react';

/** Discrete zoom steps for the preview's manual zoom control (backlog 3.2.8). */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export interface PreviewZoom {
  zoom: number | 'fit';
  setZoom: (zoom: number | 'fit') => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

/**
 * Drives `<InvoicePreview>`'s `zoom` prop: a `fit`-to-width default plus `+`/`−`
 * stepping through `ZOOM_STEPS` (backlog 3.2.8). Kept out of `invoice-preview.tsx`
 * so that file only exports the component (Fast Refresh).
 */
export function usePreviewZoom(): PreviewZoom {
  const [zoom, setZoom] = useState<number | 'fit'>('fit');

  const zoomIn = () =>
    setZoom((z) => {
      const current = z === 'fit' ? 1 : z;
      return ZOOM_STEPS.find((step) => step > current + 0.001) ?? current;
    });

  const zoomOut = () =>
    setZoom((z) => {
      const current = z === 'fit' ? 1 : z;
      return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? current;
    });

  return { zoom, setZoom, zoomIn, zoomOut, fit: () => setZoom('fit') };
}
