# Workspace Digital

**Run Your Business Smarter With AI** — a multi-tenant SaaS platform for small and medium businesses (salons, restaurants, bars, retail, e-commerce, clinics, hotels, service businesses, freelancers and agencies).

One workspace holds the customers, sales, appointments, inventory, marketing, documents, reports and AI assistance a business needs to run day to day. Every AI answer is grounded in the tenant's own records and uploaded documents, and every AI action that touches the outside world requires a human approval step.

---

## 1. What is in the product

### Marketing site
| Section | Route |
| --- | --- |
| Hero, problems, AI solutions, platform features, how it works, industries, pricing, testimonials, FAQ, CTA, footer | `/` |
| Privacy policy | `/privacy` |
| Terms of service | `/terms` |
| Public AI support chat for a tenant | `/support/<business-slug>` |
| Public online booking for a tenant | `/book/<business-slug>` |

A floating WhatsApp widget is present on every public page (number from `NEXT_PUBLIC_SUPPORT_WHATSAPP`, defaulting to the manager's `077 407 5285`), and a manager contact card — photo plus WhatsApp, phone and email — is embedded on the landing page, the legal pages and the tenant support/booking pages.

### Accounts and onboarding
- Signup, login, logout, forgot password, password reset, email verification, invitation acceptance (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/accept-invite`, `/logout`). Invited users stay inactive until they accept: `GET /api/auth/accept-invite?token=…` describes the invitation, `POST` sets the password, activates the membership and signs them in.
- 9-step onboarding wizard (`/onboarding`) collecting business name, type, description, location, phone, email, website, hours, services, products with prices, FAQs, staff, communication preferences, and document uploads (menus, price lists, service catalogues, policies, FAQs, product information) that become the AI knowledge base.

### Dashboard (tenant workspace)
| Workspace | Route | Highlights |
| --- | --- | --- |
| Overview | `/dashboard` | Revenue, customers, orders, appointments, tasks, inventory value, AI activity, notifications, KPI cards, charts |
| AI business assistant | `/dashboard/assistant` | 15 intents, grounded answers, suggestions, weekly report / campaign / follow-up generation |
| Customers (CRM) | `/dashboard/customers` | Search, status filters, notes, tags, spend, appointments, conversations, last interaction |
| Customer detail | `/dashboard/customers/[id]` | Full history, orders, appointments, conversations, edit |
| Sales & pipeline | `/dashboard/sales` | Leads, AI qualification, scoring, follow-up reminders, New Lead → Contacted → Qualified → Proposal → Negotiation → Won/Lost |
| Appointments | `/dashboard/appointments` | Calendar, staff availability, booking, confirmation, rescheduling, cancellation, reminders |
| Tasks | `/dashboard/tasks` | To Do / In Progress / Completed, priorities, deadlines, assignment, AI-suggested tasks |
| Orders | `/dashboard/orders` | Order creation from services and products, payment status, channels |
| Inventory | `/dashboard/inventory` | SKU, quantity, cost, selling price, supplier, minimum stock, automatic low-stock detection, stock movements, fast/slow movers |
| Customer support | `/dashboard/support` | Conversations, AI replies, escalation queue, tickets, support widget settings |
| Knowledge base | `/dashboard/knowledge` | Uploads, extracted text chunks, FAQs, what the AI can quote |
| Marketing | `/dashboard/marketing` | Campaigns, social/email/SMS content, content calendar, Generate → Edit → Approve → Publish |
| Documents | `/dashboard/documents` | Invoices, quotes, receipts, proposals, reports, customer messages, marketing plans, SOPs + PDF export |
| Reports | `/dashboard/reports` | Daily/weekly/monthly reports, calculated metrics, optional AI narrative, PDF export |
| Analytics | `/dashboard/analytics` | Revenue and customer trends, popular and poor performers, retention, lead conversion, operational problems, AI recommendations clearly separated from calculated statistics |
| Billing | `/dashboard/billing` | Free/Starter/Professional/Business, usage against limits, upgrade/downgrade, billing status |
| Team | `/dashboard/team` | Members, roles, invitations, role changes, audit trail |
| Settings | `/dashboard/settings` | Profile, business profile, hours, communication preferences, support settings |

### Platform admin
`/admin`, `/admin/businesses`, `/admin/activity` — businesses, users, subscriptions, usage, AI usage, support tickets, system activity, revenue and platform statistics. Access requires `users.platform_role = 'PLATFORM_ADMIN'`; every query is platform-scoped and tenant data is only ever shown in aggregate.

---

## 2. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19, TypeScript strict) |
| Styling | Tailwind CSS 3 with a CSS-variable design system and dark/light mode |
| Backend | Next.js route handlers (`src/app/api/**`) — no separate server |
| Database | `node:sqlite` (development, zero dependencies) or PostgreSQL (production, `db/schema.postgres.sql`) |
| Auth | bcrypt (12 rounds), httpOnly session cookies with hashed tokens, `jose`-ready secret, RBAC |
| AI | Server-only OpenAI-compatible chat completions client with a deterministic analytics/knowledge fallback |
| Documents | `pdf-lib` for invoices, quotes, receipts, proposals, reports, SOPs and marketing plans |
| Mail | `nodemailer` with a console fallback when SMTP is not configured |
| Charts | Inline SVG components (no chart dependency, no client-side telemetry) |

The UI has no chart library, no analytics SDK and no client-side AI calls: every AI request and every database query runs on the server.

---

## 3. Folder structure

```
db/
  schema.sqlite.sql        36 tables, indexes, foreign keys (development runtime)
  schema.postgres.sql      identical structure for PostgreSQL
scripts/
  migrate.mjs              apply the schema, optionally --reset
  seed.mjs                 plans + a fully populated demo tenant
src/
  app/
    page.tsx               marketing landing page (11 sections)
    privacy/ terms/        legal pages
    (auth)/…               login, signup, forgot, reset, verify, invite
    onboarding/            guided wizard
    dashboard/…            tenant workspaces (see table above)
    admin/…                platform administration
    support/[slug]/        public AI support chat
    book/[slug]/           public booking
    api/…                  auth, account, business, customers, leads, services, products,
                           orders, appointments, tasks, conversations, support, knowledge,
                           ai/assistant, documents, marketing, reports, analytics, billing,
                           team, staff, dashboard, admin, public, contact
    icon.svg               favicon
    opengraph-image.tsx    generated social preview image
  components/
    marketing/             nav, footer, demo form
    auth/auth-form.tsx     all auth modes
    onboarding/wizard.tsx  onboarding wizard
    dashboard/             shell + one view per workspace + shared primitives
    public/                support chat, booking form, WhatsApp widget
    ui/                    Button, Card, Stat, Badge, Field, Input, Select, Textarea,
                           Modal, Tabs, Checkbox, Alert, Progress, EmptyState, toasts
    charts.tsx             LineChart, DonutChart
    manager-card.tsx       manager contact card (photo in public/manager.jpg)
  lib/
    db/index.ts            the only database driver (parameterised queries, transactions)
    db/repositories/       accounts, crm, catalog, ops, comms, knowledge, content, platform
    ai/                    provider, facts, analytics, assistant, support, generators
    services/              pdf, reports, scheduling, notify, dashboard, storage, mailer
    auth/                  password, session, rbac
    api/http.ts            response envelope, validation, rate limiting, error mapping
    domain.ts validation.ts utils.ts
public/
  manager.jpg              replace with your own photo (used by the manager card)
```

---

## 4. Quick start

```bash
# 1. install (Node >= 22.5 required — the development database uses node:sqlite)
npm install

# 2. configure
cp .env.example .env      # set AUTH_SECRET at minimum; AI_API_KEY is optional

# 3. database + demo data
npm run db:reset          # creates data/workspace-digital.db, applies the schema, seeds
#   or run them separately:
npm run db:migrate
npm run db:seed
npm run db:seed -- --force   # rebuild the demo tenant

# 4. run
npm run dev               # http://localhost:3000  (binds 0.0.0.0)
npm run typecheck         # tsc --noEmit
npm run build && npm start
```

### Manager photo

The manager contact card (landing page, legal pages and tenant support/booking pages) reads `public/manager.jpg`.
Replace it with your own photo at any time:

```bash
npm run photo:manager -- ~/Downloads/me.png     # centre-crops to 640×640 and installs it
npm run photo:manager                          # or, with exactly one image in ./uploads
```

To change the name, role or contact details shown on the card, edit `SUPPORT_*` in `.env` and the copy in
`src/components/manager-card.tsx`.

### Seeded accounts

| Role | Email | Password | Lands on |
| --- | --- | --- | --- |
| Platform admin | `admin@workspacedigital.app` | `AdminPassw0rd!` | `/admin` |
| Business owner | `owner@test.local` | `Str0ngPassw0rd!` | `/dashboard` |
| Manager | `manager@test.local` | `ManagerPassw0rd!` | `/dashboard` |
| Staff | `staff@test.local` | `StaffPassw0rd!` | `/dashboard` |

The demo tenant is **Windhoek Beauty Studio** (`/book/windhoek-beauty-studio`, `/support/windhoek-beauty-studio`) with services, products, stock, customers, leads, orders, appointments, tasks, conversations, tickets, FAQs, knowledge chunks, documents, a marketing campaign, a weekly report and notifications. Change the passwords in `.env` before showing the app to anyone.

---

## 5. Environment variables

Everything is documented in `.env.example`. The important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_FILE` | SQLite file used by the development runtime (default `data/workspace-digital.db`) |
| `DATABASE_URL` | PostgreSQL connection string when deploying with `db/schema.postgres.sql` |
| `AUTH_SECRET` | Required in production — signs session material (`openssl rand -base64 48`) |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS` | Server-only AI provider. Empty key ⇒ built-in deterministic mode |
| `SMTP_*` | Verification, reset, invitation and notification email. Missing ⇒ console transport |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `STORAGE_S3_*` | Knowledge-base document storage |
| `PAYMENT_PROVIDER`, `PAYMENT_SECRET`, `STRIPE_*` | Billing. `manual` (default) applies a plan change immediately; `stripe` uses configured price IDs. No keys are ever hard-coded |
| `NEXT_PUBLIC_SUPPORT_*` | Public contact details (email, phone, WhatsApp) shown in the footer, manager card and floating WhatsApp widget. `NEXT_PUBLIC_SUPPORT_DIAL_CODE` converts a nationally written WhatsApp number (`077…`) into international form (`wa.me/264774075285`) |
| `SEED_*` | Emails/passwords created by `npm run db:seed` |

Secrets are read on the server only. Nothing in `src/components` or any client bundle touches `process.env` values other than `NEXT_PUBLIC_*`.

---

## 6. Database and tenancy

- 36 tables: users, auth_tokens, sessions, businesses, business_members, staff, customers, leads, lead_activities, products, services, inventory_movements, orders, order_items, appointments, tasks, conversations, messages, support_tickets, support_settings, knowledge_sources, knowledge_chunks, faqs, documents, marketing_campaigns, marketing_posts, reports, ai_runs, notifications, plans, subscriptions, usage_counters, usage_events, integrations, audit_logs, contact_messages.
- Money is stored as integer minor units (cents). Timestamps are ISO-8601 text so the same comparisons work on SQLite and PostgreSQL.
- Every business-owned row carries `business_id`; repositories always bind it, and RBAC checks the caller's role in that business before writing.
- `src/lib/db/index.ts` is the only place that talks to the database: parameterised queries (`get/all/run/scalar`), nested-safe transactions (`tx`), and JSON helpers. Rows are normalised to plain objects so they can be passed from server to client components safely.
- The development runtime applies `db/schema.sqlite.sql` automatically on first connection, so a fresh clone boots without a manual migration.

### Using PostgreSQL

```bash
createdb workspace_digital
psql "$DATABASE_URL" -f db/schema.postgres.sql
# then restart the app with DATABASE_URL set
```

Both schema files are kept structurally identical (same tables, columns and indexes) so the repository layer runs unchanged. The SQLite file is the runtime default in this repository; the PostgreSQL file is provided for production deployments and has not been executed against a live server in this environment.

---

## 7. AI architecture

- **Server only.** The provider client lives in `src/lib/ai/provider.ts`, reads `AI_API_KEY` from the server environment, and is never imported by a client component.
- **Minimum data per task.** `src/lib/ai/facts.ts` builds a compact fact pack (counts, totals, stock levels, pipeline, support load, top items) instead of shipping raw tables.
- **Knowledge retrieval first.** Uploaded documents are split into retrieval units (one line per price-list entry, paragraph-aware for prose), indexed and ranked with BM25 plus prefix/stem matching and IDF weighting (`src/lib/db/repositories/knowledge.ts`). FAQs are matched first.
- **Confidence is measured, not assumed.** A retrieved chunk must cover the question's distinctive words (`answerCoverage`) — not merely share a common one — before it is quoted. If a term the business never wrote down ("laser hair removal") is missing, the assistant says it does not have enough information instead of answering from a loosely related line. Answers quote the one or two sentences that actually answer the question, from up to two comparable sources, and the response carries the match score and coverage per source.
- **Re-indexing.** `POST /api/knowledge {"kind":"reindex"}` rebuilds the retrieval index for a workspace (used after tuning the chunking strategy); it is tenant-scoped and safe to run repeatedly.
- **Guardrails.** Every request is sent with the instruction: *"You are an AI business assistant. Use verified business data whenever available. Never invent prices, inventory levels, appointment availability, policies, revenue figures, or customer information. If required information is unavailable, clearly state that you do not have enough information and request human assistance."*
- **Source labelling.** Answers carry sections labelled **Verified business data**, **Business document** or **AI recommendation**, and reports store `summary_source` as `CALCULATED` or `AI`.
- **Escalation.** When confidence is low (no FAQ match and no knowledge chunk above the score threshold), the support assistant says a human is needed, collects name/email/phone, opens a support ticket and notifies the owner/staff.
- **No auto-publishing.** Marketing content is created as a draft; publishing requires an explicit approval action, and the approval is recorded in `audit_logs`.
- **Graceful degradation.** With no `AI_API_KEY` the platform runs a deterministic engine that answers from the same fact pack and knowledge base, and generates marketing/document content from verified templates — never fake numbers.

---

## 8. Roles and permissions

| Role | Can |
| --- | --- |
| Owner | Everything, including billing, deleting the business and transferring ownership |
| Admin | Everything except ownership transfer; manage team, billing view, all workspaces |
| Manager | Operations: customers, leads, appointments, tasks, orders, inventory, support, marketing, reports |
| Staff | Day-to-day work: assigned appointments, tasks, customers, conversations |

Every mutating API route resolves the session, requires tenant membership, checks the permission for that action, and scopes the query by `business_id`. Staff attempting administrative actions receive `403 forbidden`; unauthenticated API calls receive `401`.

---

## 9. Security

- Passwords hashed with bcrypt (12 rounds); password reset invalidates existing sessions.
- Sessions use httpOnly, sameSite cookies with a random token whose SHA-256 hash is stored server-side; tokens are bound to the active business.
- Single-use, expiring tokens for email verification (24 h), password reset (60 min) and invitations (7 days).
- All request bodies validated with zod schemas; consistent `{ok,data}` / `{ok,error}` envelope with `401/403/404/409/422/429/500` codes.
- Rate limiting on authentication, public support, public business lookup, public booking and contact endpoints.
- Security headers (CSP, frame, referrer, permissions) configured in `next.config.ts`; `X-Powered-By` removed.
- Audit logs record actor, action, entity, IP and user agent for account, billing, billing, knowledge, marketing and admin events.
- Cross-tenant reads are impossible by construction (tenant-scoped repositories) and verified: a second tenant requesting another tenant's customer id receives `404`.

---

## 10. Verification performed

- `npm run typecheck` — clean (TypeScript strict, 0 errors).
- Every marketing, auth, onboarding, dashboard and admin route returns `200` (or an intentional `307` redirect) against the seeded database.
- Public endpoints verified: `GET /api/public/business?slug=`, `POST /api/support/public` (FAQ-grounded answer, low-confidence escalation creating a ticket), `POST /api/public/book` (booking created, confirmation logged), `GET /api/appointments?availability=true` (real slots from the business hours), `GET /api/documents/[id]/pdf` and `GET /api/reports/[id]/pdf` (valid PDF bytes).
- AI assistant verified on real data: customer counts, low-stock list, promotion ideas and follow-up questions all cite verified numbers with labelled sections.
- Marketing approval workflow verified: publishing a draft returns `409 approval_required`, approve → publish succeeds.
- RBAC verified: Staff cannot invite users or change billing (`403`); unauthenticated dashboard access redirects to `/login`; unauthenticated API access returns `401`.
- Tenant isolation verified with two live tenants.
- Knowledge grounding verified end to end: a fresh `.txt` upload became searchable from both the public support chat and the dashboard assistant, quoting the exact price line for "how much is the bridal package", resolving inflections and abbreviations ("kerat" → keratin), answering multi-part questions from two different documents, and escalating with a support ticket when asked about a service the business does not offer.
- Auth flows verified against the live API: forgot-password (no account-existence leak, single-use token, weak passwords rejected, sessions invalidated after reset), email verification (single use), team invitation (invited accounts cannot sign in until accepted; accept-invite sets the password, activates the membership and signs the invitee in).

---

## 11. Deployment

1. Provision PostgreSQL and apply `db/schema.postgres.sql`.
2. Set `DATABASE_URL`, `AUTH_SECRET`, `AI_*`, `SMTP_*`, `STORAGE_*` and payment variables in the hosting provider's environment panel.
3. `npm ci && npm run build && npm start` (or deploy the same commands to a Node 22 host; the app binds `0.0.0.0:3000`).
4. Run `npm run db:seed` only if you want the demo data; in production create the first account through `/signup` and promote your platform administrator in SQL:
   `UPDATE users SET platform_role = 'PLATFORM_ADMIN' WHERE email = 'you@example.com';`
5. Replace `public/manager.jpg` with your own photo.

---

## 12. Feature phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Landing page, authentication, onboarding, dashboard, customer management, AI business assistant | Built |
| 2 | CRM and pipeline, appointments, tasks and notifications, AI customer support, knowledge base | Built |
| 3 | Inventory, orders and sales, AI marketing, documents with PDF export, reports | Built |
| 4 | Subscriptions and billing, platform admin, advanced analytics, integrations (payments, WhatsApp, calendar) | Built |

Each phase is wired end to end: UI → API route → repository → database, with the AI layer reading the same verified data the dashboard shows.
