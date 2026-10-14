import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingFooter, MarketingNav } from '@/components/marketing/site-chrome';
import { ManagerCard } from '@/components/manager-card';
import { APP_NAME, SUPPORT_EMAIL } from '@/lib/domain';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${APP_NAME} collects, stores and uses business data, customer records and AI prompts.`,
};

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. What we store',
    body: [
      'When you create an account we store your name, email address, hashed password (bcrypt), the businesses you belong to and your role inside each business. We never store passwords in readable form and we cannot recover them — resets issue a one-time, expiring link instead.',
      'Business data you enter (customers, leads, products, services, orders, appointments, tasks, inventory movements, conversations, documents, marketing drafts and reports) is stored in the database with a business_id tenant key. Every query in the application is scoped to the tenant of the signed-in session, and members of one business can never read another business’s records.',
      'Documents you upload for AI grounding are stored on the configured object/file storage. Only the extracted text is chunked and indexed for retrieval; the original file remains available to you until you delete it.',
    ],
  },
  {
    heading: '2. How AI features use your data',
    body: [
      'AI features run on the server only. Your API keys are never exposed to the browser.',
      'Before an answer is generated we retrieve the smallest useful slice of data: a compact fact pack with aggregate numbers (for example revenue totals, counts and low-stock items), the relevant knowledge chunks from documents and FAQs you supplied, and the conversation history needed for that single request. We do not send entire databases, and we do not send other tenants’ data.',
      'Every AI answer is labelled by source: VERIFIED DATA (calculated from your stored records), BUSINESS DOCUMENT (from the material you uploaded) or AI RECOMMENDATION (a suggestion that requires your judgement). The assistant is instructed never to invent prices, inventory levels, appointment availability, policies, revenue figures or customer information, and to escalate to a human when it lacks information.',
    ],
  },
  {
    heading: '3. Third-party processors',
    body: [
      'If an AI provider is configured (AI_API_KEY), the prompts described above are sent to that provider solely to produce the answer. If no provider is configured the platform runs in built-in analytics mode and nothing leaves your server.',
      'Email (verification, password reset, invitations, notifications) is delivered through the SMTP server you configure (SMTP_*). Payments, when enabled, are handled by the configured payment provider (PAYMENT_PROVIDER); card data is never stored by this application.',
    ],
  },
  {
    heading: '4. Retention and deletion',
    body: [
      'Records are retained while your business account is active so that reports and history stay accurate. You can delete individual customers, products, documents, conversations and campaigns from the dashboard, and export any document or report as PDF at any time.',
      'Deleting a business removes its tenant-scoped rows from the database. Backups, when configured by the operator, are rotated on their own schedule.',
    ],
  },
  {
    heading: '5. Security practices',
    body: [
      'Passwords are hashed with bcrypt (12 rounds). Sessions use httpOnly cookies with hashed session tokens, bound to the business you are currently working in. Role-based access control (Owner, Admin, Manager, Staff) is enforced on the server for every mutating route.',
      'All API input is validated with schema checks, authentication is required for tenant routes, sensitive endpoints are rate limited, security headers are applied globally, and administrative actions are written to an audit log with actor, action, entity and timestamp.',
    ],
  },
  {
    heading: '6. Your choices',
    body: [
      'You control what the AI can see: faqs, uploaded documents and support settings can be edited or removed from the knowledge base at any time, and AI features degrade to plainly labelled analytics when no provider key is configured.',
      'For access, correction, export or deletion requests, contact the platform manager using the card below or email the address on this page. We respond from a monitored inbox and record the request in the platform audit trail.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy policy</h1>
          <p className="muted mt-4 text-sm">
            Plain-language summary of what {APP_NAME} stores, how AI features use it, and the controls you have.
            Last updated {new Date().toISOString().slice(0, 10)}.
          </p>

          <div className="mt-10 space-y-8">
            {sections.map((section) => (
              <section key={section.heading} className="card p-6">
                <h2 className="text-lg font-semibold">{section.heading}</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed">
                  {section.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 40)} className="muted">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <ManagerCard />
            <div className="card p-6 text-sm">
              <h2 className="font-semibold">Data questions?</h2>
              <p className="muted mt-2">
                Email <a className="text-brand-600 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
                with the business name and the email address on the account, and we will action access, export or
                deletion requests.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link className="text-brand-600 hover:underline" href="/terms">
                  Terms of service
                </Link>
                <Link className="text-brand-600 hover:underline" href="/#contact">
                  Contact & demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
