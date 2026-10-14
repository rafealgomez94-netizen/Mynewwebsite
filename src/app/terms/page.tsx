import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingFooter, MarketingNav } from '@/components/marketing/site-chrome';
import { ManagerCard } from '@/components/manager-card';
import { APP_NAME, SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/domain';
import { PLAN_CATALOGUE } from '@/lib/db/repositories/platform';
import { formatMoney } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: `The agreement that governs your use of ${APP_NAME}, including plans, acceptable use and AI limitations.`,
};

const sections: { heading: string; body: string[] }[] = [
  {
    heading: '1. The service',
    body: [
      `${APP_NAME} is a multi-tenant business operations platform. We provide a dashboard for customers, leads, orders, appointments, inventory, tasks, documents, marketing drafts, reports and AI assistance, plus optional public pages (support chat and online booking) for the business you configure.`,
      'You are responsible for the accuracy of the business information you enter or upload, for keeping your login credentials secure, and for the access you grant to your team members. Every action taken by a member of your business is attributed to that user in the audit log.',
    ],
  },
  {
    heading: '2. Plans, usage limits and billing',
    body: [
      'Plans and their limits are shown below and inside the dashboard under Billing. Each plan defines limits for team members, customers, documents, AI messages, support messages, WhatsApp messages and storage. When a limit is reached the affected action is refused with a clear message until you upgrade or the period resets.',
      'Payment credentials are never hard-coded in this application. When a payment provider is configured by the operator, upgrades create a subscription through that provider; when no provider is configured the platform operates in manual mode and the operator settles invoices directly. Billing status is always visible in the dashboard.',
    ],
  },
  {
    heading: '3. AI features and their limits',
    body: [
      'AI output is assistance, not authority. Answers are labelled VERIFIED DATA (calculated from your records), BUSINESS DOCUMENT (from material you uploaded) or AI RECOMMENDATION (a suggestion). The assistant is instructed not to invent prices, stock levels, appointment availability, policies, revenue figures or customer details, and it escalates to a human when it does not have enough information.',
      'Marketing content is generated as a draft. Nothing is published or sent to your customers without an explicit approval action by a member of your business, and the platform records who approved each item and when.',
      'You must not use the AI features to generate unlawful, misleading or discriminatory content, and you must have a lawful basis for any customer data you upload.',
    ],
  },
  {
    heading: '4. Acceptable use',
    body: [
      'Do not attempt to access another tenant’s data, probe or bypass authentication and rate limits, disrupt the service, or use it to send unsolicited bulk messages. We may suspend accounts that endanger other tenants, the platform or its operators.',
      'You remain the owner of your data. We process it only to operate the service for you, as described in the privacy policy.',
    ],
  },
  {
    heading: '5. Availability, support and changes',
    body: [
      'We aim for continuous availability but do not guarantee uninterrupted service; maintenance and provider outages can occur. Sign in to the dashboard or contact us for support, and your manager will respond from the contact details shown on this page.',
      'We may update these terms as the platform evolves. Material changes are surfaced in the dashboard; continuing to use the service after a change means you accept the updated terms.',
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Terms of service</h1>
          <p className="muted mt-4 text-sm">
            The agreement between you and {APP_NAME}. Last updated {new Date().toISOString().slice(0, 10)}.
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
                {section.heading.startsWith('2.') ? (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[540px] text-sm">
                      <thead>
                        <tr className="muted border-b text-left text-xs uppercase tracking-wide">
                          <th className="py-2 pr-4 font-medium">Plan</th>
                          <th className="py-2 pr-4 font-medium">Monthly</th>
                          <th className="py-2 pr-4 font-medium">Yearly</th>
                          <th className="py-2 font-medium">Designed for</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PLAN_CATALOGUE.map((plan) => (
                          <tr key={plan.code} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{plan.name}</td>
                            <td className="py-2.5 pr-4">
                              {plan.priceMonthCents === 0 ? 'Free' : formatMoney(plan.priceMonthCents)}
                            </td>
                            <td className="py-2.5 pr-4">
                              {plan.priceYearCents === 0 ? 'Free' : formatMoney(plan.priceYearCents)}
                            </td>
                            <td className="muted py-2.5">{plan.tagline}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <ManagerCard />
            <div className="card p-6 text-sm">
              <h2 className="font-semibold">Contact</h2>
              <p className="muted mt-2">
                Email <a className="text-brand-600 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or
                call <a className="text-brand-600 hover:underline" href={`tel:${SUPPORT_PHONE}`}>{SUPPORT_PHONE}</a> for
                contractual, billing or support questions.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link className="text-brand-600 hover:underline" href="/privacy">
                  Privacy policy
                </Link>
                <Link className="text-brand-600 hover:underline" href="/#pricing">
                  See pricing
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
