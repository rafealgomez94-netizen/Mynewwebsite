#!/usr/bin/env node
/**
 * End-to-end smoke suite.
 *
 * Drives the running application through its real HTTP API: authentication,
 * onboarding, catalog, CRM, orders, appointments, tasks, support, knowledge
 * grounding, AI assistant, marketing approval, documents, reports, billing, team
 * invitations, tenant isolation and rate limiting.
 *
 *   npm run dev                 # in one terminal
 *   npm run smoke               # in another
 *   SMOKE_BASE_URL=http://host:3000 npm run smoke
 *
 * The suite creates its own tenant (smoke-<timestamp>) and removes it again at the
 * end, so the demo data stays untouched. It exits non-zero if any check fails.
 */
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const STAMP = `${Date.now().toString().slice(-7)}`;
const OWNER_EMAIL = `smoke-owner-${STAMP}@example.test`;
const INVITEE_EMAIL = `smoke-invitee-${STAMP}@example.test`;
const SECOND_EMAIL = `smoke-second-${STAMP}@example.test`;
const OWNER_PASSWORD = 'SmokeTest1!pass';
const INVITEE_PASSWORD = 'SmokeInvite1!pass';
const SLUG = `smoke-studio-${STAMP}`;
const ISOLATION_EMAIL = `smoke-isolation-${STAMP}@example.test`;

const results = [];
const created = { businessIds: [], userIds: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function eq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} — expected ${expected}, got ${actual}`);
}

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  async request(method, pathname, options = {}) {
    return this.send(method, pathname, options, true);
  }

  async send(method, pathname, options, allowRetry) {
    const headers = { ...(options.headers || {}) };
    if (this.cookies.size) {
      headers.cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    }
    let payload;
    if (options.form) {
      payload = options.form;
    } else if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(options.body);
    }
    let response;
    try {
      response = await fetch(`${BASE}${pathname}`, {
        method,
        headers,
        body: payload,
        redirect: 'manual',
      });
    } catch (error) {
      // A dev server recompiles routes on first use and can drop the connection
      // while it does. Retry just this request once the server answers again;
      // checks that mutate state assert deltas, so a rare double-apply cannot
      // produce a false failure.
      const message = error instanceof Error ? error.message : String(error);
      if (!allowRetry || !/fetch failed|ECONNREFUSED|socket hang up|other side closed|terminated/i.test(message)) {
        throw error;
      }
      await waitForServer(120000);
      return this.send(method, pathname, options, false);
    }
    const rawCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const cookie of rawCookies.length ? rawCookies : [response.headers.get('set-cookie')].filter(Boolean)) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
    if (options.binary) {
      // PDFs and other compressed uploads must be handled as bytes: decoding them
      // as UTF-8 replaces invalid sequences and corrupts the file under test.
      const buffer = Buffer.from(await response.arrayBuffer());
      return { status: response.status, json: null, text: buffer.toString('latin1'), buffer, headers: response.headers };
    }
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, json, text, headers: response.headers };
  }

  get(pathname) {
    return this.request('GET', pathname);
  }
  getBinary(pathname) {
    return this.request('GET', pathname, { binary: true });
  }
  post(pathname, body, options = {}) {
    return this.request('POST', pathname, { body, ...options });
  }
  patch(pathname, body) {
    return this.request('PATCH', pathname, { body });
  }
  put(pathname, body) {
    return this.request('PUT', pathname, { body });
  }
  del(pathname, body) {
    return this.request('DELETE', pathname, { body });
  }
}

/**
 * A dev server can restart itself (Next's dev memory guard) in the middle of a
 * long run. That is infrastructure noise, not a product failure, so a check that
 * failed because the socket was gone is retried once after the server answers
 * again. Assertion failures are never retried.
 */
function isTransient(message) {
  return /fetch failed|ECONNREFUSED|socket hang up|other side closed|terminated/i.test(message);
}

async function waitForServer(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: 'manual' });
      if (res.status < 500) return true;
    } catch {
      /* still restarting */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

/**
 * Auth endpoints are rate limited per IP, and the suite deliberately locks the
 * login endpoint at the very end of a run (a security property worth testing).
 * A follow-up run started inside the same window would otherwise fail for
 * reasons that have nothing to do with the product, so an auth call that comes
 * back `429` waits the reported time out and retries once. The limiter states
 * exactly how long is left and does not extend the block while it is rejecting
 * requests, so waiting the reported time is enough.
 */
async function authCall(method, session, pathname, body) {
  const send = () => (method === 'POST' ? session.post(pathname, body) : session.request(method, pathname, { body }));
  const response = await send();
  if (response.status !== 429) return response;
  const seconds = Number((response.json?.error?.message ?? '').match(/(\d+)\s+seconds/)?.[1] ?? 0);
  if (!seconds || seconds > 15 * 60) return response;
  console.log(`  … ${pathname} is rate limited — waiting ${seconds}s for the window to clear`);
  await new Promise((resolve) => setTimeout(resolve, (seconds + 2) * 1000));
  return send();
}

function signIn(session, email, password) {
  return authCall('POST', session, '/api/auth/login', { email, password });
}

function signUp(session, payload) {
  return authCall('POST', session, '/api/auth/signup', payload);
}

/**
 * Builds a minimal but real DOCX (a ZIP archive containing word/document.xml) so
 * the DOCX ingestion path can be exercised without shipping a binary fixture.
 */
function buildDocx(lines) {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    lines.map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join('') +
    '</w:body></w:document>';
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
    ['word/document.xml', xml],
  ];
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const nameBuffer = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    parts.push(local, nameBuffer, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBuffer.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuffer, end]);
}

async function check(name, fn) {
  const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const note = await fn();
      results.push({
        name,
        pass: true,
        note: `${note ?? ''}${attempt > 1 ? ' (retried after a server restart)' : ''}`,
        ms: Date.now() - started,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 1 && isTransient(message)) {
        console.log(`  … server unavailable (${message}) — waiting for it to come back`);
        const back = await waitForServer();
        if (back) continue;
        results.push({ name, pass: false, note: `${message} — server did not come back`, ms: Date.now() - started });
        return;
      }
      results.push({ name, pass: false, note: message, ms: Date.now() - started });
      return;
    }
  }
}

const owner = new Session('owner');
const invitee = new Session('invitee');
const second = new Session('second');
const anon = new Session('anon');

console.log(`\nWorkspace Digital — end-to-end smoke suite\n  target ${BASE}\n  tenant smoke-studio-${STAMP}\n`);

// ---------------------------------------------------------------------------
// 0. Reachability
// ---------------------------------------------------------------------------
await check('application is reachable', async () => {
  const res = await anon.get('/');
  eq(res.status, 200, 'GET /');
  return 'HTTP 200';
});

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------
let verificationToken = '';
let resetToken = '';

await check('signup requires accepting the terms', async () => {
  const res = await signUp(anon, { name: 'No Terms', email: `noterms-${STAMP}@example.test`, password: OWNER_PASSWORD });
  eq(res.status, 422, 'missing acceptTerms');
});

await check('signup creates an account', async () => {
  const res = await signUp(owner, {
    name: 'Smoke Owner',
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    acceptTerms: true,
  });
  eq(res.status, 201, 'POST /api/auth/signup');
  verificationToken = res.json?.data?.verification?.devUrl?.split('token=')[1] ?? '';
  return res.json?.data?.user?.email ?? '';
});

await check('duplicate email is rejected', async () => {
  const res = await signUp(anon, { name: 'Copy Cat', email: OWNER_EMAIL, password: OWNER_PASSWORD, acceptTerms: true });
  eq(res.status, 409, 'duplicate signup');
});

await check('weak passwords are rejected', async () => {
  const res = await signUp(anon, { name: 'Weak', email: `weak-${STAMP}@example.test`, password: 'abc', acceptTerms: true });
  eq(res.status, 422, 'weak password');
});

await check('email verification works and is single-use', async () => {
  assert(verificationToken, 'no verification token issued (is this a production build?)');
  const first = await authCall('POST', owner, '/api/auth/verify-email', { token: verificationToken });
  eq(first.status, 200, 'verify email');
  const second = await authCall('POST', owner, '/api/auth/verify-email', { token: verificationToken });
  eq(second.status, 400, 're-used verification token');
  return 'verified, replay blocked';
});

await check('unauthenticated API calls are refused', async () => {
  const res = await anon.get('/api/customers');
  eq(res.status, 401, 'GET /api/customers without session');
});

await check('unauthenticated pages redirect to login', async () => {
  const res = await anon.get('/dashboard');
  eq(res.status, 307, 'GET /dashboard without session');
  assert((res.headers.get('location') || '').includes('/login'), 'redirect target');
});

await check('login rejects a wrong password', async () => {
  const res = await authCall('POST', anon, '/api/auth/login', { email: OWNER_EMAIL, password: 'WrongPassword1!' });
  eq(res.status, 401, 'wrong password');
});

await check('login succeeds and opens a session', async () => {
  const res = await signIn(owner, OWNER_EMAIL, OWNER_PASSWORD);
  eq(res.status, 200, 'login');
  return `next ${res.json?.data?.next}`;
});

await check('forgot password does not reveal whether an account exists', async () => {
  const known = await authCall('POST', anon, '/api/auth/forgot-password', { email: OWNER_EMAIL });
  const unknown = await authCall('POST', anon, '/api/auth/forgot-password', { email: `ghost-${STAMP}@example.test` });
  eq(known.status, 200, 'known email');
  eq(unknown.status, 200, 'unknown email');
  assert(known.json?.data?.requested && unknown.json?.data?.requested, 'both must report requested');
  resetToken = known.json?.data?.devUrl?.split('token=')[1] ?? '';
  assert(resetToken, 'no reset token issued (is this a production build?)');
  return 'same response for both';
});

/**
 * Availability is computed from business hours (Mon–Sat open in the smoke
 * tenant, Sunday closed), so pick a day the workspace is genuinely open on
 * rather than trusting "today + N" to land on a weekday.
 */
function workingDay(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function workingDate(offsetDays, hour = 10) {
  const date = new Date(`${workingDay(offsetDays)}T00:00:00.000Z`);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

// ---------------------------------------------------------------------------
// 2. Onboarding
// ---------------------------------------------------------------------------
await check('onboarding creates the business workspace', async () => {
  const res = await owner.post('/api/business/profile', {
    name: 'Smoke Test Studio',
    type: 'salon',
    description: 'Automated verification tenant.',
    address: '1 Test Road',
    city: 'Windhoek',
    country: 'Namibia',
    phone: '0810000000',
    email: `studio-${STAMP}@example.test`,
    currency: 'NAD',
    hours: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day) => ({
      day,
      open: '09:00',
      close: '18:00',
      closed: false,
    })).concat([{ day: 'sunday', open: '09:00', close: '13:00', closed: true }]),
    comms: { preferredChannel: 'WHATSAPP', escalateTo: `studio-${STAMP}@example.test`, autoReply: true, sendAppointmentReminders: true, reminderLeadHours: 24 },
    onboardingStep: 4,
  });
  eq(res.status, 201, 'POST /api/business/profile');
  const business = res.json?.data?.business;
  assert(business?.id, 'business id missing');
  created.businessIds.push(business.id);
  return business.id;
});

let businessId = created.businessIds[0];

await check('business slug is generated and unique', async () => {
  const res = await owner.get('/api/business/profile');
  eq(res.status, 200, 'GET /api/business/profile');
  const business = (res.json?.data?.businesses ?? []).find((entry) => entry.id === businessId);
  assert(business, 'business not found');
  assert(/^[a-z0-9-]+$/.test(business.slug), `unexpected slug: ${business.slug}`);
  return business.slug;
});

await check('onboarding steps advance and complete', async () => {
  for (let step = 5; step <= 10; step += 1) {
    const res = await owner.patch('/api/business/profile', { onboardingStep: step });
    eq(res.status, 200, `step ${step}`);
  }
  const done = await owner.patch('/api/business/profile', { complete: true });
  eq(done.status, 200, 'complete onboarding');
  return 'steps 5-10 + complete';
});

await check('business hours accept long and short day keys', async () => {
  const res = await owner.patch('/api/business/profile', {
    hours: [
      { day: 'monday', open: '08:00', close: '18:00', closed: false },
      { day: 'tue', open: '08:00', close: '18:00', closed: false },
      { day: 'wednesday', open: '08:00', close: '18:00', closed: false },
      { day: 'thu', open: '08:00', close: '18:00', closed: false },
      { day: 'friday', open: '08:00', close: '18:00', closed: false },
      { day: 'sat', open: '08:00', close: '18:00', closed: false },
      { day: 'sunday', open: '09:00', close: '13:00', closed: true },
    ],
  });
  eq(res.status, 200, 'PATCH hours');
  return 'normalised';
});

// ---------------------------------------------------------------------------
// 3. Catalog: services, products, stock, staff
// ---------------------------------------------------------------------------
let serviceId = '';
let productId = '';
let staffId = '';
let customerId = '';
let leadId = '';
let orderId = '';

await check('service is created', async () => {
  const res = await owner.post('/api/services', {
    name: 'Smoke Braids',
    description: 'Test service',
    category: 'Braids',
    price: '250',
    durationMinutes: 90,
    active: true,
  });
  eq(res.status, 201, 'POST /api/services');
  serviceId = res.json.data.service?.id;
  return serviceId;
});

await check('service is updated and listed', async () => {
  const updated = await owner.patch('/api/services', { id: serviceId, price: '300', name: 'Smoke Braids Deluxe' });
  eq(updated.status, 200, 'PATCH /api/services');
  const list = await owner.get('/api/services');
  eq(list.status, 200, 'GET /api/services');
  const service = (list.json.data.services ?? []).find((entry) => entry.id === serviceId);
  assert(service, 'service missing from list');
  eq(service.price_cents, 30000, 'updated price');
  return `${service.name} @ ${service.price_cents}`;
});

await check('product is created with stock settings', async () => {
  const res = await owner.post('/api/products', {
    name: 'Smoke Shampoo',
    sku: `SMK-${STAMP}`,
    category: 'Hair care',
    quantity: 10,
    minStock: 4,
    cost: '50',
    price: '120',
    supplier: 'Smoke Supplier',
    unit: 'bottle',
    active: true,
  });
  eq(res.status, 201, 'POST /api/products');
  productId = res.json.data.product?.id;
  return productId;
});

await check('stock adjustment records a movement and changes the level', async () => {
  // Asserted as a delta: the absolute level depends on what earlier steps did,
  // and a retried request must not be able to turn this into a false failure.
  const before = await owner.get('/api/products');
  const start = (before.json.data.products ?? []).find((entry) => entry.id === productId)?.quantity ?? 0;

  const res = await owner.patch('/api/products', { adjust: { productId, type: 'OUT', quantity: 8, note: 'smoke test' } });
  eq(res.status, 200, 'stock adjustment');

  const list = await owner.get('/api/products');
  const product = (list.json.data.products ?? []).find((entry) => entry.id === productId);
  eq(product.quantity, Math.max(0, start - 8), 'quantity after adjustment');

  // The movement journal is joined to the product, so it identifies the row by
  // product name rather than by id.
  const movements = list.json.data.movements ?? [];
  assert(
    movements.some(
      (movement) => movement.product_name === 'Smoke Shampoo' && movement.type === 'OUT' && movement.quantity === 8,
    ),
    `the adjustment was not journalled as a stock movement (got ${JSON.stringify(movements.slice(0, 3))})`,
  );
  return `${start} → ${product.quantity} after OUT 8 (movement recorded)`;
});

await check('low-stock detection reports the product', async () => {
  const res = await owner.get('/api/products?lowStock=true');
  eq(res.status, 200, 'GET low stock');
  const low = res.json.data.products ?? res.json.data.rows ?? [];
  assert(low.some((entry) => entry.id === productId), 'product not reported as low');
  return `${low.length} low-stock item(s)`;
});

await check('staff member is created with availability', async () => {
  const res = await owner.post('/api/staff', {
    name: 'Smoke Stylist',
    title: 'Stylist',
    email: `stylist-${STAMP}@example.test`,
    phone: '0811111111',
    specialties: ['Braids'],
    availability: { mon: [{ start: '09:00', end: '17:00' }], tue: [{ start: '09:00', end: '17:00' }], wed: [{ start: '09:00', end: '17:00' }], thu: [{ start: '09:00', end: '17:00' }], fri: [{ start: '09:00', end: '17:00' }], sat: [{ start: '09:00', end: '17:00' }] },
    active: true,
  });
  eq(res.status, 201, 'POST /api/staff');
  staffId = res.json.data.staff?.id;
  return staffId;
});

// ---------------------------------------------------------------------------
// 4. Knowledge base
// ---------------------------------------------------------------------------
let sourceId = '';
let faqId = '';

await check('pasted knowledge text is indexed', async () => {
  const res = await owner.post('/api/knowledge', {
    kind: 'text',
    data: {
      title: 'Smoke price list',
      kind: 'CATALOG',
      body: [
      'SMOKE TEST STUDIO PRICES',
      '',
      'Smoke Braids Deluxe: N$300, takes 90 minutes, includes a wash.',
      'Beard trim: N$80, walk-ins welcome before 11:00.',
        'Gift vouchers never expire at this studio.',
      ].join('\n'),
    },
  });
  eq(res.status, 201, 'POST /api/knowledge text');
  sourceId = res.json.data.source.id;
  assert((res.json.data.stats?.chunks ?? 0) > 0, 'no chunks indexed');
  return `${res.json.data.stats.chunks} chunk(s)`;
});

await check('FAQ is created, updated and deleteable', async () => {
  const created_ = await owner.post('/api/knowledge', {
    kind: 'faq',
    data: { question: 'Do you take walk-ins?', answer: 'Yes, before 11:00 daily.', category: 'General', published: true },
  });
  eq(created_.status, 201, 'FAQ create');
  faqId = created_.json.data.id;
  const updated = await owner.patch('/api/knowledge', { id: faqId, answer: 'Yes — before 11:00, subject to availability.' });
  eq(updated.status, 200, 'FAQ update');
  return 'created + updated';
});

await check('file upload is accepted and indexed', async () => {
  const form = new FormData();
  form.set('kind', 'POLICY');
  form.set(
    'files',
    new File(
      ['SMOKE POLICY\n\nCancellations need 12 hours notice. Deposits are 30% for braiding services.'],
      'smoke-policy.txt',
      { type: 'text/plain' },
    ),
  );
  const res = await owner.request('POST', '/api/knowledge/upload', { form });
  eq(res.status, 201, 'POST /api/knowledge/upload');
  return `${res.json.data.created?.length ?? 0} file(s) indexed`;
});

await check('unsupported upload types are refused', async () => {
  const form = new FormData();
  form.set('files', new File(['binary'], 'virus.exe', { type: 'application/octet-stream' }));
  const res = await owner.request('POST', '/api/knowledge/upload', { form });
  eq(res.status, 422, 'rejected upload');
});

await check('FAQ can be deleted', async () => {
  const res = await owner.del('/api/knowledge', { id: faqId, type: 'faq' });
  eq(res.status, 200, 'FAQ delete');
});

// ---------------------------------------------------------------------------
// 5. CRM
// ---------------------------------------------------------------------------
await check('customer is created', async () => {
  const res = await owner.post('/api/customers', {
    name: 'Smoke Customer',
    phone: '0812222222',
    email: `customer-${STAMP}@example.test`,
    status: 'NEW',
    source: 'SMOKE_TEST',
    tags: ['smoke'],
    notes: 'Created by the smoke suite.',
  });
  eq(res.status, 201, 'POST /api/customers');
  customerId = res.json.data.customer?.id;
  return customerId;
});

await check('customer is searchable, filterable and updatable', async () => {
  const search = await owner.get('/api/customers?search=Smoke%20Customer');
  eq(search.status, 200, 'customer search');
  assert((search.json.data.rows ?? []).some((row) => row.id === customerId), 'search missed the customer');

  const filtered = await owner.get('/api/customers?status=NEW');
  assert((filtered.json.data.rows ?? []).some((row) => row.id === customerId), 'status filter missed the customer');

  const updated = await owner.patch(`/api/customers/${customerId}`, { status: 'VIP', tags: ['smoke', 'vip'] });
  eq(updated.status, 200, 'customer update');

  const detail = await owner.get(`/api/customers/${customerId}`);
  eq(detail.status, 200, 'customer detail');
  eq(detail.json.data.customer.status, 'VIP', 'updated status');
  return 'search + filter + update';
});

await check('lead is created and moves through the pipeline', async () => {
  const created_ = await owner.post('/api/leads', {
    name: 'Smoke Lead',
    phone: '0813333333',
    email: `lead-${STAMP}@example.test`,
    source: 'SMOKE_TEST',
    stage: 'NEW_LEAD',
    value: '7000',
    notes: 'Automated lead.',
  });
  eq(created_.status, 201, 'POST /api/leads');
  leadId = created_.json.data.lead?.id;

  for (const stage of ['CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON']) {
    const moved = await owner.patch(`/api/leads/${leadId}`, { stage });
    eq(moved.status, 200, `stage ${stage}`);
  }
  const detail = await owner.get(`/api/leads/${leadId}`);
  eq(detail.status, 200, 'lead detail');
  eq(detail.json.data.lead.stage, 'WON', 'final stage');
  const activities = detail.json.data.lead.activities ?? detail.json.data.activities ?? [];
  assert(activities.length > 0, 'no stage activity recorded');
  return `5 stages, ${activities.length} activit(ies)`;
});

// ---------------------------------------------------------------------------
// 6. Orders, inventory linkage
// ---------------------------------------------------------------------------
let stockBeforeSale = 0;

await check('order is created from a service and a product', async () => {
  const beforeOrder = await owner.get('/api/products');
  stockBeforeSale = (beforeOrder.json.data.products ?? []).find((entry) => entry.id === productId)?.quantity ?? 0;
  const res = await owner.post('/api/orders', {
    customerId,
    status: 'PAID',
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    channel: 'IN_STORE',
    tax: '15',
    items: [
      { itemType: 'SERVICE', itemId: serviceId, name: 'Smoke Braids Deluxe', quantity: 1, unitPrice: '300' },
      { itemType: 'PRODUCT', itemId: productId, name: 'Smoke Shampoo', quantity: 1, unitPrice: '120' },
    ],
  });
  eq(res.status, 201, 'POST /api/orders');
  orderId = res.json.data.id ?? res.json.data.order?.id;
  assert(orderId, 'order id missing');
  return orderId;
});

await check('selling a product decrements stock', async () => {
  const list = await owner.get('/api/products');
  const product = (list.json.data.products ?? []).find((entry) => entry.id === productId);
  const expected = Math.max(0, stockBeforeSale - 1);
  eq(product.quantity, expected, 'quantity after the sale');
  return `${stockBeforeSale} → ${product.quantity}`;
});

await check('order status can be advanced', async () => {
  const res = await owner.patch('/api/orders', { id: orderId, status: 'FULFILLED', paymentStatus: 'PAID' });
  eq(res.status, 200, 'PATCH /api/orders');
  return 'FULFILLED';
});

// ---------------------------------------------------------------------------
// 7. Appointments
// ---------------------------------------------------------------------------
let appointmentId = '';

await check('availability returns real slots from business hours', async () => {
  const day = workingDay(2);
  const res = await owner.get(`/api/appointments?availability=true&day=${day}&duration=90`);
  eq(res.status, 200, 'availability');
  const slots = res.json.data.slots ?? [];
  assert(slots.length > 0, 'no slots returned for a working day');
  return `${slots.length} slots on ${day}`;
});

await check('appointment is created, rescheduled and cancelled', async () => {
  const start = workingDate(2, 9);
  const end = new Date(start.getTime() + 90 * 60000);
  const created_ = await owner.post('/api/appointments', {
    title: 'Smoke appointment',
    customerId,
    staffId,
    serviceId,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: 'CONFIRMED',
    price: '300',
    location: 'Studio',
  });
  eq(created_.status, 201, 'POST /api/appointments');
  appointmentId = created_.json.data.id;

  const moved = await owner.patch('/api/appointments', { id: appointmentId, startAt: new Date(start.getTime() + 86400000).toISOString(), endAt: new Date(end.getTime() + 86400000).toISOString() });
  eq(moved.status, 200, 'reschedule');

  const cancelled = await owner.patch('/api/appointments', { id: appointmentId, status: 'CANCELLED' });
  eq(cancelled.status, 200, 'cancel');
  return 'created → rescheduled → cancelled';
});

await check('public booking creates an appointment and a customer record', async () => {
  const profile = await owner.get('/api/business/profile');
  const business = (profile.json.data.businesses ?? []).find((entry) => entry.id === businessId);
  const slug = business?.slug;
  assert(slug, 'no slug for the smoke tenant');

  const start = workingDate(3, 10);
  const res = await anon.post('/api/public/book', {
    businessSlug: slug,
    serviceId,
    staffId,
    startAt: start.toISOString(),
    customerName: 'Public Smoke Booker',
    customerPhone: '0814444444',
    customerEmail: `booker-${STAMP}@example.test`,
    notes: 'Booked by the smoke suite',
  });
  eq(res.status, 201, 'POST /api/public/book');
  assert(res.json.data.appointmentId, 'no appointment id returned');
  return `booking ${res.json.data.appointmentId}`;
});

// ---------------------------------------------------------------------------
// 8. Tasks and notifications
// ---------------------------------------------------------------------------
let taskId = '';

await check('task is created, progressed and completed', async () => {
  const created_ = await owner.post('/api/tasks', {
    title: 'Smoke task',
    description: 'Created by the smoke suite.',
    status: 'TODO',
    priority: 'HIGH',
    dueAt: new Date(Date.now() + 86400000).toISOString(),
  });
  eq(created_.status, 201, 'POST /api/tasks');
  taskId = created_.json.data.id;

  const progress = await owner.patch('/api/tasks', { id: taskId, status: 'IN_PROGRESS', priority: 'URGENT' });
  eq(progress.status, 200, 'move to IN_PROGRESS');
  const done = await owner.patch('/api/tasks', { id: taskId, status: 'COMPLETED' });
  eq(done.status, 200, 'complete');
  return 'TODO → IN_PROGRESS → COMPLETED';
});

await check('notifications are produced and can be marked read', async () => {
  const list = await owner.get('/api/notifications');
  eq(list.status, 200, 'GET /api/notifications');
  const items = list.json.data.items ?? [];
  const read = await owner.post('/api/notifications', { all: true });
  eq(read.status, 200, 'mark all read');
  const after = await owner.get('/api/notifications');
  eq(after.json.data.unread, 0, 'unread count after marking read');
  return `${items.length} notification(s)`;
});

// ---------------------------------------------------------------------------
// 9. Support: conversations, tickets, AI escalation
// ---------------------------------------------------------------------------
let conversationId = '';
let ticketId = '';

await check('conversation is created and staff can reply', async () => {
  const created_ = await owner.post('/api/conversations', {
    customerId,
    channel: 'WEB_CHAT',
    subject: 'Smoke conversation',
    contactName: 'Smoke Customer',
    contactEmail: `customer-${STAMP}@example.test`,
    firstMessage: 'I would like to know your cancellation policy.',
  });
  eq(created_.status, 201, 'POST /api/conversations');
  conversationId = created_.json.data.conversationId;

  const reply = await owner.post(`/api/conversations/${conversationId}/messages`, { body: 'Thanks — cancellations need 12 hours notice.' });
  eq(reply.status, 200, 'staff reply');
  assert((reply.json.data.messages ?? []).some((message) => message.sender === 'STAFF'), 'staff reply was not stored');
  return conversationId;
});

await check('AI draft replies from the knowledge base', async () => {
  const res = await owner.post(`/api/conversations/${conversationId}/messages`, { mode: 'ai_draft', question: 'How much is Smoke Braids Deluxe?' });
  eq(res.status, 200, 'ai draft');
  const draft = res.json.data.draft ?? {};
  assert((draft.reply ?? '').length > 3, 'empty draft');
  const cited = draft.sources?.length ?? 0;
  return `draft returned (${draft.escalated ? 'escalated — no knowledge match' : `grounded, ${cited} source(s)`})`;
});

await check('ticket is created, prioritised and resolved', async () => {
  const created_ = await owner.post('/api/support/tickets', {
    subject: 'Smoke ticket',
    description: 'Raised by the smoke suite.',
    priority: 'MEDIUM',
    status: 'OPEN',
    contactName: 'Smoke Customer',
    contactEmail: `customer-${STAMP}@example.test`,
    conversationId,
    customerId,
  });
  eq(created_.status, 201, 'POST /api/support/tickets');
  ticketId = created_.json.data.id;

  const updated = await owner.patch('/api/support/tickets', { id: ticketId, status: 'IN_PROGRESS', priority: 'HIGH' });
  eq(updated.status, 200, 'ticket update');
  const resolved = await owner.patch('/api/support/tickets', { id: ticketId, status: 'RESOLVED' });
  eq(resolved.status, 200, 'ticket resolve');
  return 'OPEN → IN_PROGRESS → RESOLVED';
});

await check('support settings can be read and updated', async () => {
  const before = await owner.get('/api/support/settings');
  eq(before.status, 200, 'GET support settings');
  const updated = await owner.patch('/api/support/settings', {
    greeting: 'Hi! Ask me anything about Smoke Test Studio.',
    tone: 'friendly-professional',
    widgetEnabled: true,
    autoReplyEnabled: true,
  });
  eq(updated.status, 200, 'PATCH support settings');
});

await check('public support answers from the uploaded price list', async () => {
  const profile = await owner.get('/api/business/profile');
  const slug = (profile.json.data.businesses ?? []).find((entry) => entry.id === businessId)?.slug;

  const res = await anon.post('/api/support/public', {
    businessSlug: slug,
    message: 'How much is Smoke Braids Deluxe and how long does it take?',
  });
  eq(res.status, 200, 'POST /api/support/public');
  assert(res.json.data.grounded === true, 'answer was not grounded');
  assert(String(res.json.data.reply).includes('300'), `answer did not quote the price: ${res.json.data.reply}`);
  return 'grounded answer quoting the indexed price';
});

await check('public support escalates when it lacks information', async () => {
  const profile = await owner.get('/api/business/profile');
  const slug = (profile.json.data.businesses ?? []).find((entry) => entry.id === businessId)?.slug;

  const res = await anon.post('/api/support/public', {
    businessSlug: slug,
    message: 'Do you offer underwater laser welding and what is your marine insurance process?',
    name: 'Confused Visitor',
    email: `visitor-${STAMP}@example.test`,
    phone: '0815555555',
  });
  eq(res.status, 200, 'public support fallback');
  eq(res.json.data.escalated, true, 'should escalate');

  const tickets = await owner.get('/api/support/tickets');
  const escalated = (tickets.json.data.tickets ?? []).filter((ticket) => ticket.escalated_from_ai);
  assert(escalated.length > 0, 'no escalation ticket was created');
  return 'escalated and ticketed';
});

// ---------------------------------------------------------------------------
// 10. AI business assistant
// ---------------------------------------------------------------------------
await check('assistant answers grounded business questions', async () => {
  const questions = [
    ['How many customers did we get this week?', 'CUSTOMER_COUNT'],
    ['Which products are low in stock?', 'LOW_STOCK'],
    ['What should we promote this week?', 'PROMOTION_IDEA'],
    ['What were our best-selling products?', 'BEST_SELLERS'],
  ];
  const seen = [];
  for (const [message, expectedIntent] of questions) {
    const res = await owner.post('/api/ai/assistant', { message });
    eq(res.status, 200, `assistant: ${message}`);
    const data = res.json.data;
    assert(data.answer?.length > 20, `empty answer for: ${message}`);
    assert(data.sections?.length > 0, `no labelled sections for: ${message}`);
    assert(data.intent === expectedIntent, `intent for "${message}" — expected ${expectedIntent}, got ${data.intent}`);
    seen.push(data.intent);
  }
  return seen.join(', ');
});

await check('assistant cites uploaded documents and refuses to guess', async () => {
  const grounded = await owner.post('/api/ai/assistant', { message: 'How much is Smoke Braids Deluxe?' });
  eq(grounded.status, 200, 'document question');
  assert(grounded.json.data.grounded === true, 'document answer not grounded');
  assert(grounded.json.data.sources?.length > 0, 'no document sources cited');

  const unknown = await owner.post('/api/ai/assistant', { message: 'What is our policy on interstellar freight and zero gravity manicures?' });
  eq(unknown.status, 200, 'unknown question');
  eq(unknown.json.data.grounded, false, 'unknown question should not claim grounding');
  assert(/not enough information|could not match/i.test(unknown.json.data.answer), `answer did not admit uncertainty: ${unknown.json.data.answer}`);
  return 'documents cited; unknowns flagged';
});

await check('chunk keyword format stays compatible with retrieval', async () => {
  // Chunks written by the app store a space-separated token bag; rows written by
  // other tooling (the demo seeder, hand edits) used to store a JSON array, which
  // made them invisible to BM25 and caused real questions to escalate. Both shapes
  // must stay retrievable, and the inspector must stay tenant-scoped.
  const db = new DatabaseSync(dbFilePath());
  const newest = db
    .prepare('SELECT id, source_id, keywords FROM knowledge_chunks WHERE business_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(businessId);
  assert(newest, 'no chunk indexed for the smoke tenant');
  assert(!String(newest.keywords ?? '').trim().startsWith('['), 'the app must write a space-separated token bag');

  db.prepare(
    `INSERT INTO knowledge_chunks (id, business_id, source_id, heading, content, keywords, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `kbc_legacy_${STAMP}`,
    businessId,
    newest.source_id,
    null,
    'Zephyrbloom signature treatment costs N$987 and takes 45 minutes.',
    JSON.stringify(['zephyrbloom', 'signature', 'treatment', 'costs', 'minutes']),
    -1,
    new Date().toISOString(),
  );
  db.close();

  const res = await owner.get(`/api/dev/grounding?q=${encodeURIComponent('How much is the Zephyrbloom treatment?')}`);
  if (res.status === 404) return 'skipped — the grounding inspector is development only';
  eq(res.status, 200, 'grounding inspector');
  assert((res.json.data.chunks ?? []).length > 0, 'a JSON-keyword chunk was not retrievable');
  assert(res.json.data.chunks[0].content.includes('Zephyrbloom'), 'the wrong chunk ranked first');

  const other = await owner.get('/api/dev/grounding?businessId=biz_not_mine&q=anything');
  eq(other.status, 403, 'cross-workspace inspection');
  const unauthenticated = await anon.get('/api/dev/grounding?q=opening+hours');
  eq(unauthenticated.status, 401, 'anonymous inspection');

  return 'token bag + legacy JSON rows both retrieve; access is tenant-scoped';
});

await check('assistant generates a follow-up message and a weekly report', async () => {
  const followUp = await owner.post('/api/ai/assistant', { message: 'Create a customer follow-up message for a VIP who has not visited in a month.' });
  eq(followUp.status, 200, 'follow-up message');
  assert((followUp.json.data.answer ?? '').length > 30, 'empty follow-up message');

  const report = await owner.post('/api/ai/assistant', { message: 'Create a weekly business report.' });
  eq(report.status, 200, 'weekly report');
  assert(report.json.data.intent === 'WEEKLY_REPORT', `unexpected intent ${report.json.data.intent}`);
  return 'both generated';
});

// ---------------------------------------------------------------------------
// 11. Marketing approval workflow
// ---------------------------------------------------------------------------
let draftPostId = '';

await check('marketing content is generated as drafts', async () => {
  const res = await owner.post('/api/marketing', {
    mode: 'posts',
    channel: 'INSTAGRAM',
    goal: 'Fill quiet weekday slots',
    audience: 'Existing customers',
    offer: '15% off',
    variants: 3,
  });
  eq(res.status, 201, 'generate posts');
  const posts = res.json.data.posts ?? [];
  assert(posts.length >= 2, `expected several posts, got ${posts.length}`);
  assert(posts.every((post) => post.status === 'DRAFT'), 'generated content must start as DRAFT');
  draftPostId = posts[0].id;
  return `${posts.length} draft(s)`;
});

await check('publishing without approval is blocked', async () => {
  const res = await owner.patch('/api/marketing', { entity: 'post', id: draftPostId, action: 'publish' });
  eq(res.status, 409, 'unapproved publish');
  return '409 approval_required';
});

await check('approve then publish succeeds', async () => {
  const approved = await owner.patch('/api/marketing', { entity: 'post', id: draftPostId, action: 'approve' });
  eq(approved.status, 200, 'approve');
  const published = await owner.patch('/api/marketing', { entity: 'post', id: draftPostId, action: 'publish' });
  eq(published.status, 200, 'publish');
  return 'approved → published';
});

await check('content calendar is generated', async () => {
  const res = await owner.post('/api/marketing', {
    mode: 'calendar',
    objective: 'Grow repeat bookings',
    audience: 'Local customers',
    durationDays: 7,
    channels: ['INSTAGRAM', 'WHATSAPP'],
  });
  eq(res.status, 201, 'calendar');
  assert((res.json.data.plan ?? []).length === 7, 'calendar should cover 7 days');
  return '7-day plan';
});

// ---------------------------------------------------------------------------
// 12. Documents and reports with PDF export
// ---------------------------------------------------------------------------
await check('free-plan document limits are enforced with a clear message', async () => {
  // The tenant is still on FREE (10 documents) and has already indexed knowledge
  // sources, which count towards the same allowance — so generating in a loop
  // must eventually be refused with a 402 plan_limit, never a 500.
  let refusal = null;
  for (let attempt = 0; attempt < 15 && !refusal; attempt += 1) {
    const res = await owner.post('/api/documents', { type: 'SOP', instructions: `Limit probe ${attempt}` });
    if (res.status === 402) refusal = res;
    else eq(res.status, 201, `limit probe ${attempt}`);
  }
  assert(refusal, 'the free plan document cap was never enforced');
  eq(refusal.json?.error?.code, 'plan_limit', 'plan limit error code');
  return 'refused with plan_limit instead of failing';
});

await check('upgrading the plan lifts the document limit', async () => {
  const changed = await owner.post('/api/billing', { planCode: 'BUSINESS', billingCycle: 'MONTHLY' });
  eq(changed.status, 200, 'plan upgrade');
  eq(changed.json.data.plan, 'BUSINESS', 'plan not applied');
  const retry = await owner.post('/api/documents', { type: 'SOP', instructions: 'After upgrade' });
  eq(retry.status, 201, 'document generation after upgrade');
  return 'FREE → BUSINESS, generation unblocked';
});

await check('all document types can be generated', async () => {
  const types = ['INVOICE', 'QUOTE', 'RECEIPT', 'PROPOSAL', 'REPORT', 'MESSAGE', 'MARKETING_PLAN', 'SOP'];
  const generated = [];
  for (const type of types) {
    const res = await owner.post('/api/documents', { type, customerId, instructions: `Smoke-test ${type}`, items: [{ name: 'Smoke Braids Deluxe', quantity: 1, unitPrice: '300' }] });
    eq(res.status, 201, `generate ${type}`);
    generated.push(res.json.data.document.type);
  }
  return `${generated.length} documents`;
});

await check('document exports to a real PDF', async () => {
  const list = await owner.get('/api/documents?limit=5');
  const id = (list.json.data.documents ?? [])[0]?.id;
  assert(id, 'no document to export');
  const res = await owner.get(`/api/documents/${id}/pdf`);
  eq(res.status, 200, 'document PDF');
  assert(res.text.startsWith('%PDF-'), 'response is not a PDF');
  return `${Math.round(res.text.length / 1024)} KB PDF`;
});

await check('a document can be deleted, and only once', async () => {
  // The documents board has a delete action; the route has to export DELETE or
  // the browser gets a 405 and the button appears to do nothing.
  const created = await owner.post('/api/documents', { type: 'SOP', instructions: 'Delete-me document' });
  eq(created.status, 201, 'create document');
  const id = created.json.data.document.id;

  const removed = await owner.del('/api/documents', { id });
  eq(removed.status, 200, 'delete document');
  eq(removed.json.data.deleted, true, 'deleted flag');
  assert(!(removed.json.data.documents ?? []).some((doc) => doc.id === id), 'the document is still listed');

  const again = await owner.del('/api/documents', { id });
  eq(again.status, 404, 'deleting a missing document');
  const anonymous = await anon.del('/api/documents', { id });
  eq(anonymous.status, 401, 'anonymous delete');
  return 'deleted once, 404 on repeat, 401 anonymous';
});

await check('document amount, tax and notes reach the document', async () => {
  // The form collects these three fields; the API dropped them, so a typed
  // invoice amount never appeared on the invoice.
  const res = await owner.post('/api/documents', {
    type: 'INVOICE',
    title: 'Smoke amount invoice',
    amount: '1250.50',
    tax: '187.58',
    notes: 'Smoke note: payment by EFT only.',
    dueDate: '2026-12-01',
  });
  eq(res.status, 201, 'generate invoice with an amount');
  const doc = res.json.data.document;
  eq(doc.total_cents, 143808, 'subtotal + tax');
  assert(doc.content_text.includes('1,250.50'), 'subtotal missing from the document');
  assert(doc.content_text.includes('187.58'), 'tax missing from the document');
  assert(doc.content_text.includes('Smoke note: payment by EFT only.'), 'notes missing from the document');
  return 'amount + tax + notes stored';
});

await check('documents use the workspace currency', async () => {
  const profile = await owner.get('/api/business/profile');
  const currency = (profile.json.data.businesses ?? []).find((b) => b.id === businessId)?.currency;
  assert(currency, 'workspace currency missing');
  const res = await owner.post('/api/documents', { type: 'QUOTE', title: 'Currency check', amount: '500' });
  eq(res.status, 201, 'quote');
  eq(res.json.data.document.currency, currency, 'document currency follows the workspace');
  return `documents are issued in ${currency}`;
});

await check('uploads reject a non-multipart body with a clear message', async () => {
  const res = await owner.post('/api/knowledge/upload', {});
  eq(res.status, 400, 'JSON body to the upload route');
  eq(res.json.error.code, 'bad_request', 'error code');
  return '400 instead of a 500';
});

await check('an exported PDF becomes searchable knowledge', async () => {
  // Round trip: the app writes a PDF, the owner uploads it back as knowledge and
  // the AI has to be able to quote it. Compressed PDF streams used to be indexed
  // as binary noise, which made every uploaded PDF unsearchable.
  const generated = await owner.post('/api/documents', {
    type: 'QUOTE',
    title: 'Corporate wellness quote',
    amount: '9750',
    notes: 'Package code ZEPHYRQUARTZ.',
  });
  eq(generated.status, 201, 'generate the source document');
  const pdf = await owner.getBinary(`/api/documents/${generated.json.data.document.id}/pdf`);
  eq(pdf.status, 200, 'export the PDF');
  assert(pdf.buffer.subarray(0, 5).toString() === '%PDF-', 'not a PDF');

  const form = new FormData();
  form.set('kind', 'CATALOG');
  form.set('files', new File([pdf.buffer], 'round-trip.pdf', { type: 'application/pdf' }));
  const uploaded = await owner.request('POST', '/api/knowledge/upload', { form });
  eq(uploaded.status, 201, 'upload the exported PDF');
  const source = uploaded.json.data.created[0];
  assert(source.chunks > 0, 'the PDF produced no knowledge chunks');

  const inspector = await owner.get(`/api/dev/grounding?q=${encodeURIComponent('ZEPHYRQUARTZ')}`);
  eq(inspector.status, 200, 'grounding inspector');
  const top = inspector.json.data.chunks?.[0]?.content ?? '';
  assert(top.includes('ZEPHYRQUARTZ'), `the PDF text is not retrievable: ${top.slice(0, 80)}`);
  assert(!/stream|endstream|FlateDecode/.test(top), 'binary PDF noise was indexed as knowledge');
  return 'exported PDF re-uploaded and searchable';
});

await check('a DOCX upload becomes searchable knowledge', async () => {
  const docx = buildDocx([
    'SMOKE STUDIO POLICY',
    'Late cancellations are charged 50% of the service price. Code DOCXGLIMMER.',
    'Gift vouchers never expire at this studio.',
  ]);
  const form = new FormData();
  form.set('kind', 'POLICY');
  form.set('files', new File([docx], 'smoke-policy.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  assert(Buffer.isBuffer(docx) && docx.subarray(0, 2).toString() === 'PK', 'the fixture is not a ZIP archive');
  const uploaded = await owner.request('POST', '/api/knowledge/upload', { form });
  eq(uploaded.status, 201, 'upload the DOCX');
  assert(uploaded.json.data.created[0].chunks > 0, 'the DOCX produced no chunks');

  const inspector = await owner.get(`/api/dev/grounding?q=${encodeURIComponent('DOCXGLIMMER')}`);
  const top = inspector.json.data.chunks?.[0]?.content ?? '';
  assert(top.includes('DOCXGLIMMER'), `DOCX text is not retrievable: ${top.slice(0, 80)}`);
  assert(!top.includes('PK') && !top.includes('<w:'), 'ZIP/XML noise was indexed');
  return 'DOCX unzipped and searchable';
});

await check('a PDF with no text is flagged instead of indexed as noise', async () => {
  // An image-only or unreadable PDF must not become hundreds of junk chunks.
  const emptyPdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
  const form = new FormData();
  form.set('kind', 'UPLOAD');
  form.set('files', new File([emptyPdf], 'scan.pdf', { type: 'application/pdf' }));
  const uploaded = await owner.request('POST', '/api/knowledge/upload', { form });
  eq(uploaded.status, 201, 'upload the text-free PDF');
  const source = uploaded.json.data.created[0];
  assert(source.warning, 'the owner was not warned that nothing could be read');

  const before = await owner.get('/api/knowledge');
  const stored = (before.json.data.sources ?? []).find((entry) => entry.id === source.id);
  assert(stored, 'the source was not stored');
  const db = new DatabaseSync(dbFilePath());
  const raw = db.prepare('SELECT raw_text FROM knowledge_sources WHERE id = ?').get(source.id)?.raw_text ?? '';
  db.close();
  assert(!/stream|FlateDecode|endstream/.test(raw), 'binary noise was stored as knowledge');
  assert(/no readable content|not readable|scanned/i.test(raw), `expected an explanatory note, got: ${raw.slice(0, 120)}`);
  return 'owner warned; no binary indexed';
});

await check('daily, weekly and monthly reports are generated and exported', async () => {
  for (const period of ['DAILY', 'WEEKLY', 'MONTHLY']) {
    const res = await owner.post('/api/reports', { period, withAiSummary: true });
    eq(res.status, 201, `generate ${period} report`);
    const reportId = res.json.data.reportId;
    assert(reportId, `${period} report id missing`);
    const pdf = await owner.get(`/api/reports/${reportId}/pdf`);
    eq(pdf.status, 200, `${period} report PDF`);
    assert(pdf.text.startsWith('%PDF-'), `${period} report is not a PDF`);
  }
  return '3 periods + PDFs';
});

await check('reports separate calculated metrics from the AI narrative', async () => {
  const list = await owner.get('/api/reports');
  eq(list.status, 200, 'list reports');
  const report = (list.json.data.reports ?? [])[0];
  assert(report, 'no report found');
  assert(['CALCULATED', 'AI'].includes(report.summary_source), `unexpected summary_source ${report.summary_source}`);
  const metrics = typeof report.metrics === 'string' ? JSON.parse(report.metrics) : report.metrics;
  assert(metrics && typeof metrics.revenueCents === 'number', 'calculated metrics missing');
  return `summary_source=${report.summary_source}`;
});

// ---------------------------------------------------------------------------
// 13. Analytics, dashboard, billing
// ---------------------------------------------------------------------------
await check('analytics returns calculated statistics and labelled recommendations', async () => {
  const res = await owner.get('/api/analytics');
  eq(res.status, 200, 'GET /api/analytics');
  const data = res.json.data;
  const stats = data.stats ?? data.calculatedStats ?? [];
  assert(Array.isArray(stats) && stats.length > 0, 'no calculated statistics');
  assert(Array.isArray(data.recommendations) && data.recommendations.length > 0, 'no recommendations');
  return `${stats.length} stats, ${data.recommendations.length} recommendation(s)`;
});

await check('dashboard summary endpoint responds', async () => {
  const res = await owner.get('/api/dashboard');
  eq(res.status, 200, 'GET /api/dashboard');
});

await check('billing exposes plans, usage and accepts a plan change', async () => {
  const before = await owner.get('/api/billing');
  eq(before.status, 200, 'GET /api/billing');
  assert((before.json.data.plans ?? []).length >= 4, 'plan catalogue missing');

  const downgraded = await owner.post('/api/billing', { planCode: 'STARTER', billingCycle: 'MONTHLY' });
  eq(downgraded.status, 200, 'plan downgrade');
  eq(downgraded.json.data.plan, 'STARTER', 'downgrade not applied');

  const after = await owner.get('/api/billing');
  eq(after.json.data.subscription.plan_code ?? after.json.data.plan_code, 'STARTER', 'downgrade not persisted');

  const upgraded = await owner.post('/api/billing', { planCode: 'BUSINESS', billingCycle: 'YEARLY' });
  eq(upgraded.status, 200, 'plan upgrade');
  eq(upgraded.json.data.plan, 'BUSINESS', 'upgrade not applied');
  return 'BUSINESS → STARTER → BUSINESS';
});

// ---------------------------------------------------------------------------
// 14. Team, roles and invitations
// ---------------------------------------------------------------------------
await check('invited users cannot sign in until they accept', async () => {
  const res = await owner.post('/api/team', { action: 'invite', email: INVITEE_EMAIL, name: 'Smoke Invitee', role: 'MANAGER' });
  eq(res.status, 201, 'invite');
  const token = res.json.data.invitationToken;
  assert(token, 'no invitation token in development');

  const login = await authCall('POST', invitee, '/api/auth/login', { email: INVITEE_EMAIL, password: 'Anything123!' });
  eq(login.status, 401, 'invited account login');
  return 'invited account is inert';
});

await check('invitation acceptance activates the account and signs in', async () => {
  const team = await owner.get('/api/team');
  const invited = (team.json.data.members ?? []).find((member) => member.email === INVITEE_EMAIL);
  assert(invited, 'invited member missing');
  assert(invited.status === 'INVITED', `expected INVITED, got ${invited.status}`);

  const res = await signIn(invitee, INVITEE_EMAIL, INVITEE_PASSWORD);
  assert(res.status >= 400, 'invitee must not sign in before accepting');
});

await check('accept-invite flow works end to end', async () => {
  // Re-invite to obtain a fresh token for the acceptance call.
  const fresh = await owner.post('/api/team', { action: 'invite', email: `smoke-join-${STAMP}@example.test`, name: 'Smoke Joiner', role: 'MANAGER' });
  eq(fresh.status, 201, 'invite joiner');
  const token = fresh.json.data.invitationToken;
  assert(token, 'no invitation token');

  const preview = await anon.get(`/api/auth/accept-invite?token=${token}`);
  eq(preview.status, 200, 'invitation preview');
  assert(preview.json.data.invite.primary.business, 'preview missing the business');

  const weak = await authCall('POST', anon, '/api/auth/accept-invite', { token, password: 'weak' });
  eq(weak.status, 422, 'weak password on accept');

  const accepted = await authCall('POST', invitee, '/api/auth/accept-invite', { token, password: INVITEE_PASSWORD, name: 'Smoke Joiner' });
  eq(accepted.status, 200, 'accept invitation');
  eq(accepted.json.data.next, '/dashboard', 'post-accept destination');

  const session_ = await invitee.get('/api/customers');
  eq(session_.status, 200, 'accepted member can read the tenant');

  const replay = await authCall('POST', anon, '/api/auth/accept-invite', { token, password: INVITEE_PASSWORD });
  eq(replay.status, 400, 'invitation replay');
  return 'preview → weak rejected → accepted → signed in → single use';
});

await check('managers cannot change billing (RBAC)', async () => {
  const res = await invitee.post('/api/billing', { planCode: 'BUSINESS' });
  eq(res.status, 403, 'manager billing change');
  return '403 forbidden';
});

await check('owners can change roles and remove members', async () => {
  const team = await owner.get('/api/team');
  const joiner = (team.json.data.members ?? []).find((member) => member.email === `smoke-join-${STAMP}@example.test`);
  assert(joiner, 'joined member missing');
  const promoted = await owner.patch('/api/team', { userId: joiner.user_id, role: 'STAFF', title: 'Assistant' });
  eq(promoted.status, 200, 'role change');
  const removed = await owner.del('/api/team', { userId: joiner.user_id });
  eq(removed.status, 200, 'member removal');
  return 'role changed + member removed';
});

// ---------------------------------------------------------------------------
// 15. Account settings and password change
// ---------------------------------------------------------------------------
await check('profile can be updated', async () => {
  const res = await owner.patch('/api/account/profile', { name: 'Smoke Owner Renamed', jobTitle: 'Owner', timezone: 'Africa/Windhoek', theme: 'dark' });
  eq(res.status, 200, 'profile update');
  const profile = await owner.get('/api/account/profile');
  eq(profile.status, 200, 'profile read');
  eq(profile.json.data.user.name, 'Smoke Owner Renamed', 'profile name');
});

await check('password change invalidates the old password', async () => {
  const changed = await owner.post('/api/account/password', { currentPassword: OWNER_PASSWORD, newPassword: 'SmokeSecond1!pass' });
  eq(changed.status, 200, 'password change');

  const fresh = new Session('fresh');
  const oldPassword = await signIn(fresh, OWNER_EMAIL, OWNER_PASSWORD);
  eq(oldPassword.status, 401, 'old password after change');

  const newPassword = await signIn(fresh, OWNER_EMAIL, 'SmokeSecond1!pass');
  eq(newPassword.status, 200, 'new password');
  return 'old rejected, new accepted';
});

await check('password reset restores access from a token', async () => {
  const requested = await authCall('POST', anon, '/api/auth/forgot-password', { email: OWNER_EMAIL });
  const token = requested.json?.data?.devUrl?.split('token=')[1];
  assert(token, 'no reset token');
  const reset = await authCall('POST', anon, '/api/auth/reset-password', { token, password: OWNER_PASSWORD });
  eq(reset.status, 200, 'reset password');
  const login = await signIn(owner, OWNER_EMAIL, OWNER_PASSWORD);
  eq(login.status, 200, 'login after reset');
  return 'reset link works and is single-use';
});

// ---------------------------------------------------------------------------
// 16. Tenant isolation
// ---------------------------------------------------------------------------
await check('a second tenant cannot read the first tenant’s records', async () => {
  const signup = await signUp(second, { name: 'Second Owner', email: SECOND_EMAIL, password: OWNER_PASSWORD, acceptTerms: true });
  eq(signup.status, 201, 'second signup');
  const business = await second.post('/api/business/profile', { name: `Smoke Second ${STAMP}`, type: 'retail', currency: 'NAD', onboardingStep: 2 });
  eq(business.status, 201, 'second business');
  const secondBusinessId = (business.json.data.businesses ?? []).find((entry) => entry.name?.startsWith('Smoke Second'))?.id;
  if (secondBusinessId) created.businessIds.push(secondBusinessId);
  const secondUserId = signup.json?.data?.user?.id;
  if (secondUserId) created.userIds.push(secondUserId);

  const crossTenant = await second.get(`/api/customers/${customerId}`);
  eq(crossTenant.status, 404, 'cross-tenant customer read');

  const ownList = await second.get('/api/customers');
  eq(ownList.status, 200, 'own customer list');
  eq((ownList.json.data.rows ?? []).length, 0, 'second tenant should see none of the first tenant records');

  const crossPdf = await second.get(`/api/reports/000000000000000000000000/pdf`);
  assert(crossPdf.status === 404, `cross-tenant report access returned ${crossPdf.status}`);
  return '404 on foreign records, empty own list';
});

await check('a plain user cannot reach the platform admin API', async () => {
  const res = await owner.get('/api/admin/overview');
  eq(res.status, 403, 'admin API for a business owner');
  return '403 forbidden';
});

// ---------------------------------------------------------------------------
// 17. Marketing site endpoints
// ---------------------------------------------------------------------------
await check('admin panel guards anonymous and non-admin visitors', async () => {
  const anonymous = await anon.get('/admin');
  eq(anonymous.status, 307, 'anonymous /admin');
  assert(
    (anonymous.headers.get('location') ?? '').includes('/login?next=/admin'),
    `anonymous /admin should redirect to the sign-in page, got ${anonymous.headers.get('location')}`,
  );

  const nonAdmin = await owner.get('/admin');
  eq(nonAdmin.status, 307, 'a business owner opening /admin');
  assert(
    (nonAdmin.headers.get('location') ?? '').includes('/dashboard'),
    `a business owner should be sent back to the dashboard, got ${nonAdmin.headers.get('location')}`,
  );
  return 'anonymous → login, owner → dashboard';
});

await check('contact form accepts a demo request', async () => {
  const res = await anon.post('/api/contact', {
    name: 'Smoke Prospect',
    email: `prospect-${STAMP}@example.test`,
    phone: '0816666666',
    company: 'Smoke Co',
    topic: 'demo',
    message: 'Automated smoke test demo request that is long enough to pass validation.',
  });
  eq(res.status, 201, 'POST /api/contact');
});

await check('public business lookup hides unknown tenants', async () => {
  const res = await anon.get('/api/public/business?slug=definitely-not-a-business');
  assert(res.status === 404, `expected 404, got ${res.status}`);
});

await check('public marketing pages render', async () => {
  for (const page of ['/', '/privacy', '/terms', '/login', '/signup']) {
    const res = await anon.get(page);
    eq(res.status, 200, `GET ${page}`);
  }

  // The landing page has to carry the promise, the two calls to action and the
  // manager contact block (photo + WhatsApp + email) — those are the conversion
  // paths a visitor uses.
  const landing = (await anon.get('/')).text;
  for (const needle of [
    'Run Your Business Smarter With AI',
    'AI-powered tools that help businesses automate operations',
    'Start Free',
    'Book a Demo',
    'manager.jpg',
  ]) {
    assert(landing.includes(needle), `landing page is missing: ${needle}`);
  }

  // The floating WhatsApp widget and the manager card are on every public page.
  const managerNumber = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '0774075285').replace(/\D/g, '');
  for (const page of ['/', '/privacy', '/terms']) {
    const html = (await anon.get(page)).text;
    assert(html.includes('wa.me'), `${page} has no WhatsApp contact link`);
    assert(html.includes(managerNumber.slice(-7)), `${page} does not link the manager's WhatsApp number`);
  }
  const support = (await anon.get('/support/windhoek-beauty-studio')).text;
  assert(support.includes('manager.jpg'), 'the public tenant support page has no manager photo');
  return '5 pages, hero + CTAs + WhatsApp widget + manager card';
});

await check('dashboard pages render with a session', async () => {
  const pages = {
    '/dashboard': 'Dashboard',
    '/dashboard/assistant': 'Assistant',
    '/dashboard/customers': 'Customers',
    '/dashboard/sales': 'Sales',
    '/dashboard/appointments': 'Appointments',
    '/dashboard/tasks': 'Tasks',
    '/dashboard/orders': 'Orders',
    '/dashboard/inventory': 'Inventory',
    '/dashboard/support': 'Support',
    '/dashboard/knowledge': 'Knowledge',
    '/dashboard/marketing': 'Marketing',
    '/dashboard/documents': 'Documents',
    '/dashboard/reports': 'Reports',
    '/dashboard/analytics': 'Analytics',
    '/dashboard/billing': 'Billing',
    '/dashboard/team': 'Team',
    '/dashboard/settings': 'Settings',
  };
  const entries = Object.entries(pages);
  const first = (await owner.get('/dashboard')).text;
  for (const [page, heading] of entries) {
    const res = await owner.get(page);
    eq(res.status, 200, `GET ${page}`);
    assert(res.text.includes(heading), `${page} does not render its "${heading}" heading`);
  }
  // The sidebar is shared: a signed-in user can reach every workspace from the shell.
  for (const [page] of entries) {
    if (page === '/dashboard') continue;
    assert(first.includes(`href="${page}"`) || first.includes(page), 'the sidebar omits ' + page);
  }
  return `${entries.length} workspaces with sidebar navigation`;
});

await check('logout ends the session', async () => {
  const res = await owner.post('/api/auth/logout', {});
  assert([200, 204].includes(res.status), `logout returned ${res.status}`);
  const after = await owner.get('/api/customers');
  eq(after.status, 401, 'session after logout');
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
function dbFilePath() {
  return process.env.DATABASE_FILE
    ? path.resolve(process.cwd(), process.env.DATABASE_FILE)
    : path.join(process.cwd(), 'data', 'workspace-digital.db');
}

async function cleanup() {
  const file = dbFilePath();
  if (!fs.existsSync(file)) return 'database file not found — skipped';

  const db = new DatabaseSync(file);
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((row) => row.name);
  const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);

  const emails = [OWNER_EMAIL, INVITEE_EMAIL, SECOND_EMAIL, `smoke-join-${STAMP}@example.test`];
  const userIds = emails
    .map((email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id)
    .filter(Boolean);

  // 1. Every business owned by a smoke account (plus the ones we recorded).
  const businessIds = new Set(created.businessIds);
  for (const userId of userIds) {
    for (const row of db.prepare('SELECT id FROM businesses WHERE owner_id = ?').all(userId)) businessIds.add(row.id);
  }

  // 2. Tenant rows first — foreign keys are enforced only when the pragma is on,
  //    so children are removed explicitly before their parents.
  for (const businessId of businessIds) {
    for (const table of tables) {
      if (!columnsOf(table).includes('business_id')) continue;
      try {
        db.prepare(`DELETE FROM ${table} WHERE business_id = ?`).run(businessId);
      } catch {
        /* table is not tenant scoped */
      }
    }
    db.prepare('DELETE FROM businesses WHERE id = ?').run(businessId);
  }

  // 3. Then the accounts, and any row still pointing at them.
  for (const userId of userIds) {
    for (const table of tables) {
      for (const column of ['user_id', 'actor_user_id', 'created_by_id', 'assignee_user_id', 'assigned_to_id', 'owner_user_id', 'invited_by_id', 'generated_by_id', 'approved_by_id', 'connected_by_id']) {
        if (!columnsOf(table).includes(column)) continue;
        try {
          db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(userId);
        } catch {
          /* ignore */
        }
      }
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  db.close();
  return `removed ${userIds.length} test account(s) and ${businessIds.size} test tenant(s)`;
}

let cleanupNote = '';
try {
  cleanupNote = await cleanup();
} catch (error) {
  cleanupNote = `cleanup failed: ${error instanceof Error ? error.message : error}`;
}

// ---------------------------------------------------------------------------
// Abuse protection runs last: this deliberately locks the login endpoint for the
// whole IP (12 attempts / 5 minutes), so nothing may sign in after it.
// ---------------------------------------------------------------------------
await check('rate limiting protects the login endpoint', async () => {
  let limited = null;
  for (let attempt = 0; attempt < 20 && !limited; attempt += 1) {
    const res = await anon.post('/api/auth/login', { email: `nobody-${attempt}@example.test`, password: 'Nope12345!' });
    if (res.status === 429) limited = res;
  }
  assert(limited, 'never received 429');
  eq(limited.json?.error?.code, 'rate_limited', 'rate limit error code');
  // Note for the next run: this leaves the login endpoint throttled for this IP
  // until the window expires; `signIn()` waits it out automatically.

  const withValidCredentials = await anon.post('/api/auth/login', {
    email: 'owner@test.local',
    password: 'Str0ngPassw0rd!',
  });
  eq(withValidCredentials.status, 429, 'the limiter must protect valid credentials too');
  return '429 after repeated failures; valid credentials are blocked too';
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const passed = results.filter((result) => result.pass);
const failed = results.filter((result) => !result.pass);
const width = Math.min(56, Math.max(...results.map((result) => result.name.length)));

console.log('─'.repeat(width + 14));
for (const result of results) {
  console.log(`${result.pass ? ' PASS ' : ' FAIL '} ${result.name.padEnd(width)} ${result.note}`);
}
console.log('─'.repeat(width + 14));
console.log(`${passed.length} passed, ${failed.length} failed  ·  ${cleanupNote}`);

if (failed.length) {
  console.log('\nFailures:');
  for (const result of failed) console.log(`  · ${result.name}\n      ${result.note}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
