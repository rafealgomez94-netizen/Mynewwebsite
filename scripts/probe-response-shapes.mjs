/**
 * Live response-shape probe: calls the endpoints the client components read from
 * and prints the top-level keys of `data`, so the UI's expectations can be
 * checked against what the server actually returns.
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const cookies = new Map();

async function req(method, path, body, form, isolate = false) {
  const jar = isolate ? new Map() : cookies;
  const headers = {};
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, redirect: 'manual' });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0 && !isolate) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

const line = (label, res) => {
  const keys = res.status === 200 || res.status === 201 ? Object.keys(res.json?.data ?? {}) : [];
  console.log(`${String(res.status).padEnd(4)} ${label.padEnd(44)} data keys: ${keys.join(', ') || '—'}`);
};

const login = await req('POST', '/api/auth/login', { email: 'owner@test.local', password: 'Str0ngPassw0rd!' });
line('POST /api/auth/login', login);

const signup = await req(
  'POST',
  '/api/auth/signup',
  {
    name: 'Shape Probe',
    email: `shape-probe-${Date.now()}@example.test`,
    password: 'Str0ngPassw0rd!',
    acceptTerms: true,
  },
  undefined,
  true,
);
line('POST /api/auth/signup', signup);

line('GET /api/leads', await req('GET', '/api/leads'));
line('GET /api/conversations', await req('GET', '/api/conversations'));
line('GET /api/customers', await req('GET', '/api/customers'));
line('GET /api/tasks', await req('GET', '/api/tasks'));
line('GET /api/documents', await req('GET', '/api/documents'));
line('GET /api/marketing', await req('GET', '/api/marketing'));
line('GET /api/knowledge', await req('GET', '/api/knowledge'));
line('GET /api/notifications', await req('GET', '/api/notifications'));
line('GET /api/appointments', await req('GET', '/api/appointments?limit=5'));
line('GET /api/orders', await req('GET', '/api/orders'));
line('GET /api/team', await req('GET', '/api/team'));
line('GET /api/reports', await req('GET', '/api/reports'));
line('GET /api/billing', await req('GET', '/api/billing'));
line('GET /api/products', await req('GET', '/api/products'));
line('GET /api/services', await req('GET', '/api/services'));

const conv = await req('GET', '/api/conversations');
const conversationId = conv.json?.data?.conversations?.[0]?.id;
if (conversationId) {
  line('GET /api/conversations/:id/messages', await req('GET', `/api/conversations/${conversationId}/messages`));
  line('POST /api/conversations/:id/messages (ai_draft)', await req('POST', `/api/conversations/${conversationId}/messages`, { mode: 'ai_draft', question: 'How much are box braids?' }));
}

const form = new FormData();
form.set('kind', 'POLICY');
form.set('files', new File(['SHAPE PROBE\n\nProbe policy line that is long enough to index properly.'], 'probe.txt', { type: 'text/plain' }));
line('POST /api/knowledge/upload', await req('POST', '/api/knowledge/upload', undefined, form));

line('POST /api/marketing (posts)', await req('POST', '/api/marketing', { mode: 'posts', channel: 'INSTAGRAM', goal: 'probe', variants: 1 }));
line('POST /api/support/public', await req('POST', '/api/support/public', { businessSlug: 'windhoek-beauty-studio', message: 'How much are box braids?' }));
line('POST /api/ai/assistant', await req('POST', '/api/ai/assistant', { message: 'Which products are low in stock?' }));
line('GET /api/dashboard', await req('GET', '/api/dashboard'));
line('GET /api/analytics', await req('GET', '/api/analytics'));
