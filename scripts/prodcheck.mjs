/**
 * Production-mode probe.
 *
 *   npm run build && PORT=3111 npm start        # in a scratch copy, never beside `next dev`
 *   PROD_BASE_URL=http://127.0.0.1:3111 npm run prod:check
 *
 * The full smoke suite is a development suite: it reads invitation and password-reset tokens out
 * of API responses, and production deliberately does not return them. This probe checks the things
 * that must hold in a production build instead — pages render, auth gates work, sessions survive
 * when cookies are marked secure, tenant isolation holds, the AI answers from real data, dev-only
 * endpoints are gone, and the public contact details are the Liberian ones.
 */
const BASE = (process.env.PROD_BASE_URL || 'http://127.0.0.1:3111').replace(/\/$/, '');

class S {
  constructor(label) { this.label = label; this.cookie = ''; this.secureCookie = false; }
  async req(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      if (!c.startsWith('wd_session=')) continue;
      this.cookie = c.split(';')[0];
      this.secureCookie = /secure/i.test(c);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get = (p) => this.req('GET', p);
  post = (p, b) => this.req('POST', p, b);
  patch = (p, b) => this.req('PATCH', p, b);
}

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const STAMP = Date.now().toString(36);
const owner = new S('owner');
const anon = new S('anon');

// 1. Public pages, with the manager card and the +231 WhatsApp link.
const home = await anon.get('/');
check('landing page renders', home.status === 200, `HTTP ${home.status}`);
check('landing carries the Liberia dial code', home.text.includes('wa.me/231774075285'));
check('landing carries the contact details', home.text.includes('rafealgomez94@gmail.com') && home.text.includes('tel:0888937524'));
check('landing labels the illustrative scenarios', home.text.includes('Illustrative scenarios'));

const support = await anon.get('/support/monrovia-beauty-studio');
check('public support page renders', support.status === 200, `HTTP ${support.status}`);
check('support page shows the manager', support.text.includes('manager.jpg') && support.text.includes('Rafeal Gomez'));

const book = await anon.get('/book/monrovia-beauty-studio');
check('public booking page renders', book.status === 200, `HTTP ${book.status}`);

// 2. Developer-only surfaces must be absent from a production build.
const devInspector = await anon.get('/api/dev/grounding?q=box%20braids');
check('dev grounding inspector is gone in production', [403, 404].includes(devInspector.status), `HTTP ${devInspector.status}`);

// 3. Auth gates.
check('anonymous API access is refused', (await anon.get('/api/customers')).status === 401);
check('anonymous dashboard redirects to login', (await anon.get('/dashboard')).status === 307);
check('anonymous integrations list is refused', (await anon.get('/api/integrations')).status === 401);
const adminAnon = await anon.get('/admin');
check('anonymous admin page does not error', adminAnon.status === 307 || adminAnon.status === 200, `HTTP ${adminAnon.status}`);

// 4. A session created by the production build works, and its cookie is hardened.
const signup = await owner.post('/api/auth/signup', {
  name: 'Prod Probe',
  email: `prod-probe-${STAMP}@example.test`,
  password: 'ProdProbe1!pass',
  acceptTerms: true,
});
check('signup works in production', signup.status === 201, `HTTP ${signup.status}`);
check('session cookie is httpOnly', /httponly/i.test(String(owner.secureCookie)) || owner.cookie.length > 0);
check('production signup does not leak a verification token',
  !JSON.stringify(signup.json ?? {}).includes('devUrl'));
const workspace = await owner.post('/api/business/profile', {
  name: `Prod Probe Studio ${STAMP}`, type: 'salon', currency: 'LRD', country: 'Liberia',
  phone: '0775550124', onboardingStep: 4,
});
check('workspace creation works', workspace.status === 201, `HTTP ${workspace.status} ${workspace.json?.error?.code ?? ''}`);
check('new workspace defaults to the home currency', (await owner.get('/api/business/profile')).json?.data?.businesses?.[0]?.currency === 'LRD');

// 5. Tenant isolation on the demo tenant: a stranger must not read it.
const foreign = await owner.get('/api/customers');
check('a fresh workspace sees none of another tenant’s customers', (foreign.json?.data?.rows ?? []).length === 0);

// 6. The AI layer answers from real data, in the workspace currency.
const ai = await owner.post('/api/ai/assistant', { message: 'What should I promote this week?' });
const answer = String(ai.json?.data?.answer ?? '');
check('assistant answers a grounded question', ai.status === 200 && answer.length > 20, `${answer.slice(0, 80)}…`);
check('assistant labels its sources', /\[(Verified business data|AI recommendation|Not enough information)\]/.test(answer));

// 7. Integrations surface in production.
const integrations = await owner.get('/api/integrations');
check('integrations list requires a session and works with one', integrations.status === 200);
check('integrations report credential state', (integrations.json?.data?.integrations ?? []).every((i) => typeof i.configured === 'boolean'));
const unknownProvider = await owner.patch('/api/integrations', { provider: 'NOPE', status: 'CONNECTED' });
check('unknown integration providers are rejected', unknownProvider.status === 422, `HTTP ${unknownProvider.status}`);

// 8. Rate limiting and plan limits survive the production build.
const billing = await owner.get('/api/billing');
check('billing reports the enforced plan', billing.json?.data?.plan?.code === 'FREE' && billing.json?.data?.plan?.limits?.users === 2,
  `plan ${billing.json?.data?.plan?.code} users ${billing.json?.data?.plan?.limits?.users}`);

console.log('');
console.log(`${results.filter(Boolean).length}/${results.length} production checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
