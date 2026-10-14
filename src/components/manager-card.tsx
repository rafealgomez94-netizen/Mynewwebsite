import Image from 'next/image';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { SUPPORT, SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/domain';

/**
 * Manager contact card — photo plus direct WhatsApp, phone and email.
 *
 * Shown on the landing page, the legal pages, the dashboard overview and the
 * public tenant pages (support chat and online booking) so a client always knows
 * who they are working with. The photo lives in `public/manager.jpg`; replace it
 * with `npm run photo:manager -- <path-to-image>`.
 */
export function ManagerCard({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const whatsappLink = SUPPORT.whatsappHref;

  if (variant === 'compact') {
    return (
      <div className="card-muted flex items-center gap-3 p-3">
        <ManagerAvatar size={44} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Rafeal Gomez</p>
          <p className="muted truncate text-xs">Platform manager · Workspace Digital</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={whatsappLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </a>
            <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              <Mail className="h-3 w-3" /> Email
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <ManagerAvatar size={104} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Your dedicated manager</p>
          <h3 className="mt-1 text-xl font-semibold">Rafeal Gomez</h3>
          <p className="muted mt-1 text-sm">
            Platform manager at Workspace Digital. Talk directly to the person who onboards your business, configures
            your AI assistant and stays with you as you grow.
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden />
              <div>
                <dt className="muted text-xs">WhatsApp</dt>
                <dd>
                  <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {SUPPORT.whatsappDisplay}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-600" aria-hidden />
              <div>
                <dt className="muted text-xs">Email</dt>
                <dd>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-ink-500" aria-hidden />
              <div>
                <dt className="muted text-xs">Phone</dt>
                <dd>
                  <a href={`tel:${SUPPORT_PHONE}`} className="font-medium hover:underline">
                    {SUPPORT_PHONE}
                  </a>
                </dd>
              </div>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function ManagerAvatar({ size }: { size: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-2xl border bg-[rgb(var(--surface-muted))]"
      style={{ width: size, height: size }}
    >
      <Image
        src="/manager.jpg"
        alt="Rafeal Gomez, platform manager at Workspace Digital"
        fill
        sizes={`${size}px`}
        className="object-cover"
        priority={size > 60}
      />
    </div>
  );
}
