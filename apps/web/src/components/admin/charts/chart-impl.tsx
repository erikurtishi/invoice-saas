import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useReducedMotion } from '../../../lib/motion-presets';

/**
 * The only module in the web app that imports `recharts` (decision `D34`). It is
 * pulled in exclusively through `React.lazy()` from `admin-chart.tsx`, so the
 * recharts bundle is code-split and never reaches the console or marketing
 * chunks.
 *
 * Theme-aware for free: every colour is a CSS custom property (`var(--color-*)`),
 * which SVG resolves through the normal cascade — so the charts follow
 * light/dark exactly like the rest of the app, with no JS theme probing. Motion
 * is disabled under `prefers-reduced-motion`.
 */

export interface ChartPoint {
  /** X-axis category label (already localised / formatted by the caller). */
  label: string;
  value: number;
}

export interface ChartImplProps {
  data: ChartPoint[];
  /** Formats a Y value for the axis ticks and the tooltip. */
  valueFormatter?: (value: number) => string;
  /** Screen-reader description of the whole chart. */
  ariaLabel: string;
  /** Cap the number of X-axis tick labels so a long series stays readable. */
  maxXTicks?: number;
}

const AXIS_TICK = { fill: 'var(--color-muted-foreground)', fontSize: 11 } as const;
const TOOLTIP_STYLE = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-popover-foreground)',
  fontSize: 12,
} as const;

function xTickInterval(count: number, maxXTicks: number): number {
  if (count <= maxXTicks) return 0;
  return Math.ceil(count / maxXTicks) - 1;
}

export function LineChartImpl({ data, valueFormatter, ariaLabel, maxXTicks = 8 }: ChartImplProps) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
        role="img"
        aria-label={ariaLabel}
      >
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          interval={xTickInterval(data.length, maxXTicks)}
          minTickGap={8}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={48}
          {...(valueFormatter ? { tickFormatter: valueFormatter } : {})}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'var(--color-muted-foreground)' }}
          {...(valueFormatter
            ? { formatter: (value: unknown) => valueFormatter(Number(value)) }
            : {})}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={!reduced}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarChartImpl({ data, valueFormatter, ariaLabel, maxXTicks = 8 }: ChartImplProps) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
        role="img"
        aria-label={ariaLabel}
      >
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          interval={xTickInterval(data.length, maxXTicks)}
          minTickGap={8}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={48}
          {...(valueFormatter ? { tickFormatter: valueFormatter } : {})}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-muted)' }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: 'var(--color-muted-foreground)' }}
          {...(valueFormatter
            ? { formatter: (value: unknown) => valueFormatter(Number(value)) }
            : {})}
        />
        <Bar
          dataKey="value"
          fill="var(--color-primary)"
          radius={[3, 3, 0, 0]}
          isAnimationActive={!reduced}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
