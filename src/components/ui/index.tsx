'use client';

import React, { createContext, useContext, useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/60',
    secondary:
      'border bg-[rgb(var(--surface-raised))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-muted))]',
    ghost: 'text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-muted))] hover:text-[rgb(var(--text))]',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-70',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="muted mt-0.5 text-xs">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-[rgb(var(--surface-muted))] text-[rgb(var(--text-muted))] border-transparent',
    brand: 'bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand-950/50 dark:text-brand-200 dark:border-brand-900',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    danger: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    info: 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const STATUS_TONES: Record<string, BadgeTone> = {
  NEW: 'info',
  LEAD: 'brand',
  ACTIVE: 'success',
  RETURNING: 'brand',
  INACTIVE: 'neutral',
  VIP: 'warning',
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  URGENT: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
  PENDING: 'warning',
  CONFIRMED: 'info',
  CANCELLED: 'danger',
  NO_SHOW: 'danger',
  PAID: 'success',
  FULFILLED: 'success',
  REFUNDED: 'warning',
  UNPAID: 'warning',
  OPEN: 'info',
  ESCALATED: 'danger',
  CLOSED: 'neutral',
  RESOLVED: 'success',
  DRAFT: 'neutral',
  GENERATED: 'info',
  APPROVED: 'success',
  SCHEDULED: 'brand',
  PUBLISHED: 'success',
  WON: 'success',
  LOST: 'danger',
  NEGOTIATION: 'warning',
  PROPOSAL: 'brand',
  QUALIFIED: 'info',
  CONTACTED: 'neutral',
  NEW_LEAD: 'info',
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
};

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{label.charAt(0) + label.slice(1).toLowerCase()}</Badge>;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <label className="label">
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="muted mt-1 text-xs">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('input', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('input min-h-[96px] resize-y', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn('input', className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2 text-sm', className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border" {...props} />
      <span>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('card animate-fade-in my-8 w-full p-0', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? <p className="muted mt-1 text-sm">{description}</p> : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 transition hover:bg-[rgb(var(--surface-muted))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center">
      {icon ? <div className="muted mb-3">{icon}</div> : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? <p className="muted mt-1 max-w-md text-sm">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    success:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    warning:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
  };
  return (
    <div className={cn('rounded-xl border p-3 text-sm', tones[tone])} role="status">
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
    </div>
  );
}

export function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'warning' | 'danger' }) {
  const tones = { brand: 'bg-brand-600', warning: 'bg-amber-500', danger: 'bg-red-600' };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]">
      <div className={cn('h-full rounded-full transition-all', tones[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Stat({
  label,
  value,
  change,
  hint,
  tone,
}: {
  label: string;
  value: string;
  change?: number;
  hint?: string;
  tone?: 'positive' | 'warning' | 'critical' | 'info';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : tone === 'critical'
          ? 'text-red-600'
          : '';
  return (
    <div className="card p-4">
      <p className="muted text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn('text-2xl font-semibold', toneClass)}>{value}</span>
        {change !== undefined && Number.isFinite(change) ? (
          <span
            className={cn(
              'text-xs font-medium',
              change >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}
          >
            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </span>
        ) : null}
      </div>
      {hint ? <p className="muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border p-1" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            active === tab.id
              ? 'bg-brand-600 text-white'
              : 'muted hover:bg-[rgb(var(--surface-muted))]',
          )}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="ml-1.5 opacity-80">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast (lightweight, used for form feedback)
// ---------------------------------------------------------------------------
type ToastMessage = { id: number; tone: 'success' | 'danger' | 'info'; message: string };
const ToastContext = createContext<{ push: (message: string, tone?: ToastMessage['tone']) => void }>({
  push: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const push = (message: string, tone: ToastMessage['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setMessages((current) => [...current, { id, tone, message }]);
    setTimeout(() => setMessages((current) => current.filter((item) => item.id !== id)), 5000);
  };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {messages.map((message) => (
          <div
            key={message.id}
            role="status"
            className={cn(
              'animate-fade-in pointer-events-auto rounded-xl border p-3 text-sm shadow-float',
              message.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200'
                : message.tone === 'danger'
                  ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/80 dark:text-red-200'
                  : 'card',
            )}
          >
            {message.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Fetch helper used by every client form
// ---------------------------------------------------------------------------
export async function apiRequest<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string; status: number }> {
  const response = await fetch(url, {
    method: options.method ?? 'POST',
    headers: options.formData ? undefined : { 'content-type': 'application/json' },
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return {
      ok: false,
      error: payload?.error?.message ?? 'Something went wrong. Please try again.',
      code: payload?.error?.code,
      status: response.status,
    };
  }
  return { ok: true, data: (payload?.data ?? {}) as T };
}
