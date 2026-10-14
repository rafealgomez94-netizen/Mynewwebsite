import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles, TriangleAlert } from 'lucide-react';
import { Badge, Card, StatusBadge } from '@/components/ui';
import { channelLabel } from '@/lib/domain';
import { formatDate, formatDateTime, formatMoney, relativeTime } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  action,
  meta,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="muted mt-1 max-w-2xl text-sm">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action}
    </div>
  );
}

export type InsightView = {
  id: string;
  kind: 'CALCULATED' | 'AI_RECOMMENDATION';
  severity: 'positive' | 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  action?: { label: string; href?: string };
};

export function InsightList({ insights, limit }: { insights: InsightView[]; limit?: number }) {
  const items = limit ? insights.slice(0, limit) : insights;
  if (!items.length) {
    return <p className="muted text-sm">No insights yet — record some sales, appointments or customers and the analysis will appear here.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((insight) => {
        const Icon =
          insight.severity === 'critical'
            ? TriangleAlert
            : insight.severity === 'warning'
              ? AlertTriangle
              : insight.severity === 'positive'
                ? CheckCircle2
                : Info;
        return (
          <li key={insight.id} className="flex gap-3 rounded-xl border p-3">
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                insight.severity === 'critical'
                  ? 'text-red-600'
                  : insight.severity === 'warning'
                    ? 'text-amber-600'
                    : insight.severity === 'positive'
                      ? 'text-emerald-600'
                      : 'text-brand-600'
              }`}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{insight.title}</p>
                {insight.kind === 'AI_RECOMMENDATION' ? (
                  <Badge tone="brand">
                    <Sparkles className="h-3 w-3" /> AI recommendation
                  </Badge>
                ) : (
                  <Badge tone="info">Calculated</Badge>
                )}
              </div>
              <p className="muted mt-1 text-sm">{insight.detail}</p>
              {insight.action?.href ? (
                <Link
                  href={insight.action.href}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                >
                  {insight.action.label} <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DataTable({
  columns,
  children,
  empty,
}: {
  columns: string[];
  children: React.ReactNode;
  empty?: string;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  if (!hasRows && empty) {
    return <p className="muted p-4 text-sm">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((column) => (
              <th key={column} className="table-head px-3 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function SimpleRow({
  cells,
  href,
}: {
  cells: (React.ReactNode | string)[];
  href?: string;
}) {
  const content = cells.map((cell, index) => (
    <td key={index} className="px-3 py-2.5 align-middle">
      {cell}
    </td>
  ));
  if (href) {
    return (
      <tr className="table-row cursor-pointer border-b last:border-b-0">
        {cells.map((cell, index) => (
          <td key={index} className="px-3 py-2.5 align-middle">
            <Link href={href} className="block">
              {cell}
            </Link>
          </td>
        ))}
      </tr>
    );
  }
  return <tr className="border-b last:border-b-0">{content}</tr>;
}

export function ConversationPreview({
  channel,
  contact,
  preview,
  status,
  lastMessageAt,
  needsHuman,
  href,
}: {
  channel: string;
  contact: string | null;
  preview: string | null;
  status: string;
  lastMessageAt: string;
  needsHuman: boolean;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-xl border p-3 transition hover:bg-[rgb(var(--surface-muted))]">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{contact ?? 'Website visitor'}</p>
        <StatusBadge status={needsHuman ? 'ESCALATED' : status} />
      </div>
      <p className="muted mt-1 line-clamp-2 text-xs">{preview ?? 'No messages yet'}</p>
      <p className="muted mt-2 text-[11px]">
        {channelLabel(channel)} · {relativeTime(lastMessageAt)}
      </p>
    </Link>
  );
}

export function MetricRow({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: number;
}) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-b-0">
      <span className="muted text-sm">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium">
        {value}
        {change !== undefined ? (
          <span className={change >= 0 ? 'text-xs text-emerald-600' : 'text-xs text-red-600'}>
            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function OrderCells({
  number,
  customer,
  totalCents,
  status,
  placedAt,
  currency,
}: {
  number: string;
  customer: string | null;
  totalCents: number;
  status: string;
  placedAt: string;
  currency: string;
}) {
  return (
    <>
      <span className="font-medium">{number}</span>
      <span>{customer ?? 'Walk-in'}</span>
      <span>{formatMoney(totalCents, currency)}</span>
      <StatusBadge status={status} />
      <span className="muted text-xs">{formatDate(placedAt)}</span>
    </>
  );
}

export function AppointmentCells({
  title,
  startAt,
  customer,
  staff,
  status,
}: {
  title: string;
  startAt: string;
  customer: string | null;
  staff: string | null;
  status: string;
}) {
  return (
    <>
      <span className="font-medium">{title}</span>
      <span>{formatDateTime(startAt)}</span>
      <span>{customer ?? '—'}</span>
      <span>{staff ?? 'Unassigned'}</span>
      <StatusBadge status={status} />
    </>
  );
}

export { Card, Badge };
