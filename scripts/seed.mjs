#!/usr/bin/env node
/**
 * Seeds the platform with plans plus one complete, fully-populated demo tenant so
 * that every workspace in the dashboard has real data to operate on.
 *
 *   npm run db:migrate             # create the tables first (or use --reset)
 *   npm run db:seed                # add plans + the demo tenant if it is missing
 *   npm run db:seed -- --force     # delete the demo tenant and seed it again
 *   npm run db:reset               # drop the database, recreate the schema, seed
 *
 * Credentials created (override with SEED_ADMIN_PASSWORD / SEED_OWNER_PASSWORD):
 *   Platform admin : admin@workspacedigital.app / AdminPassw0rd!
 *   Demo owner     : owner@test.local            / Str0ngPassw0rd!
 *   Demo manager   : manager@test.local          / ManagerPassw0rd!
 *   Demo staff     : staff@test.local            / StaffPassw0rd!
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const root = process.cwd();
const force = process.argv.includes('--force');
const file = process.env.DATABASE_FILE
  ? path.resolve(root, process.env.DATABASE_FILE)
  : path.join(root, 'data', 'workspace-digital.db');
const schema = path.join(root, 'db', 'schema.sqlite.sql');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || 'owner@test.local';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@workspacedigital.app';
const MANAGER_EMAIL = process.env.SEED_MANAGER_EMAIL || 'manager@test.local';
const STAFF_EMAIL = process.env.SEED_STAFF_EMAIL || 'staff@test.local';
const DEMO_SLUG = process.env.SEED_BUSINESS_SLUG || 'monrovia-beauty-studio';

const passwords = {
  admin: process.env.SEED_ADMIN_PASSWORD || 'AdminPassw0rd!',
  owner: process.env.SEED_OWNER_PASSWORD || 'Str0ngPassw0rd!',
  manager: process.env.SEED_MANAGER_PASSWORD || 'ManagerPassw0rd!',
  staff: process.env.SEED_STAFF_PASSWORD || 'StaffPassw0rd!',
};

fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec(fs.readFileSync(schema, 'utf8'));

const nid = (prefix) => `${prefix}_${randomBytes(6).toString('hex')}`;
const now = new Date();
const iso = (date) => date.toISOString();
const nowIso = iso(now);

function shift(days, hour = 9, minute = 0) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return iso(date);
}
const daysAgo = (days, hour = 9) => shift(-days, hour);
const daysAhead = (days, hour = 9) => shift(days, hour);

const insert = (table, values) => {
  const columns = Object.keys(values);
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  db.prepare(sql).run(...columns.map((column) => values[column]));
};
const one = (sql, ...params) => db.prepare(sql).get(...params);
const many = (sql, ...params) => db.prepare(sql).all(...params);
const hash = (value) => bcrypt.hashSync(value, 12);
const j = (value) => JSON.stringify(value);

// ---------------------------------------------------------------------------
// Plans — kept in sync with PLAN_CATALOGUE in src/lib/db/repositories/platform.ts
// ---------------------------------------------------------------------------
const PLANS = [
  {
    id: 'plan_free',
    code: 'FREE',
    name: 'Free',
    tagline: 'Get organised and try the AI assistant.',
    month: 0,
    year: 0,
    sort: 1,
    limits: { customers: 100, users: 2, aiMessages: 100, documents: 10, whatsappMessages: 200, storageMb: 50, appointments: 100, products: 50 },
    features: ['1 business workspace', 'Up to 100 customers', 'AI business assistant (100 messages / month)', 'Appointments, tasks and notifications', 'AI customer support widget', 'Basic reports'],
  },
  {
    id: 'plan_starter',
    code: 'STARTER',
    name: 'Starter',
    tagline: 'For solo founders and small teams going digital.',
    month: 2900,
    year: 29000,
    sort: 2,
    limits: { customers: 2000, users: 5, aiMessages: 2000, documents: 200, whatsappMessages: 3000, storageMb: 2000, appointments: 5000, products: 1000 },
    features: ['Everything in Free', 'Sales pipeline and lead scoring', 'Inventory with low-stock alerts', 'Document generator with PDF export', 'Marketing assistant', 'Weekly + monthly reports'],
  },
  {
    id: 'plan_professional',
    code: 'PROFESSIONAL',
    name: 'Professional',
    tagline: 'For growing businesses with a team and multiple channels.',
    month: 7900,
    year: 79000,
    sort: 3,
    limits: { customers: 25000, users: 15, aiMessages: 10000, documents: 2000, whatsappMessages: 15000, storageMb: 25000, appointments: 50000, products: 10000 },
    features: ['Everything in Starter', 'Team roles and audit logs', 'Marketing calendar with approval workflow', 'Advanced analytics and AI recommendations', 'Priority support escalation', 'Custom knowledge base'],
  },
  {
    id: 'plan_business',
    code: 'BUSINESS',
    name: 'Business',
    tagline: 'For established operations that need scale and control.',
    month: 19900,
    year: 199000,
    sort: 4,
    limits: { customers: 250000, users: 60, aiMessages: 60000, documents: 20000, whatsappMessages: 100000, storageMb: 250000, appointments: 500000, products: 100000 },
    features: ['Everything in Professional', 'Unlimited locations and workspaces', 'Dedicated manager and onboarding', 'Integration support (payments, WhatsApp, calendar)', 'SLA-backed AI usage', 'Data export and retention controls'],
  },
];

for (const plan of PLANS) {
  db.prepare(
    `INSERT INTO plans (id, code, name, tagline, price_month_cents, price_year_cents, currency, limits_json,
                        features_json, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, 1, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, tagline = excluded.tagline,
       price_month_cents = excluded.price_month_cents, price_year_cents = excluded.price_year_cents,
       limits_json = excluded.limits_json, features_json = excluded.features_json,
       sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
  ).run(plan.id, plan.code, plan.name, plan.tagline, plan.month, plan.year, j(plan.limits), j(plan.features), plan.sort, nowIso, nowIso);
}

// ---------------------------------------------------------------------------
// Platform administrator (no tenant access — /admin scope only)
// ---------------------------------------------------------------------------
if (!one('SELECT id FROM users WHERE email = ?', ADMIN_EMAIL)) {
  insert('users', {
    id: nid('usr'),
    email: ADMIN_EMAIL,
    email_verified_at: nowIso,
    password_hash: hash(passwords.admin),
    name: 'Platform Administrator',
    job_title: 'Platform operations',
    timezone: 'UTC',
    locale: 'en',
    theme: 'system',
    platform_role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
    created_at: nowIso,
    updated_at: nowIso,
  });
  console.log(`· platform admin ready  ${ADMIN_EMAIL} / ${passwords.admin}`);
}

// ---------------------------------------------------------------------------
// Demo tenant
// ---------------------------------------------------------------------------
const existing = one('SELECT id FROM businesses WHERE slug = ?', DEMO_SLUG);
if (existing && !force) {
  console.log(`✓ demo tenant already present (${DEMO_SLUG}) — pass --force to rebuild it`);
  db.close();
  process.exit(0);
}
if (existing && force) {
  db.prepare('DELETE FROM businesses WHERE id = ?').run(existing.id);
  db.prepare('DELETE FROM users WHERE email = ?').run(OWNER_EMAIL);
  db.prepare('DELETE FROM users WHERE email IN (?, ?)').run(MANAGER_EMAIL, STAFF_EMAIL);
  console.log('· removed previous demo tenant');
}

const ownerId = nid('usr');
const managerUserId = nid('usr');
const staffUserId = nid('usr');
const businessId = nid('biz');

insert('users', {
  id: ownerId,
  email: OWNER_EMAIL,
  email_verified_at: nowIso,
  password_hash: hash(passwords.owner),
  name: 'Rafeal Gomez',
  phone: '0888937524',
  job_title: 'Owner',
  timezone: 'Africa/Monrovia',
  locale: 'en',
  theme: 'system',
  platform_role: 'USER',
  status: 'ACTIVE',
  marketing_opt_in: 1,
  last_login_at: nowIso,
  created_at: nowIso,
  updated_at: nowIso,
});
for (const [id, email, name, title, password] of [
  [managerUserId, MANAGER_EMAIL, 'Miatta Kpadeh', 'Salon manager', passwords.manager],
  [staffUserId, STAFF_EMAIL, 'Grace Toe', 'Senior stylist', passwords.staff],
]) {
  insert('users', {
    id,
    email,
    email_verified_at: nowIso,
    password_hash: hash(password),
    name,
    job_title: title,
    timezone: 'Africa/Monrovia',
    locale: 'en',
    theme: 'system',
    platform_role: 'USER',
    status: 'ACTIVE',
    created_at: nowIso,
    updated_at: nowIso,
  });
}

const hours = [
  { day: 'mon', open: '09:00', close: '18:00', closed: false },
  { day: 'tue', open: '09:00', close: '18:00', closed: false },
  { day: 'wed', open: '09:00', close: '18:00', closed: false },
  { day: 'thu', open: '09:00', close: '19:00', closed: false },
  { day: 'fri', open: '08:00', close: '19:00', closed: false },
  { day: 'sat', open: '08:00', close: '16:00', closed: false },
  { day: 'sun', open: '09:00', close: '13:00', closed: true },
];

insert('businesses', {
  id: businessId,
  name: 'Monrovia Beauty Studio',
  slug: DEMO_SLUG,
  type: 'salon',
  description: 'Hair, nails and skin studio on Broad Street in central Monrovia. Braids, gel manicures, facials and massage by appointment or walk-in.',
  address: 'Broad Street, Sinkor',
  city: 'Monrovia',
  country: 'Liberia',
  phone: '0775550124',
  email: 'hello@monroviabeauty.example',
  website: 'https://monroviabeauty.example',
  timezone: 'Africa/Monrovia',
  currency: 'LRD',
  hours_json: j(hours),
  comms_json: j({
    preferredChannel: 'WHATSAPP',
    escalateTo: 'manager@test.local',
    autoReply: true,
    sendAppointmentReminders: true,
    reminderLeadHours: 24,
    notes: 'Confirm every booking on WhatsApp the day before. Most clients pay with mobile money.',
  }),
  onboarding_step: 10,
  onboarding_completed_at: daysAgo(21),
  owner_id: ownerId,
  created_at: daysAgo(30),
  updated_at: nowIso,
});

insert('business_members', {
  id: nid('mem'), business_id: businessId, user_id: ownerId, role: 'OWNER', status: 'ACTIVE',
  title: 'Owner', joined_at: daysAgo(30), created_at: daysAgo(30), updated_at: daysAgo(30),
});
insert('business_members', {
  id: nid('mem'), business_id: businessId, user_id: managerUserId, role: 'MANAGER', status: 'ACTIVE',
  title: 'Salon manager', invited_by_id: ownerId, joined_at: daysAgo(28), created_at: daysAgo(28), updated_at: daysAgo(28),
});
insert('business_members', {
  id: nid('mem'), business_id: businessId, user_id: staffUserId, role: 'STAFF', status: 'ACTIVE',
  title: 'Senior stylist', invited_by_id: ownerId, joined_at: daysAgo(24), created_at: daysAgo(24), updated_at: daysAgo(24),
});

const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
const staffWindows = j(
  Object.fromEntries(weekdays.map((day) => [day, [{ start: '09:00', end: '17:00' }]])),
);
const staffIds = [
  (() => {
    const id = nid('stf');
    insert('staff', {
      id, business_id: businessId, user_id: managerUserId, name: 'Ndapewa Amutenya', title: 'Salon manager',
      email: MANAGER_EMAIL, phone: '0775112345', specialties: j(['Braids', 'Colour', 'Customer care']),
      availability_json: staffWindows, color: '#3382fb', active: 1, created_at: daysAgo(28), updated_at: nowIso,
    });
    return id;
  })(),
  (() => {
    const id = nid('stf');
    insert('staff', {
      id, business_id: businessId, user_id: staffUserId, name: 'Teresia Shikongo', title: 'Senior stylist',
      email: STAFF_EMAIL, phone: '0886987654', specialties: j(['Gel nails', 'Facials', 'Massage']),
      availability_json: staffWindows, color: '#7c3aed', active: 1, created_at: daysAgo(24), updated_at: nowIso,
    });
    return id;
  })(),
];

// --- Services -------------------------------------------------------------
const services = [
  { name: 'Box braids', category: 'Braids', price: 180000, minutes: 180, description: 'Knotless box braids, includes wash and treatment.' },
  { name: 'Gel manicure', category: 'Nails', price: 120000, minutes: 60, description: 'Shape, cuticle care, gel colour and hardening.' },
  { name: 'Deep tissue massage', category: 'Massage', price: 250000, minutes: 90, description: 'Full-body deep tissue massage with hot towels.' },
  { name: 'Kids haircut', category: 'Hair', price: 70000, minutes: 30, description: 'Wash and cut for children under 12.' },
  { name: 'Signature facial', category: 'Skin', price: 280000, minutes: 75, description: 'Cleanse, exfoliate, mask and moisturise for all skin types.' },
  { name: 'Wash, cut & blow-dry', category: 'Hair', price: 140000, minutes: 60, description: 'Classic cut finished with a blow-dry and style.' },
].map((service) => {
  const id = nid('svc');
  insert('services', {
    id, business_id: businessId, name: service.name, description: service.description, category: service.category,
    price_cents: service.price, duration_minutes: service.minutes, active: 1, times_booked: 0,
    created_at: daysAgo(27), updated_at: daysAgo(27),
  });
  return { id, ...service };
});

// --- Products -------------------------------------------------------------
const products = [
  { name: 'Argan oil treatment 100ml', sku: 'ARG-100', category: 'Hair care', quantity: 3, cost: 95000, price: 185000, supplier: 'Monrovia Beauty Supply', min: 8 },
  { name: 'Sulphate-free shampoo 500ml', sku: 'SHM-500', category: 'Hair care', quantity: 24, cost: 62000, price: 129000, supplier: 'Monrovia Beauty Supply', min: 10 },
  { name: 'Gel polish set (12 colours)', sku: 'GEL-12', category: 'Nails', quantity: 6, cost: 210000, price: 395000, supplier: 'West Africa Nail Co', min: 4 },
  { name: 'Hair extensions bundle 18"', sku: 'EXT-18', category: 'Hair', quantity: 11, cost: 480000, price: 890000, supplier: 'West Africa Nail Co', min: 5 },
  { name: 'Hydrating face mask (single)', sku: 'MSK-01', category: 'Skin', quantity: 40, cost: 42000, price: 95000, supplier: 'Derma Monrovia', min: 15 },
  { name: 'Scalp massage brush', sku: 'BRH-01', category: 'Tools', quantity: 2, cost: 35000, price: 79000, supplier: 'Monrovia Beauty Supply', min: 6 },
].map((product) => {
  const id = nid('prd');
  insert('products', {
    id, business_id: businessId, name: product.name, sku: product.sku, category: product.category,
    description: `${product.name} — retail stock item.`, quantity: product.quantity, cost_cents: product.cost,
    price_cents: product.price, supplier: product.supplier, min_stock: product.min, unit: 'unit', active: 1,
    units_sold: 0, created_at: daysAgo(26), updated_at: nowIso,
  });
  insert('inventory_movements', {
    id: nid('mov'), business_id: businessId, product_id: id, type: 'IN', quantity: product.quantity,
    note: 'Opening stock count', created_by_id: ownerId, created_at: daysAgo(26),
  });
  return { id, ...product };
});

// --- Customers ------------------------------------------------------------
const customers = [
  { name: 'Mariama Kamara', phone: '0775112201', email: 'mariama@example.com', status: 'RETURNING', source: 'WALK_IN', spend: 965000, orders: 4, appointments: 6, tags: ['loyal', 'braids'], days: 2 },
  { name: 'Joseph Boley', phone: '0886223302', email: 'joseph@example.com', status: 'VIP', source: 'REFERRAL', spend: 2480000, orders: 9, appointments: 12, tags: ['vip', 'massage'], days: 1 },
  { name: 'Grace Wleh', phone: '0777334403', email: 'grace@example.com', status: 'ACTIVE', source: 'INSTAGRAM', spend: 420000, orders: 2, appointments: 3, tags: ['nails'], days: 5 },
  { name: 'Fatu Dukuly', phone: '0551445504', email: 'fatu@example.com', status: 'LEAD', source: 'WEBSITE', spend: 0, orders: 0, appointments: 0, tags: ['quote sent'], days: 1 },
  { name: 'Prince Nyemah', phone: '0773446605', email: 'prince@example.com', status: 'NEW', source: 'PUBLIC_BOOKING', spend: 70000, orders: 0, appointments: 1, tags: ['first visit'], days: 0 },
  { name: 'Comfort Toe', phone: '0881557706', email: 'comfort@example.com', status: 'INACTIVE', source: 'WALK_IN', spend: 285000, orders: 1, appointments: 2, tags: ['win-back'], days: 96 },
  { name: 'Aminata Sow', phone: '0778668807', email: 'aminata@example.com', status: 'ACTIVE', source: 'WHATSAPP', spend: 615000, orders: 3, appointments: 4, tags: ['facials'], days: 3 },
  { name: 'Emmanuel Dolo', phone: '0551779908', email: 'emmanuel@example.com', status: 'RETURNING', source: 'WALK_IN', spend: 1320000, orders: 5, appointments: 7, tags: ['hair', 'colour'], days: 6 },
].map((customer) => {
  const id = nid('cus');
  insert('customers', {
    id, business_id: businessId, name: customer.name, phone: customer.phone, email: customer.email,
    address: 'Monrovia', status: customer.status, source: customer.source, tags_json: j(customer.tags),
    notes: `${customer.name} prefers ${customer.source.toLowerCase().replace('_', ' ')} contact.`,
    total_spend_cents: customer.spend, order_count: customer.orders, appointment_count: customer.appointments,
    last_interaction_at: daysAgo(customer.days, 11), created_at: daysAgo(customer.days + 20), updated_at: nowIso,
  });
  return { id, ...customer };
});

// --- Leads ----------------------------------------------------------------
const leadStages = [
  { name: 'Fatu Dukuly', stage: 'NEW_LEAD', value: 650000, score: 62, source: 'WEBSITE', reason: 'Asked about bridal package pricing', followUp: 1, customerIndex: 3 },
  { name: 'Amelia Kromah', stage: 'CONTACTED', value: 1800000, score: 74, source: 'REFERRAL', reason: 'Corporate wellness day for 15 staff', followUp: 2, customerIndex: null },
  { name: 'Hawa Sirleaf', stage: 'QUALIFIED', value: 950000, score: 81, source: 'INSTAGRAM', reason: 'Monthly braids retainer, budget confirmed', followUp: 3, customerIndex: null },
  { name: 'Alfred Neufville', stage: 'PROPOSAL', value: 3200000, score: 88, source: 'PHONE', reason: 'Quote sent for weekly grooming service', followUp: 4, customerIndex: null },
  { name: 'Ruth Gbessagee', stage: 'NEGOTIATION', value: 2400000, score: 91, source: 'WHATSAPP', reason: 'Negotiating package discount for 6 months', followUp: 5, customerIndex: null },
  { name: 'Daniel Seakor', stage: 'WON', value: 1450000, score: 96, source: 'REFERRAL', reason: 'Signed 12-month grooming contract', followUp: null, customerIndex: null },
  { name: 'Vivian Tarr', stage: 'LOST', value: 700000, score: 38, source: 'WEBSITE', reason: 'Chose a cheaper competitor this time', followUp: null, customerIndex: null },
];
for (const lead of leadStages) {
  const id = nid('led');
  insert('leads', {
    id, business_id: businessId, customer_id: lead.customerIndex === null ? null : customers[lead.customerIndex].id,
    name: lead.name, phone: '0770190023', email: `${lead.name.split(' ')[0].toLowerCase()}@example.com`,
    source: lead.source, stage: lead.stage, value_cents: lead.value, score: lead.score, score_reason: lead.reason,
    owner_user_id: ownerId, notes: `AI lead score ${lead.score}/100 — ${lead.reason}`,
    last_contacted_at: lead.followUp === null ? daysAgo(9) : daysAgo(lead.followUp, 10),
    next_follow_up_at: lead.followUp === null ? null : daysAhead(lead.followUp, 10),
    created_at: daysAgo(14), updated_at: nowIso,
  });
  insert('lead_activities', {
    id: nid('lac'), business_id: businessId, lead_id: id, type: 'AI', content: `AI qualification: ${lead.reason}`,
    created_by_id: ownerId, created_at: daysAgo(7, 12),
  });
}

// --- Orders ---------------------------------------------------------------
const orderPlan = [
  { customerIndex: 0, days: 0, status: 'PAID', payment: 'PAID', method: 'CASH', channel: 'IN_STORE', items: [{ serviceIndex: 0 }, { productIndex: 0 }] },
  { customerIndex: 1, days: 1, status: 'PAID', payment: 'PAID', method: 'CARD', channel: 'IN_STORE', items: [{ serviceIndex: 2 }, { productIndex: 4 }] },
  { customerIndex: 2, days: 2, status: 'PAID', payment: 'PAID', method: 'CARD', channel: 'ONLINE', items: [{ serviceIndex: 1 }, { productIndex: 2 }] },
  { customerIndex: 6, days: 4, status: 'PAID', payment: 'PAID', method: 'EFT', channel: 'WHATSAPP', items: [{ serviceIndex: 4 }, { productIndex: 4 }] },
  { customerIndex: 7, days: 6, status: 'FULFILLED', payment: 'PAID', method: 'CASH', channel: 'IN_STORE', items: [{ serviceIndex: 5 }, { productIndex: 1 }] },
  { customerIndex: 4, days: 0, status: 'PENDING', payment: 'UNPAID', method: null, channel: 'PHONE', items: [{ serviceIndex: 3 }] },
];
let orderSeq = 0;
orderPlan.forEach((plan, index) => {
  orderSeq += 1;
  const id = nid('ord');
  const lines = plan.items.map((item) => {
    if (item.serviceIndex !== undefined) {
      const service = services[item.serviceIndex];
      return { type: 'SERVICE', itemId: service.id, name: service.name, quantity: 1, unit: service.price };
    }
    const product = products[item.productIndex];
    const quantity = 1;
    return { type: 'PRODUCT', itemId: product.id, name: product.name, quantity, unit: product.price };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.unit * line.quantity, 0);
  const tax = Math.round(subtotal * 0.10);
  const total = subtotal + tax;
  const placedAt = daysAgo(plan.days, 11 + index);
  insert('orders', {
    id, business_id: businessId, customer_id: customers[plan.customerIndex].id,
    order_number: `ORD-${String(orderSeq).padStart(4, '0')}`, status: plan.status, payment_status: plan.payment,
    payment_method: plan.method, subtotal_cents: subtotal, tax_cents: tax, discount_cents: 0, total_cents: total,
    notes: null, channel: plan.channel, placed_at: placedAt, created_at: placedAt, updated_at: placedAt,
  });
  for (const line of lines) {
    insert('order_items', {
      id: nid('oit'), business_id: businessId, order_id: id, item_type: line.type, item_id: line.itemId,
      name: line.name, quantity: line.quantity, unit_price_cents: line.unit, total_cents: line.unit * line.quantity,
    });
    if (line.type === 'PRODUCT') {
      db.prepare('UPDATE products SET units_sold = units_sold + ? WHERE id = ?').run(line.quantity, line.itemId);
    }
    if (line.type === 'SERVICE') {
      db.prepare('UPDATE services SET times_booked = times_booked + ? WHERE id = ?').run(line.quantity, line.itemId);
    }
  }
});

// --- Appointments ---------------------------------------------------------
const appointmentPlan = [
  { customerIndex: 0, serviceIndex: 0, staff: 0, start: daysAhead(0, 9), status: 'CONFIRMED' },
  { customerIndex: 4, serviceIndex: 1, staff: 1, start: daysAhead(0, 14), status: 'CONFIRMED' },
  { customerIndex: 1, serviceIndex: 2, staff: 1, start: daysAhead(1, 10), status: 'PENDING' },
  { customerIndex: 6, serviceIndex: 4, staff: 1, start: daysAhead(2, 11), status: 'CONFIRMED' },
  { customerIndex: 7, serviceIndex: 5, staff: 0, start: daysAhead(3, 15), status: 'PENDING' },
  { customerIndex: 2, serviceIndex: 1, staff: 1, start: daysAgo(2, 10), status: 'COMPLETED' },
  { customerIndex: 3, serviceIndex: 3, staff: 0, start: daysAgo(4, 13), status: 'COMPLETED' },
  { customerIndex: 5, serviceIndex: 5, staff: 0, start: daysAgo(6, 9), status: 'CANCELLED' },
];
for (const plan of appointmentPlan) {
  const service = services[plan.serviceIndex];
  const start = plan.start;
  const end = iso(new Date(new Date(start).getTime() + service.minutes * 60000));
  insert('appointments', {
    id: nid('apt'), business_id: businessId, customer_id: customers[plan.customerIndex].id,
    staff_id: staffIds[plan.staff], service_id: service.id, title: `${service.name} — ${customers[plan.customerIndex].name}`,
    start_at: start, end_at: end, status: plan.status, price_cents: service.price,
    location: 'Studio floor', notes: null, source: plan.status === 'PENDING' ? 'PUBLIC_BOOKING' : 'DASHBOARD',
    reminder_sent_at: plan.status === 'CONFIRMED' ? daysAgo(1, 9) : null, created_by_id: ownerId,
    created_at: daysAgo(9), updated_at: nowIso,
  });
}

// --- Tasks ----------------------------------------------------------------
const taskPlan = [
  { title: 'Call Amelia about the corporate wellness day', status: 'TODO', priority: 'HIGH', due: daysAhead(1, 12), assignee: managerUserId, source: 'AI_RECOMMENDATION', related: 'LEAD' },
  { title: 'Reorder argan oil and scalp brushes', status: 'TODO', priority: 'URGENT', due: daysAhead(0, 16), assignee: ownerId, source: 'AI_RECOMMENDATION', related: 'PRODUCT' },
  { title: 'Publish the spring promotion on Instagram', status: 'IN_PROGRESS', priority: 'MEDIUM', due: daysAhead(2, 10), assignee: managerUserId, source: 'MANUAL', related: 'CAMPAIGN' },
  { title: 'Follow up with Comfort Toe (win-back)', status: 'TODO', priority: 'HIGH', due: daysAhead(3, 11), assignee: staffUserId, source: 'AI_RECOMMENDATION', related: 'CUSTOMER' },
  { title: 'Update the price list PDF for the knowledge base', status: 'COMPLETED', priority: 'LOW', due: daysAgo(3, 17), assignee: ownerId, source: 'MANUAL', related: null },
  { title: 'Confirm Saturday bookings on WhatsApp', status: 'TODO', priority: 'MEDIUM', due: daysAhead(1, 9), assignee: managerUserId, source: 'MANUAL', related: 'APPOINTMENT' },
];
for (const task of taskPlan) {
  insert('tasks', {
    id: nid('tsk'), business_id: businessId, title: task.title,
    description: `${task.title}.`, status: task.status, priority: task.priority, assignee_user_id: task.assignee,
    due_at: task.due, related_type: task.related, related_id: null, source: task.source, created_by_id: ownerId,
    completed_at: task.status === 'COMPLETED' ? daysAgo(3, 17) : null, created_at: daysAgo(6), updated_at: nowIso,
  });
}

// --- Knowledge base: support settings, documents, FAQs, source chunks ------
insert('support_settings', {
  id: nid('sup'), business_id: businessId,
  greeting: 'Hi! Welcome to Monrovia Beauty Studio. Ask me about services, prices, opening hours or booking.',
  tone: 'friendly-professional',
  escalation_message: 'I want to make sure you get an accurate answer, so I have asked a member of our team to help you directly.',
  handoff_email: MANAGER_EMAIL,
  collect_fields_json: j(['name', 'email', 'phone']),
  auto_reply_enabled: 1, widget_enabled: 1, created_at: daysAgo(27), updated_at: nowIso,
});

const policyText = [
  'MONROVIA BEAUTY STUDIO — SERVICE POLICY',
  '',
  'Opening hours: Monday to Wednesday 09:00-18:00, Thursday 09:00-19:00, Friday 08:00-19:00, Saturday 08:00-16:00. Closed on Sundays.',
  '',
  'Booking and cancellations: appointments can be booked online, on WhatsApp or by phone. Please arrive 10 minutes early. Cancel or reschedule at least 12 hours before your slot so we can offer it to another client. Late cancellations may be charged 50% of the service price.',
  '',
  'Deposits: braiding, colour and extension services require a 30% deposit to hold the slot. Deposits are credited to the final invoice.',
  '',
  'Payment: we accept cash, mobile money (MTN MoMo or Orange Money) and bank transfer. Retail products can be paid for in the studio or online. Invoices are issued for every service and are payable within 7 days.',
  '',
  'Refunds: retail products can be returned unopened within 14 days with the receipt. Services are non-refundable, but we will happily correct any work you are unhappy with within 7 days.',
  '',
  'Studio rules: children are welcome, please bring a companion for children under 6 during long braiding sessions. We are a smoke-free studio. Please let us know about allergies before treatments.',
].join('\n');

const policySourceId = nid('ksc');
insert('knowledge_sources', {
  id: policySourceId, business_id: businessId, title: 'Service policy & studio guide', kind: 'POLICY',
  file_type: 'txt', size_bytes: Buffer.byteLength(policyText, 'utf8'), storage_key: null, raw_text: policyText,
  status: 'READY', chunk_count: 0, created_by_id: ownerId, created_at: daysAgo(25), updated_at: daysAgo(25),
});
const priceText = [
  'PRICE LIST (all prices in Liberian dollars)',
  '',
  'Box braids — L$1,800 (180 minutes). Knotless box braids including wash and treatment.',
  'Gel manicure — L$1,200 (60 minutes). Shape, cuticle care, gel colour and hardening.',
  'Deep tissue massage — L$2,500 (90 minutes). Full-body deep tissue massage with hot towels.',
  'Kids haircut — L$700 (30 minutes). Wash and cut for children under 12.',
  'Signature facial — L$2,800 (75 minutes). Cleanse, exfoliate, mask and moisturise for all skin types.',
  'Wash, cut & blow-dry — L$1,400 (60 minutes). Classic cut finished with a blow-dry and style.',
].join('\n');
const priceSourceId = nid('ksc');
insert('knowledge_sources', {
  id: priceSourceId, business_id: businessId, title: 'Price list 2026', kind: 'CATALOG', file_type: 'txt',
  size_bytes: Buffer.byteLength(priceText, 'utf8'), storage_key: null, raw_text: priceText, status: 'READY',
  chunk_count: 0, created_by_id: ownerId, created_at: daysAgo(25), updated_at: daysAgo(25),
});

const chunk = (sourceId, heading, content, position) => {
  insert('knowledge_chunks', {
    id: nid('kch'), business_id: businessId, source_id: sourceId, heading, content,
    keywords: content.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2).join(' '),
    position, created_at: daysAgo(25),
  });
};
let policyPosition = 0;
for (const paragraph of policyText.split('\n')) {
  if (!paragraph.trim()) continue;
  chunk(policySourceId, paragraph.split(':')[0].slice(0, 60), paragraph.trim(), policyPosition++);
}
let pricePosition = 0;
for (const line of priceText.split('\n')) {
  if (!line.trim()) continue;
  chunk(priceSourceId, line.split('—')[0].trim().slice(0, 60), line.trim(), pricePosition++);
}
db.prepare('UPDATE knowledge_sources SET chunk_count = ? WHERE id = ?').run(policyPosition, policySourceId);
db.prepare('UPDATE knowledge_sources SET chunk_count = ? WHERE id = ?').run(pricePosition, priceSourceId);

const faqs = [
  ['Do you take walk-ins?', 'Yes — walk-ins are welcome before 11:00 and after 15:00, subject to availability. Weekends fill up fast, so booking is recommended.'],
  ['How much are box braids?', 'Box braids are L$1,800 and take about 180 minutes, including a wash and treatment. A 30% deposit holds your slot.'],
  ['Can I cancel or reschedule?', 'Yes. Please cancel or reschedule at least 12 hours before your appointment so we can offer the slot to someone else. Late cancellations may be charged 50%.'],
  ['Which payment methods do you accept?', 'Cash, mobile money (MTN MoMo or Orange Money) and bank transfer. Invoices are payable within 7 days.'],
  ['Do you sell hair and nail products?', 'Yes — shampoo, argan oil, gel polish sets, extensions and face masks are available in the studio, and we can deliver in Monrovia.'],
  ['Are your products safe for sensitive skin?', 'We use hypoallergenic products for facials and can patch-test before any treatment. Please tell us about allergies when you book.'],
];
for (const [question, answer] of faqs) {
  insert('faqs', {
    id: nid('faq'), business_id: businessId, question, answer, category: 'General', published: 1,
    asked_count: Math.floor(Math.random() * 12), created_at: daysAgo(24), updated_at: daysAgo(24),
  });
}

// --- Conversations, tickets ----------------------------------------------
const conversationPlan = [
  {
    contact: 'Mariama Kamara', email: 'mariama@example.com', phone: '0775112201', subject: 'Braids pricing and availability',
    status: 'OPEN', needsHuman: 0, unread: 1, customerIndex: 0,
    messages: [
      { sender: 'CUSTOMER', body: 'How much are knotless box braids and do you have a slot on Saturday?', grounded: null },
      { sender: 'AI', body: 'Box braids are N$350 and take about 180 minutes. We have Saturday slots from 08:00 — would you like me to hold one?', grounded: 1 },
    ],
  },
  {
    contact: 'Comfort Toe', email: 'comfort@example.com', phone: '0881557706', subject: 'Complaint about gift voucher',
    status: 'ESCALATED', needsHuman: 1, unread: 1, customerIndex: 5,
    messages: [
      { sender: 'CUSTOMER', body: 'My gift voucher expired last week and I never got a reminder. I want it honoured.', grounded: null },
      { sender: 'AI', body: 'I am sorry about that. I have asked a member of our team to help you directly, and they will follow up today.', grounded: 0 },
    ],
  },
  {
    contact: 'Aminata Sow', email: 'aminata@example.com', phone: '0778668807', subject: 'Facial for sensitive skin',
    status: 'PENDING', needsHuman: 1, unread: 0, customerIndex: 6,
    messages: [
      { sender: 'CUSTOMER', body: 'Do you have a facial that is safe for rosacea?', grounded: null },
      { sender: 'AI', body: 'I am not certain which products are safe for rosacea, so our therapist will confirm before we book you in.', grounded: 0 },
    ],
  },
];
conversationPlan.forEach((plan, index) => {
  const id = nid('cnv');
  const lastMessageAt = daysAgo(index, 10 + index);
  insert('conversations', {
    id, business_id: businessId, customer_id: customers[plan.customerIndex].id, channel: index === 1 ? 'WHATSAPP' : 'WEB_CHAT',
    subject: plan.subject, status: plan.status, contact_name: plan.contact, contact_email: plan.email,
    contact_phone: plan.phone, is_ai_handled: 1, needs_human: plan.needsHuman,
    assigned_to_id: plan.needsHuman ? managerUserId : null, unread_for_business: plan.unread,
    last_message_at: lastMessageAt, created_at: lastMessageAt, updated_at: lastMessageAt,
  });
  plan.messages.forEach((message, messageIndex) => {
    insert('messages', {
      id: nid('msg'), business_id: businessId, conversation_id: id, sender: message.sender,
      sender_user_id: null, body: message.body, meta_json: null, grounded: message.grounded,
      read_at: messageIndex === 0 ? lastMessageAt : null,
      created_at: lastMessageAt,
    });
  });
});
insert('support_tickets', {
  id: nid('tkt'), business_id: businessId, conversation_id: null, customer_id: customers[5].id,
  subject: 'Gift voucher expired without reminder', description: 'Customer wants the expired voucher honoured. Manager to approve an extension.',
  status: 'OPEN', priority: 'HIGH', escalated_from_ai: 1,
  escalation_reason: 'Customer is unhappy and the policy does not cover goodwill gestures.',
  contact_name: 'Comfort Toe', contact_email: 'comfort@example.com', contact_phone: '0881557706',
  assigned_to_id: managerUserId, resolved_at: null, created_at: daysAgo(1, 13), updated_at: daysAgo(1, 13),
});

// --- Documents, marketing, reports ---------------------------------------
insert('documents', {
  id: nid('doc'), business_id: businessId, type: 'INVOICE', number: 'INV-0001',
  title: 'Invoice — box braids and argan oil', customer_id: customers[0].id, status: 'SENT',
  content_json: j({
    sections: [
      { heading: 'Summary', body: 'Box braids (L$1,800) and argan oil treatment 100ml (L$1,850) supplied on account.' },
      { heading: 'Amount due', body: 'Total: L$4,015 including tax.' },
      { heading: 'Payment terms', body: 'Payment is due within 7 days. Please reference INV-0001 when paying.' },
    ],
  }),
  content_text: 'Invoice INV-0001 — box braids and argan oil. Total L$4,015.',
  total_cents: 401500, currency: 'LRD', source: 'MANUAL', issued_at: daysAgo(3), due_at: daysAhead(4),
  created_by_id: ownerId, created_at: daysAgo(3), updated_at: daysAgo(3),
});
insert('documents', {
  id: nid('doc'), business_id: businessId, type: 'SOP', number: 'SOP-0001',
  title: 'Opening and closing checklist', customer_id: null, status: 'APPROVED',
  content_json: j({
    sections: [
      { heading: 'Opening', body: 'Unlock at 08:15, sanitise stations, count the till float, confirm the day’s bookings on WhatsApp.' },
      { heading: 'During the day', body: 'Log every walk-in in the CRM, update stock when a retail item is sold, mark completed appointments.' },
      { heading: 'Closing', body: 'Cash up against the day’s orders, report low stock, lock the retail cabinet, set the alarm.' },
    ],
  }),
  content_text: 'Opening and closing checklist for the studio.',
  total_cents: 0, currency: 'LRD', source: 'AI', issued_at: daysAgo(10), due_at: null,
  created_by_id: ownerId, created_at: daysAgo(10), updated_at: daysAgo(10),
});

const campaignId = nid('cmp');
insert('marketing_campaigns', {
  id: campaignId, business_id: businessId, name: 'October self-care promotion',
  objective: 'Fill quiet Tuesday and Wednesday slots with a 15% self-care bundle.',
  audience: 'Existing clients in Monrovia who visited in the last 90 days',
  channels_json: j(['INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'EMAIL']),
  status: 'APPROVED', start_date: daysAhead(1).slice(0, 10), end_date: daysAhead(21).slice(0, 10),
  created_by_id: ownerId, created_at: daysAgo(5), updated_at: daysAgo(2),
});
insert('marketing_posts', {
  id: nid('pst'), business_id: businessId, campaign_id: campaignId, channel: 'INSTAGRAM',
  title: 'Self-care Tuesday', body: 'Mid-week reset: 15% off our signature facial and gel manicure bundle every Tuesday and Wednesday this month. Booking link in bio — limited slots.',
  hashtags: '#MonroviaBeauty #SelfCare #NailTech #Facial', status: 'APPROVED', scheduled_at: daysAhead(1, 8),
  published_at: null, approved_by_id: ownerId, created_by_id: ownerId, created_at: daysAgo(5), updated_at: daysAgo(2),
});
insert('marketing_posts', {
  id: nid('pst'), business_id: businessId, campaign_id: campaignId, channel: 'WHATSAPP',
  title: 'WhatsApp broadcast', body: 'Hi {{name}}! We saved you a Tuesday slot — 15% off the facial + manicure bundle this month. Reply BOOK and we will confirm your time.',
  hashtags: null, status: 'SCHEDULED', scheduled_at: daysAhead(2, 9), published_at: null,
  approved_by_id: managerUserId, created_by_id: ownerId, created_at: daysAgo(5), updated_at: daysAgo(1),
});
insert('marketing_posts', {
  id: nid('pst'), business_id: businessId, campaign_id: campaignId, channel: 'EMAIL',
  title: 'Newsletter draft', body: 'Subject: Your mid-week reset (15% off). Body draft awaiting owner review before it is scheduled.',
  hashtags: null, status: 'DRAFT', scheduled_at: null, published_at: null, approved_by_id: null,
  created_by_id: ownerId, created_at: daysAgo(1), updated_at: daysAgo(1),
});

insert('reports', {
  id: nid('rpt'), business_id: businessId, period: 'WEEKLY', period_start: daysAgo(7), period_end: nowIso,
  title: 'Monrovia Beauty Studio — weekly performance recap',
  metrics_json: j({
    revenueCents: 1187000, revenueChangePct: 12.4, orders: 5, averageOrderCents: 237400,
    newCustomers: 2, totalCustomers: 8, appointments: { total: 8, completed: 2, cancelled: 1 },
    topItems: [{ name: 'Box braids', units: 1, revenueCents: 180000 }, { name: 'Deep tissue massage', units: 1, revenueCents: 250000 }],
    lowStock: [{ name: 'Argan oil treatment 100ml', quantity: 3, minStock: 8 }],
    leads: [{ stage: 'QUALIFIED', count: 1, valueCents: 950000 }],
    support: { openConversations: 2, openTickets: 1 },
  }),
  ai_summary: 'Revenue is up 12,4% week on week, driven by massage and braiding services. Two retail items are below minimum stock, so reorder before the weekend. Follow up with the qualified corporate lead and publish the approved self-care promotion.',
  summary_source: 'AI', generated_by_id: ownerId, created_at: daysAgo(1),
});

// --- AI runs, usage, notifications, audit, subscription -------------------
insert('ai_runs', {
  id: nid('air'), business_id: businessId, user_id: ownerId, surface: 'ASSISTANT',
  prompt: 'What should we promote this week?', response: 'Promote the facial and manicure bundle to existing clients; Tuesday and Wednesday still have capacity.',
  provider: 'builtin-analytics', model: null, sources_json: j([{ title: 'Verified business data', kind: 'VERIFIED_DATA' }]),
  grounded: 1, tokens_in: 0, tokens_out: 0, latency_ms: 42, created_at: daysAgo(1, 9),
});
insert('ai_runs', {
  id: nid('air'), business_id: businessId, user_id: null, surface: 'SUPPORT',
  prompt: 'How much are box braids?', response: 'Box braids are L$1,800 and take about 180 minutes, including a wash and treatment.',
  provider: 'builtin-knowledge', model: null, sources_json: j([{ title: 'Price list 2026', kind: 'BUSINESS_DOCUMENT' }]),
  grounded: 1, tokens_in: 0, tokens_out: 0, latency_ms: 18, created_at: daysAgo(2, 14),
});

const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
for (const [metric, count] of [['AI_MESSAGES', 12], ['DOCUMENTS', 4], ['SUPPORT_MESSAGES', 26], ['CUSTOMERS', 8], ['USERS', 3]]) {
  insert('usage_counters', {
    id: nid('ucn'), business_id: businessId, metric, period_key: periodKey, count, updated_at: nowIso,
  });
}
for (const [metric, quantity] of [['AI_MESSAGES', 3], ['SUPPORT_MESSAGES', 9], ['DOCUMENTS', 1]]) {
  insert('usage_events', {
    id: nid('uev'), business_id: businessId, metric, quantity, meta_json: null, created_at: daysAgo(1, 12),
  });
}

const notifications = [
  ['NEW_APPOINTMENT', 'New booking from the public page', 'Prince Nyemah booked Gel manicure for today at 14:00.', 'INFO', 'APPOINTMENT', '/dashboard/appointments', 0],
  ['LOW_INVENTORY', '2 products at or below minimum stock', 'Argan oil treatment 100ml (3 left) and scalp massage brush (2 left) need reordering.', 'WARNING', 'PRODUCT', '/dashboard/inventory', 0],
  ['SUPPORT_ESCALATION', 'Support escalation needs a human reply', 'Comfort Toe disputed an expired gift voucher — ticket is open.', 'CRITICAL', 'TICKET', '/dashboard/support', 0],
  ['TASK_DUE', 'Task due today', 'Reorder argan oil and scalp brushes is due today.', 'INFO', 'TASK', '/dashboard/tasks', 1],
];
for (const [type, title, body, level, entityType, href, read] of notifications) {
  insert('notifications', {
    id: nid('ntf'), business_id: businessId, user_id: null, type, title, body, level,
    entity_type: entityType, entity_id: null, href, read_at: read ? daysAgo(0, 8) : null, created_at: daysAgo(0, 8),
  });
}

for (const [action, entityType, entityId] of [
  ['business.created', 'BUSINESS', businessId],
  ['onboarding.completed', 'BUSINESS', businessId],
  ['knowledge.uploaded', 'KNOWLEDGE_SOURCE', policySourceId],
  ['marketing.approved', 'MARKETING_POST', campaignId],
]) {
  insert('audit_logs', {
    id: nid('aud'), business_id: businessId, actor_user_id: ownerId, actor_email: OWNER_EMAIL,
    action, entity_type: entityType, entity_id: entityId, ip: '127.0.0.1', user_agent: 'seed-script',
    meta_json: null, created_at: daysAgo(5, 10),
  });
}

insert('subscriptions', {
  id: nid('sub'), business_id: businessId, plan_code: 'STARTER', status: 'ACTIVE', provider: 'manual',
  provider_customer_id: null, provider_subscription_id: null, billing_cycle: 'MONTHLY',
  current_period_start: daysAgo(12), current_period_end: daysAhead(18), cancel_at_period_end: 0,
  trial_ends_at: daysAhead(2), seats: 3, created_at: daysAgo(12), updated_at: daysAgo(12),
});

insert('contact_messages', {
  id: nid('ctm'), name: 'Martha Kollie', email: 'martha@example.com', phone: '0775551234',
  company: 'Sinkor Retail Group', topic: 'demo', message: 'We run two retail shops and want to try the appointments and AI support features.',
  source: 'landing-contact', status: 'NEW', created_at: daysAgo(2, 15),
});

// ---------------------------------------------------------------------------
const counts = {
  businesses: one('SELECT count(*) AS c FROM businesses').c,
  users: one('SELECT count(*) AS c FROM users').c,
  customers: one('SELECT count(*) AS c FROM customers').c,
  orders: one('SELECT count(*) AS c FROM orders').c,
  appointments: one('SELECT count(*) AS c FROM appointments').c,
  tasks: one('SELECT count(*) AS c FROM tasks').c,
  knowledge_chunks: one('SELECT count(*) AS c FROM knowledge_chunks').c,
  faqs: one('SELECT count(*) AS c FROM faqs').c,
  notifications: one('SELECT count(*) AS c FROM notifications').c,
};

console.log(`✓ seeded ${path.relative(root, file)}`);
console.log(`  ${Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join('  ')}`);
console.log('');
console.log('  Sign in with:');
console.log(`    Platform admin  ${ADMIN_EMAIL} / ${passwords.admin}   →  /admin`);
console.log(`    Business owner  ${OWNER_EMAIL} / ${passwords.owner}   →  /dashboard`);
console.log(`    Manager         ${MANAGER_EMAIL} / ${passwords.manager}`);
console.log(`    Staff           ${STAFF_EMAIL} / ${passwords.staff}`);
console.log(`    Public booking  /book/${DEMO_SLUG}    Public AI support  /support/${DEMO_SLUG}`);
db.close();
