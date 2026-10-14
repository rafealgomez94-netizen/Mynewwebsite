-- ============================================================================
--  WORKSPACE DIGITAL — multi-tenant SaaS schema
--  Dialect: PostgreSQL 14+
--
--  This is the production dialect twin of db/schema.sqlite.sql. Both files define
--  the same tables, columns, indexes and relationships so that the application
--  layer (src/lib/db/repositories/*) runs unchanged on either engine.
--
--  Notes on deliberate choices
--  ---------------------------
--  * Timestamps are ISO-8601 `TEXT` in both dialects: the repositories compare and
--    order them lexicographically and pass ISO strings as parameters. Keeping TEXT
--    in PostgreSQL means identical query behaviour without driver-side coercion.
--  * Booleans are stored as `INTEGER` 0/1 (not BOOLEAN) so that queries such as
--    `WHERE active = 1` behave identically on both engines.
--  * Money is stored in integer minor units (cents) — never floating point.
--  * Every business-owned table carries `business_id`; all queries bind it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  email_verified_at TEXT,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  phone           TEXT,
  avatar_url      TEXT,
  job_title       TEXT,
  timezone        TEXT DEFAULT 'UTC',
  locale          TEXT DEFAULT 'en',
  theme           TEXT DEFAULT 'system',
  platform_role   TEXT NOT NULL DEFAULT 'USER',   -- USER | PLATFORM_ADMIN
  status          TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | SUSPENDED
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                       -- EMAIL_VERIFY | PASSWORD_RESET | INVITE
  token_hash  TEXT NOT NULL,
  email       TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  meta_json   TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, type);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  business_id TEXT,
  ip          TEXT,
  user_agent  TEXT,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS businesses (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL,                     -- salon | restaurant | retail | clinic | ...
  description   TEXT,
  address       TEXT,
  city          TEXT,
  country       TEXT,
  phone         TEXT,
  email         TEXT,
  website       TEXT,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  currency      TEXT NOT NULL DEFAULT 'USD',
  logo_url      TEXT,
  hours_json    TEXT,                              -- [{day, open, close, closed}]
  comms_json    TEXT,                              -- communication preferences
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  onboarding_completed_at TEXT,
  owner_id      TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);

CREATE TABLE IF NOT EXISTS business_members (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'STAFF',       -- OWNER | ADMIN | MANAGER | STAFF
  status      TEXT NOT NULL DEFAULT 'ACTIVE',      -- ACTIVE | INVITED | SUSPENDED
  title       TEXT,
  invited_by_id TEXT,
  joined_at   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (business_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_business ON business_members(business_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON business_members(user_id);

-- ---------------------------------------------------------------------------
-- Team / staff availability
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id),
  name          TEXT NOT NULL,
  title         TEXT,
  email         TEXT,
  phone         TEXT,
  specialties   TEXT,                              -- JSON array
  availability_json TEXT,                          -- {"mon":[{"start":"09:00","end":"17:00"}], ...}
  color         TEXT DEFAULT '#3382fb',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff(business_id);

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  birthday      TEXT,
  status        TEXT NOT NULL DEFAULT 'NEW',       -- NEW | LEAD | ACTIVE | RETURNING | INACTIVE | VIP
  source        TEXT,
  tags_json     TEXT,
  notes         TEXT,
  total_spend_cents INTEGER NOT NULL DEFAULT 0,
  order_count   INTEGER NOT NULL DEFAULT 0,
  appointment_count INTEGER NOT NULL DEFAULT 0,
  last_interaction_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id, status);
CREATE INDEX IF NOT EXISTS idx_customers_created ON customers(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(business_id, name);

CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  source        TEXT,
  stage         TEXT NOT NULL DEFAULT 'NEW_LEAD',  -- NEW_LEAD | CONTACTED | QUALIFIED | PROPOSAL | NEGOTIATION | WON | LOST
  value_cents   INTEGER NOT NULL DEFAULT 0,
  score         INTEGER,
  score_reason  TEXT,
  owner_user_id TEXT REFERENCES users(id),
  notes         TEXT,
  last_contacted_at TEXT,
  next_follow_up_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_business ON leads(business_id, stage);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(business_id, next_follow_up_at);

CREATE TABLE IF NOT EXISTS lead_activities (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  lead_id     TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                       -- NOTE | CALL | EMAIL | SMS | MEETING | STAGE_CHANGE | AI
  content     TEXT NOT NULL,
  created_by_id TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at);

-- ---------------------------------------------------------------------------
-- Catalog / inventory / orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sku           TEXT,
  category      TEXT,
  description   TEXT,
  quantity      INTEGER NOT NULL DEFAULT 0,
  cost_cents    INTEGER NOT NULL DEFAULT 0,
  price_cents   INTEGER NOT NULL DEFAULT 0,
  supplier      TEXT,
  min_stock     INTEGER NOT NULL DEFAULT 0,
  unit          TEXT DEFAULT 'unit',
  active        INTEGER NOT NULL DEFAULT 1,
  units_sold    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id, active);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(business_id, sku);

CREATE TABLE IF NOT EXISTS services (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  price_cents   INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  active        INTEGER NOT NULL DEFAULT 1,
  times_booked  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_services_business ON services(business_id, active);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                       -- IN | OUT | SALE | ADJUST | WASTE
  quantity    INTEGER NOT NULL,
  note        TEXT,
  created_by_id TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(business_id, product_id, created_at);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  order_number  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | PAID | FULFILLED | CANCELLED | REFUNDED
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',   -- UNPAID | PAID | PARTIAL | REFUNDED
  payment_method TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents     INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents   INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  channel       TEXT DEFAULT 'IN_STORE',           -- IN_STORE | ONLINE | PHONE | WHATSAPP
  placed_at     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(business_id, customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL,                       -- PRODUCT | SERVICE
  item_id     TEXT,
  name        TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------------------
-- Appointments & tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  staff_id      TEXT REFERENCES staff(id) ON DELETE SET NULL,
  service_id    TEXT REFERENCES services(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  start_at      TEXT NOT NULL,
  end_at        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW
  price_cents   INTEGER NOT NULL DEFAULT 0,
  location      TEXT,
  notes         TEXT,
  source        TEXT DEFAULT 'DASHBOARD',          -- DASHBOARD | AI_ASSISTANT | PUBLIC_BOOKING | PHONE
  reminder_sent_at TEXT,
  created_by_id TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appointments_business ON appointments(business_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(business_id, staff_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(business_id, customer_id);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'TODO',      -- TODO | IN_PROGRESS | COMPLETED
  priority      TEXT NOT NULL DEFAULT 'MEDIUM',    -- LOW | MEDIUM | HIGH | URGENT
  assignee_user_id TEXT REFERENCES users(id),
  due_at        TEXT,
  related_type  TEXT,
  related_id    TEXT,
  source        TEXT NOT NULL DEFAULT 'MANUAL',    -- MANUAL | AI_RECOMMENDATION
  created_by_id TEXT REFERENCES users(id),
  completed_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_business ON tasks(business_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(business_id, due_at);

-- ---------------------------------------------------------------------------
-- Customer conversations, AI support
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL DEFAULT 'WEB_CHAT',  -- WEB_CHAT | WHATSAPP | SMS | EMAIL | PHONE | INSTAGRAM
  subject       TEXT,
  status        TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN | PENDING | ESCALATED | CLOSED
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_ai_handled INTEGER NOT NULL DEFAULT 1,
  needs_human   INTEGER NOT NULL DEFAULT 0,
  assigned_to_id TEXT REFERENCES users(id),
  unread_for_business INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_business ON conversations(business_id, last_message_at);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(business_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender        TEXT NOT NULL,                     -- CUSTOMER | AI | STAFF | SYSTEM
  sender_user_id TEXT REFERENCES users(id),
  body          TEXT NOT NULL,
  meta_json     TEXT,
  grounded      INTEGER,
  read_at       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  subject       TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'OPEN',      -- OPEN | IN_PROGRESS | RESOLVED | CLOSED
  priority      TEXT NOT NULL DEFAULT 'MEDIUM',
  escalated_from_ai INTEGER NOT NULL DEFAULT 0,
  escalation_reason TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  assigned_to_id TEXT REFERENCES users(id),
  resolved_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_business ON support_tickets(business_id, status);

CREATE TABLE IF NOT EXISTS support_settings (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  greeting      TEXT,
  tone          TEXT DEFAULT 'friendly-professional',
  escalation_message TEXT,
  handoff_email TEXT,
  collect_fields_json TEXT,
  auto_reply_enabled INTEGER NOT NULL DEFAULT 1,
  widget_enabled INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Knowledge base (AI retrieval)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'UPLOAD',    -- UPLOAD | FAQ | POLICY | CATALOG | MANUAL
  file_type     TEXT,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  storage_key   TEXT,
  raw_text      TEXT,
  status        TEXT NOT NULL DEFAULT 'READY',     -- PROCESSING | READY | FAILED
  error_message TEXT,
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_business ON knowledge_sources(business_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  source_id     TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  heading       TEXT,
  content       TEXT NOT NULL,
  keywords      TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_business ON knowledge_chunks(business_id, source_id);

CREATE TABLE IF NOT EXISTS faqs (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  category      TEXT,
  published     INTEGER NOT NULL DEFAULT 1,
  asked_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_faqs_business ON faqs(business_id, published);

-- ---------------------------------------------------------------------------
-- Content: documents, marketing, reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,                     -- INVOICE | QUOTE | RECEIPT | PROPOSAL | REPORT | MESSAGE | MARKETING_PLAN | SOP
  number        TEXT NOT NULL,
  title         TEXT NOT NULL,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT',     -- DRAFT | SENT | APPROVED | PAID | VOID
  content_json  TEXT,
  content_text  TEXT,
  total_cents   INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  source        TEXT NOT NULL DEFAULT 'MANUAL',    -- MANUAL | AI
  issued_at     TEXT,
  due_at        TEXT,
  created_by_id TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_business ON documents(business_id, type, created_at);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  objective     TEXT,
  audience      TEXT,
  channels_json TEXT,
  status        TEXT NOT NULL DEFAULT 'DRAFT',     -- DRAFT | GENERATED | APPROVED | SCHEDULED | PUBLISHED | ARCHIVED
  start_date    TEXT,
  end_date      TEXT,
  created_by_id TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_business ON marketing_campaigns(business_id, status);

CREATE TABLE IF NOT EXISTS marketing_posts (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  campaign_id   TEXT REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  channel       TEXT NOT NULL,                     -- FACEBOOK | INSTAGRAM | EMAIL | SMS | GOOGLE | LINKEDIN | TIKTOK
  title         TEXT,
  body          TEXT NOT NULL,
  hashtags      TEXT,
  status        TEXT NOT NULL DEFAULT 'DRAFT',     -- DRAFT | APPROVED | SCHEDULED | PUBLISHED | REJECTED
  scheduled_at  TEXT,
  published_at  TEXT,
  approved_by_id TEXT REFERENCES users(id),
  created_by_id TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_business ON marketing_posts(business_id, status);

CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,                     -- DAILY | WEEKLY | MONTHLY
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  title         TEXT NOT NULL,
  metrics_json  TEXT,
  ai_summary    TEXT,
  summary_source TEXT DEFAULT 'CALCULATED',        -- CALCULATED | AI
  generated_by_id TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_business ON reports(business_id, period, period_start);

-- ---------------------------------------------------------------------------
-- AI activity log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_runs (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id),
  surface       TEXT NOT NULL,                     -- ASSISTANT | SUPPORT | SALES | MARKETING | DOCUMENTS | ANALYTICS
  prompt        TEXT,
  response      TEXT,
  provider      TEXT NOT NULL,                     -- openai-compatible | builtin-analytics
  model         TEXT,
  sources_json  TEXT,
  grounded      INTEGER NOT NULL DEFAULT 0,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  latency_ms    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_business ON ai_runs(business_id, created_at);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id),
  type          TEXT NOT NULL,                     -- NEW_CUSTOMER | NEW_LEAD | NEW_APPOINTMENT | LOW_INVENTORY | SUPPORT_ESCALATION | BUSINESS_ALERT | TASK_DUE | AI
  title         TEXT NOT NULL,
  body          TEXT,
  level         TEXT NOT NULL DEFAULT 'INFO',      -- INFO | SUCCESS | WARNING | CRITICAL
  entity_type   TEXT,
  entity_id     TEXT,
  href          TEXT,
  read_at       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_business ON notifications(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(business_id, read_at);

-- ---------------------------------------------------------------------------
-- Billing, usage, platform
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,              -- FREE | STARTER | PROFESSIONAL | BUSINESS
  name          TEXT NOT NULL,
  tagline       TEXT,
  price_month_cents INTEGER NOT NULL DEFAULT 0,
  price_year_cents  INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  limits_json   TEXT NOT NULL,                     -- {customers, users, aiMessages, documents, whatsappMessages, storageMb}
  features_json TEXT NOT NULL,                     -- ["..."]
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  plan_code     TEXT NOT NULL REFERENCES plans(code),
  status        TEXT NOT NULL DEFAULT 'TRIALING',  -- TRIALING | ACTIVE | PAST_DUE | CANCELED | INCOMPLETE
  provider      TEXT NOT NULL DEFAULT 'manual',    -- manual | stripe
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',   -- MONTHLY | YEARLY
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  trial_ends_at TEXT,
  seats         INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_code, status);

CREATE TABLE IF NOT EXISTS usage_counters (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  metric        TEXT NOT NULL,                     -- AI_MESSAGES | DOCUMENTS | CUSTOMERS | USERS | STORAGE_BYTES | SUPPORT_MESSAGES
  period_key    TEXT NOT NULL,                     -- e.g. 2026-10
  count         INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL,
  UNIQUE (business_id, metric, period_key)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  metric        TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  meta_json     TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_events_business ON usage_events(business_id, metric, created_at);

CREATE TABLE IF NOT EXISTS integrations (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,                     -- WHATSAPP | STRIPE | GOOGLE_CALENDAR | MAILCHIMP | ...
  status        TEXT NOT NULL DEFAULT 'DISCONNECTED',
  config_json   TEXT,
  connected_by_id TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (business_id, provider)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY,
  business_id   TEXT REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  actor_email   TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  ip            TEXT,
  user_agent    TEXT,
  meta_json     TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_logs(business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id, created_at);

CREATE TABLE IF NOT EXISTS contact_messages (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  company       TEXT,
  topic         TEXT,
  message       TEXT NOT NULL,
  source        TEXT,
  status        TEXT NOT NULL DEFAULT 'NEW',
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Optional: keep created_at/updated_at accurate at the database level too.
-- The application always sets these columns explicitly; the trigger below is a
-- safety net that can be enabled in environments where rows are edited by hand.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wd_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'users','businesses','business_members','staff','customers','leads','products','services',
    'orders','appointments','tasks','conversations','support_tickets','support_settings',
    'knowledge_sources','faqs','documents','marketing_campaigns','marketing_posts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON %1$s', target);
    EXECUTE format('CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION wd_touch_updated_at()', target);
  END LOOP;
END;
$$;
