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
| Appointments | `/dashboard/appointments` | Calendar, staff availability, booking, confirmation, rescheduling into a real free slot (double-booking refused with `409`), cancellation, and reminders the business controls — the dashboard sends the due ones on demand and `/api/cron/reminders` does it on a schedule |
| Tasks | `/dashboard/tasks` | To Do / In Progress / Completed, priorities, deadlines, assignment, AI-suggested tasks, and `TASK_DUE` notifications for deadlines that have arrived (`WARNING`) or passed (`CRITICAL`) |
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
#   (the app notices the file was replaced and reconnects — no restart needed)
#   or run them separately:
npm run db:migrate
npm run db:seed
npm run db:seed -- --force   # rebuild the demo tenant

# 4. run
npm run dev               # http://localhost:3000  (binds 0.0.0.0)
npm run typecheck         # tsc --noEmit
npm run build && npm start
```

### End-to-end smoke suite

`npm run smoke` drives the running app over HTTP exactly like a real client: it signs a new
tenant up, verifies the email, onboards the business, then exercises catalog, inventory,
CRM, pipeline, orders, appointments, public booking, tasks, conversations, support, the
knowledge base, both AI surfaces, marketing approval, documents + PDFs, reports, analytics,
billing, invitations, RBAC and tenant isolation — **89 checks in total**. It creates its own
tenant and accounts (`smoke-*@example.test`) and deletes them again on the way out, so it is
safe to run against a development database.

```bash
npm run smoke                          # defaults to http://127.0.0.1:3000
SMOKE_BASE_URL=http://127.0.0.1:3100 npm run smoke
npm run verify                         # typecheck + smoke

npm run verify:extraction              # PDF / DOCX text extraction (offline, no server)
npm run audit:clients                  # client → API contract audit (static)
npm run audit:clients -- --live        # …and against the running app
npm run probe:shapes                   # dump live response keys of the main endpoints
```

Two notes for repeated runs:

- Exit code is `1` when any check fails, which makes it usable in CI.
- The suite expects a development server: the dev-only `verification.devUrl` / `devUrl`
  fields are what let it follow the email-verification and password-reset links without an
  SMTP inbox.
- The last check deliberately locks the login endpoint for your IP (12 attempts / 5 minutes)
  to prove the limiter blocks valid credentials too. A run started inside that window waits
  the remaining seconds out and continues; restarting the dev server clears the in-memory
  buckets immediately.

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
| `CRON_SECRET` | Guards the scheduler endpoints — `GET\|POST /api/cron/reminders` (appointment reminders) and `GET\|POST /api/cron/run` (reminders + task deadline alerts) — via a `?secret=` parameter or an `Authorization: Bearer` header (`openssl rand -hex 32`). Empty ⇒ they answer `503`; the per-workspace dashboard buttons are unaffected |
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
- **Storage format is not trusted.** Matching is driven by the chunk text; the keyword column is treated as an optional optimisation and read tolerantly (space-separated token bag *or* a JSON array, so rows written by the seeder or by hand still retrieve).
- **Grounding inspector (development only).** While signed in, `GET /api/dev/grounding?q=<question>` returns the query tokens, the measured coverage, the ranked chunks and what each one matched. It is scoped to the caller's own workspace (another tenant's records are `403`, anonymous callers are `401`) and returns `404` when `NODE_ENV=production`.
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
- A clean production build (`next build`) compiles every route, and `next start` serves it without leaking the development email tokens (verified: `devUrl` is absent in production responses, `307`/`401` guards still apply, public support still answers).
- `npm run smoke` — **89 / 89 checks pass**, against the running app (last full run: signup →
  verification → onboarding → catalog → stock movements → CRM → pipeline → orders →
  appointments → public booking → tasks → conversations → support → knowledge → AI assistant
  → marketing → documents → reports → analytics → billing → invitations → RBAC → tenant
  isolation → page rendering). Bugs the suite caught and that are now fixed:
  - `POST /api/conversations/[id]/messages` consumed the request body twice, so every staff
    reply returned `400 Request body must be valid JSON` — the body is now read once.
  - The generic update helpers (`updateService`, `updateProduct`, `updateLead`, `updateUser`,
    `updateSubscription`) treated an explicitly passed `undefined` as "set to NULL", so a
    partial `PATCH` (e.g. changing only a price) failed with a `NOT NULL` conflict — undefined
    fields are now skipped.
  - Seeded knowledge was indexed with a JSON array in the keyword column while the application
    wrote a space-separated token bag, so BM25 saw one unusable mega-token: every question
    about the demo tenant's price list, policies or opening hours escalated to a human.
    Retrieval now reads the column tolerantly and derives matches from the chunk text, and the
    seeder writes the same shape as the app. Both are covered by a regression check.
  - `npm run db:reset` deletes the database file, so a running server kept reading the deleted
    inode and served stale data from some routes and fresh data from others. The database layer
    now detects that the file was replaced and reconnects, so a reset needs no restart
    (verified: a marker row created before the reset is gone from the API immediately after it).
  - The admin layout called `requireUser` directly, so an anonymous visit to `/admin` threw
    an unhandled 401 and rendered as a `500`. It now redirects to `/login?next=/admin`
    (anonymous) or `/dashboard` (signed in, not a platform admin), matching the dashboard.
  - Page checks assert content, not just status codes: the landing page must carry the hero
    copy, both calls to action and the manager photo; every public page must link the manager's
    WhatsApp number; each of the 17 dashboard workspaces must render its own heading and the
    shared sidebar links them all.
- Every marketing, auth, onboarding, dashboard and admin route returns `200` (or an intentional `307` redirect) against the seeded database.
- Public endpoints verified: `GET /api/public/business?slug=`, `POST /api/support/public` (FAQ-grounded answer, low-confidence escalation creating a ticket), `POST /api/public/book` (booking created, confirmation logged), `GET /api/appointments?availability=true` (real slots from the business hours), `GET /api/documents/[id]/pdf` and `GET /api/reports/[id]/pdf` (valid PDF bytes).
- AI assistant verified on real data: customer counts, low-stock list, promotion ideas and follow-up questions all cite verified numbers with labelled sections.
- Marketing approval workflow verified: publishing a draft returns `409 approval_required`, approve → publish succeeds.
- RBAC verified: Staff cannot invite users or change billing (`403`); unauthenticated dashboard access redirects to `/login`; unauthenticated API access returns `401`.
- Tenant isolation verified with two live tenants.
- Knowledge grounding verified end to end: a fresh `.txt` upload became searchable from both the public support chat and the dashboard assistant, resolving inflections and abbreviations ("kerat" → keratin), answering multi-part questions from two different documents, and escalating with a support ticket when asked about a service the business does not offer.
- The demo workspace answers from its seeded documents again: "How much are box braids?" → N$350, "How much is a kids haircut?" → N$120, "Do you require a deposit for braiding?" → 30%, "What are your opening hours on Thursday?" → 09:00–19:00, "Can I pay by card?" → cash/card/EFT, while "Do you do laser hair removal?" and "How much is the bridal package?" correctly hand over to a human and raise a ticket.
- Auth flows verified against the live API: forgot-password (no account-existence leak, single-use token, weak passwords rejected, sessions invalidated after reset), email verification (single use), team invitation (invited accounts cannot sign in until accepted; accept-invite sets the password, activates the membership and signs the invitee in).

### Document extraction (PDF and DOCX)

- `npm run verify:extraction` — **15 / 15 checks pass**. The suite builds a real compressed PDF
  with `pdf-lib`, a real three-paragraph DOCX (a ZIP archive) and a text-free PDF, then asserts
  what the extractor returns for each.
- Bugs this found and that are now fixed:
  - Uploaded PDFs and DOCX files were indexed as raw bytes: PDF page text lives inside
    `FlateDecode` streams and DOCX text inside a ZIP, so decoding either as `latin1` produced a
    few kilobytes of `obj`, `endstream` and binary noise. The knowledge base was therefore
    searchable only by accident, and questions about an uploaded invoice or policy escalated to a
    human. `src/lib/services/document-text.ts` now inflates the PDF content streams and reads
    `word/document.xml` out of the DOCX archive (`zlib` only, no new dependency), and the storage
    layer delegates to it.
  - The heuristic fallback for PDFs whose text cannot be recovered accepted `%PDF-1.4` syntax as
    prose. It now requires 240 characters and 30 distinct words, and a source extracted this way
    is stored with an explicit `warning` instead of silently indexing junk.
  - `POST /api/knowledge/upload` returned `500` for a non-multipart body; it now validates the
    content type and returns `400 bad_request` (multipart uploads are unaffected).
- Verified live: an invoice PDF exported by the app and re-uploaded became 29 chunks of real
  text (`Corporate wellness quote … QUO-20261015-0001`), and the public support chat then answered
  a question about the document's package code without escalating. A DOCX policy file became one
  chunk and answered a question about its cancellation clause. A text-free scanned PDF is stored
  with a warning and no binary fields.

### Documents API

- `DELETE /api/documents` was missing (the dashboard asked for it and received `405`) — added with
  audit logging, returning `404` for an unknown id, `422` for `{}` and `401` anonymously.
- `POST /api/documents` silently dropped the `total`, `tax` and `notes` fields the documents form
  sent, and defaulted to USD regardless of the workspace currency. The generator schema now takes
  `amount`, `tax`, `notes` and an optional `currency` that the route resolves from the workspace —
  a `N$900` quote is now stored with `total_cents 90000` and prints `NAD 900` with its tax lines
  and notes in the PDF.
- `npm run audit:clients` — a TypeScript-AST audit of every `apiRequest` / `fetch` call in
  `src/components/**` against the routes they target: route existence, exported method, body keys
  (including keys built in component state) and the expected response shape (`--live` confirms the
  shapes against the running app). It audits 88 calls and is what surfaced the two documents bugs
  above. `npm run probe:shapes` dumps the live response keys of 23 endpoints for comparison.
- Dead code removed and the gate locked: `tsconfig.json` now sets `noUnusedLocals` and
  `noUnusedParameters`, which the codebase satisfies with zero errors. This deleted a 97-line
  superseded fact-pack builder in the assistant (the LLM prompt already receives
  `renderFactPack(facts)`), an unreachable onboarding-wizard state, and 13 unused imports/helpers.


### Appointments: rescheduling and reminders

The page promised rescheduling and reminders, and the booking confirmation email told customers
to reply if they needed a different time — but the dashboard only offered a status dropdown, and
nothing ever sent a reminder. Two real defects, both now fixed:

- `PATCH /api/appointments` moved an appointment without any overlap check, so a staff member
  could be double-booked from the dashboard even though `POST` guarded against it. The overlap
  test is now shared by booking and rescheduling (`409 conflict`), a reschedule validates that
  the end is after the start (`422 invalid_time`) and an unknown id is a `404` instead of a
  silent no-op. Rescheduling also announces itself with an `APPOINTMENT_RESCHEDULED` notification
  and an audit entry, and cancellation raises `APPOINTMENT_CANCELLED`.
- Reminders were never sent: `markReminderSent()` had no caller, and the lead time collected
  during onboarding (`businesses.comms_json.reminderLeadHours`, default 24h) was stored and then
  ignored. `src/lib/services/reminders.ts` now sends the reminders that are due — open
  appointments starting inside the configured window, with a customer email address — and stamps
  `appointments.reminder_sent_at` so the dashboard button and the scheduler can never double-send.
  Moving an appointment clears that stamp, so the customer is reminded again at the new time.

Verified over HTTP: a reschedule onto an occupied slot is refused while a free slot is accepted
(the vacated slot becomes bookable again), the reminder preview reports what is due without
sending, the first run sends and the second reports `sent: 0`, a cancelled appointment is never
reminded, and after moving a reminded appointment it becomes due again. All covered by three
smoke checks. `/api/cron/reminders` answers `503 cron_not_configured` without `CRON_SECRET`,
`401` with a wrong secret, and runs idempotently with the right one (query parameter or bearer
header). Note that a platform-wide cron run sends any due reminders for every tenant, including
the demo tenant — in development those messages go to the server console.


### Tasks: deadline alerts, and what a partial update may not touch

The notification types the schema documents include `TASK_DUE`, but nothing ever created one: a
deadline could pass without the team being told. `src/lib/services/deadlines.ts` now announces the
open tasks whose deadline has arrived or is inside the next 24 hours — `WARNING` while there is
still time, `CRITICAL` once it is late — and stamps `tasks.deadline_alerted_at` so the dashboard
button, the cron route and any scheduled run together produce exactly one notification per
deadline. A new deadline (or reopening a completed task) clears the stamp, so it is announced in
turn.

That stamp is the first column added after the initial release, so the database layer grew a small
idempotent migration step (`ADDED_COLUMNS` in `src/lib/db/index.ts`): `CREATE TABLE IF NOT EXISTS`
only builds fresh databases, and a running install must not need a manual `ALTER TABLE`. The
column is in `db/schema.sqlite.sql` and `db/schema.postgres.sql` for new databases, and
`PATCH /api/tasks` clears it when the deadline moves.

- `PATCH /api/tasks` also treated an omitted assignee as "unassign me", so changing a task's
  status silently took it away from whoever owned it. An omitted field now means "leave it alone"
  and an explicit `""` unassigns, matching the dropdown. Covered by a smoke check that changes the
  status of an assigned task and asserts the assignee and deadline both survive.

Verified over HTTP: three tasks (due soon, overdue, already completed) produce two alerts — the
completed one is ignored and the late one is raised as `CRITICAL` — a second run reports `due: 0`,
moving a deadline makes it due again, and the combined scheduler `/api/cron/run` runs both jobs
idempotently behind the same secret.


---

## 11. Deployment

1. Provision PostgreSQL and apply `db/schema.postgres.sql`.
2. Set `DATABASE_URL`, `AUTH_SECRET`, `AI_*`, `SMTP_*`, `STORAGE_*` and payment variables in the hosting provider's environment panel.
3. `npm ci && npm run build && npm start` (or deploy the same commands to a Node 22 host; the app binds `0.0.0.0:3000`).
4. Run `npm run db:seed` only if you want the demo data; in production create the first account through `/signup` and promote your platform administrator in SQL:
   `UPDATE users SET platform_role = 'PLATFORM_ADMIN' WHERE email = 'you@example.com';`
5. Set `CRON_SECRET` and point a scheduler at `/api/cron/run` every 15–60 minutes — Vercel Cron
   (`"crons": [{ "path": "/api/cron/run?secret=…", "schedule": "*/30 * * * *" }]`), a systemd timer,
   GitHub Actions or any uptime monitor. That one call sends the appointment reminders that are due
   and announces the task deadlines that have arrived, for every workspace; `/api/cron/reminders`
   does the reminders alone. Both are idempotent, so overlapping runs are harmless, and without a
   scheduler the dashboard's per-workspace buttons still work.
6. Replace `public/manager.jpg` with your own photo.

---

## 12. Feature phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Landing page, authentication, onboarding, dashboard, customer management, AI business assistant | Built |
| 2 | CRM and pipeline, appointments, tasks and notifications, AI customer support, knowledge base | Built |
| 3 | Inventory, orders and sales, AI marketing, documents with PDF export, reports | Built |
| 4 | Subscriptions and billing, platform admin, advanced analytics, integrations (payments, WhatsApp, calendar) | Built |

Each phase is wired end to end: UI → API route → repository → database, with the AI layer reading the same verified data the dashboard shows.
