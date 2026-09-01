import { type ReactNode, Suspense, lazy } from 'react';

import { cn } from '../../lib/cn';
import type { ChartImplProps, ChartPoint } from './charts/chart-impl';

/**
 * The admin center's chart entry point (decision `D34`). `recharts` is heavy and
 * only ever used here, so the implementation module is `React.lazy()`-loaded and
 * split into its own bundle — nothing chart-related lands in the base admin chunk
 * until a screen actually renders a chart.
 *
 * Two shapes are exposed, `<AdminLineChart>` and `<AdminBarChart>`; both take a
 * flat `ChartPoint[]` and an `ariaLabel`. Height is fixed by the wrapper so the
 * lazy boundary reserves layout and there is no content jump when the bundle
 * resolves.
 */

export type { ChartPoint } from './charts/chart-impl';

const LineChartImpl = lazy(() =>
  import('./charts/chart-impl').then((m) => ({ default: m.LineChartImpl })),
);
const BarChartImpl = lazy(() =>
  import('./charts/chart-impl').then((m) => ({ default: m.BarChartImpl })),
);

interface AdminChartProps extends Omit<ChartImplProps, 'data'> {
  data: ChartPoint[];
  /** Wrapper height in px. Default 240. */
  height?: number;
  className?: string;
}

function ChartFrame({
  height,
  className,
  children,
}: {
  height: number;
  className: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <Suspense
        fallback={
          <div
            className="size-full animate-pulse rounded-md bg-muted"
            role="status"
            aria-label="Loading chart"
          />
        }
      >
        {children}
      </Suspense>
    </div>
  );
}

export function AdminLineChart({ height = 240, className, ...props }: AdminChartProps) {
  return (
    <ChartFrame height={height} className={className}>
      <LineChartImpl {...props} />
    </ChartFrame>
  );
}

export function AdminBarChart({ height = 240, className, ...props }: AdminChartProps) {
  return (
    <ChartFrame height={height} className={className}>
      <BarChartImpl {...props} />
    </ChartFrame>
  );
}
