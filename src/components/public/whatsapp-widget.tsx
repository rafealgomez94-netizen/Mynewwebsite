'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { SUPPORT, whatsappHref } from '@/lib/domain';

/**
 * Floating WhatsApp contact widget. Points at the manager's WhatsApp number and
 * keeps the platform's support channels one tap away on every public page.
 */
export function WhatsAppWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  // The dashboard and admin areas have their own support entry points.
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/admin') || pathname?.startsWith('/support/')) {
    return null;
  }

  const whatsappDirectHref = whatsappHref('Hi! I would like to know more about Workspace Digital for my business.');

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 print:hidden">
      {open ? (
        <div className="w-[280px] rounded-2xl border bg-[rgb(var(--surface-raised))] p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Chat with us on WhatsApp</p>
              <p className="muted mt-0.5 text-xs">Speak directly to the manager — usually a few minutes.</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close WhatsApp panel" className="muted hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
          </div>
          <a
            href={whatsappDirectHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" /> Open WhatsApp
          </a>
          <div className="muted mt-3 space-y-1 text-xs">
            <p>WhatsApp: {SUPPORT.whatsappDisplay}</p>
            <p>
              Phone: <a className="underline" href={`tel:${SUPPORT.phone}`}>{SUPPORT.phoneDisplay}</a>
            </p>
            <p>
              Email: <a className="underline" href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
            </p>
          </div>
        </div>
      ) : null}
      <button
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Close WhatsApp contact options' : 'Contact us on WhatsApp'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
