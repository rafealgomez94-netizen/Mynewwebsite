'use client';

import { formatMoney, formatNumber } from '@/lib/utils';

type Point = { label: string; value: number; hint?: string };

export function LineChart({
  data,
  currency = 'USD',
  height = 200,
  ariaLabel,
}: {
  data: Point[];
  currency?: string;
  height?: number;
  ariaLabel: string;
}) {
  if (!data.length) {
    return <p className="muted py-10 text-center text-sm">No data recorded for this period yet.</p>;
  }
  const width = 640;
  const padding = { top: 16, right: 16, bottom: 28, left: 56 };
  const max = Math.max(...data.map((point) => point.value), 1);
  const step = (width - padding.left - padding.right) / Math.max(data.length - 1, 1);
  const scaleY = (value: number) => height - padding.bottom - (value / max) * (height - padding.top - padding.bottom);

  const linePoints = data.map((point, index) => `${padding.left + index * step},${scaleY(point.value)}`).join(' ');
  const areaPoints = `${padding.left},${height - padding.bottom} ${linePoints} ${padding.left + (data.length - 1) * step},${height - padding.bottom}`;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      preserveAspectRatio="none"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          x1={padding.left}
          x2={width - padding.right}
          y1={scaleY(max * ratio)}
          y2={scaleY(max * ratio)}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={1}
        />
      ))}
      <polygon points={areaPoints} fill="rgb(30 99 239 / 0.12)" />
      <polyline points={linePoints} fill="none" stroke="rgb(30 99 239)" strokeWidth={2.5} strokeLinejoin="round" />
      {data.map((point, index) => (
        <circle
          key={`${point.label}-${index}`}
          cx={padding.left + index * step}
          cy={scaleY(point.value)}
          r={3}
          fill="rgb(30 99 239)"
        >
          <title>{`${point.label}: ${formatMoney(point.value, currency)}`}</title>
        </circle>
      ))}
      <text x={4} y={padding.top + 4} className="fill-current text-[10px] opacity-60">
        {formatMoney(max, currency)}
      </text>
      <text x={4} y={height - padding.bottom} className="fill-current text-[10px] opacity-60">
        0
      </text>
      {data.map((point, index) =>
        index % Math.ceil(data.length / 6) === 0 || index === data.length - 1 ? (
          <text
            key={`label-${point.label}-${index}`}
            x={padding.left + index * step}
            y={height - 8}
            textAnchor="middle"
            className="fill-current text-[10px] opacity-60"
          >
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function BarChart({
  data,
  currency = 'USD',
  ariaLabel,
}: {
  data: Point[];
  currency?: string;
  ariaLabel: string;
}) {
  if (!data.length) return <p className="muted py-8 text-center text-sm">Nothing to chart yet.</p>;
  const max = Math.max(...data.map((point) => point.value), 1);
  return (
    <div className="space-y-3" role="img" aria-label={ariaLabel}>
      {data.map((point) => (
        <div key={point.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs" title={point.label}>
            {point.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.max(4, (point.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-medium">
            {currency ? formatMoney(point.value, currency) : formatNumber(point.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  data,
  ariaLabel,
}: {
  data: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <p className="muted py-8 text-center text-sm">No data yet.</p>;
  const colors = ['#1e63ef', '#59a5ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64738d'];
  let offset = 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-wrap items-center gap-6" role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 140 140" className="h-36 w-36">
        <g transform="translate(70,70) rotate(-90)">
          {data.map((item, index) => {
            const fraction = item.value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={item.label}
                r={radius}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth={16}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
        </g>
        <text x="70" y="68" textAnchor="middle" className="fill-current text-[18px] font-semibold">
          {formatNumber(total)}
        </text>
        <text x="70" y="86" textAnchor="middle" className="fill-current text-[9px] opacity-60">
          TOTAL
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: colors[index % colors.length] }}
              aria-hidden
            />
            <span className="muted">{item.label}</span>
            <span className="font-medium">{formatNumber(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ values, ariaLabel }: { values: number[]; ariaLabel: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 28 - ((value - min) / Math.max(max - min, 1)) * 26;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full" role="img" aria-label={ariaLabel} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="rgb(30 99 239)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
