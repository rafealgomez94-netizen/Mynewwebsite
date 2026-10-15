#!/usr/bin/env node
/**
 * Static contract audit for the client -> API seam, using the TypeScript AST
 * (regex parsing of JSX call sites is too fragile to trust).
 *
 * The HTTP smoke suite proves every route works when called correctly. This
 * script checks the other half — what the browser components actually send:
 *
 *   1. method  — does the target route export the HTTP verb the component uses?
 *                A DELETE to a route that only exports GET/POST/PATCH is a 405,
 *                and the user just sees a button that does nothing.
 *   2. path    — does a route file exist for the URL the component builds?
 *   3. body    — are the keys the component sends accepted by the route?
 *
 * Run: node scripts/audit-client-contracts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const COMPONENTS = path.join(ROOT, 'src', 'components');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * URL pattern for a call target: literals stay literal, `${...}` becomes a
 * single path segment wildcard, so `/api/customers/${id}/messages` can be matched
 * against the real route tree instead of being truncated to /api/customers.
 */
function pathPattern(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) out += '[^/]+' + span.literal.text;
    return out;
  }
  if (ts.isParenthesizedExpression(node)) return pathPattern(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = pathPattern(node.left);
    return left === null ? null : left + '[^/]*';
  }
  return null;
}

/** Property names of an object literal, one level deep. */
function propertyNames(node) {
  const names = new Set();
  if (!node || !ts.isObjectLiteralExpression(node)) return names;
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      const name = prop.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) names.add(name.text);
    }
  }
  return names;
}

function property(node, name) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
      if (prop.name.text === name) return prop.initializer;
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === name) return prop;
  }
  return null;
}

/**
 * Names referenced by a body expression — `businessForm`, or the pieces of
 * `{ ...base, name }`. Used to trace a body variable back to the object literal
 * that declares it, so form payloads are checked too, not just inline literals.
 */
function identifiersIn(node) {
  const names = new Set();
  if (!node) return names;
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const parent = n.parent;
      // skip property names and member accesses: only value references matter
      if (parent && ts.isPropertyAssignment(parent) && parent.name === n) return;
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) return;
      names.add(n.text);
      return;
    }
    if (ts.isSpreadAssignment(n)) names.add('__spread__');
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

/**
 * Finds the object literal a state variable is initialised with:
 *   const [form, setForm] = useState({ ... })
 *   const payload = { ... }
 * Returns null when the initialiser spreads or is not a literal (then the keys
 * genuinely cannot be known statically).
 */
function declarationObject(name, source) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      const init = node.initializer;
      if (ts.isObjectLiteralExpression(init)) {
        found = init;
        return;
      }
      if (ts.isCallExpression(init) && init.arguments.length) {
        const first = init.arguments[0];
        if (ts.isObjectLiteralExpression(first) && propertiesOf(first).size) {
          found = first;
          return;
        }
      }
    }
    // destructuring: const [x, setX] = useState({...})
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer) {
      const boundNames = node.name.elements.filter(ts.isBindingElement).map((el) => (ts.isIdentifier(el.name) ? el.name.text : ''));
      if (boundNames.includes(name)) {
        const init = node.initializer;
        if (ts.isCallExpression(init) && init.arguments.length) {
          const first = init.arguments[0];
          if (ts.isObjectLiteralExpression(first)) found = first;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function propertiesOf(obj) {
  const keys = new Set();
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      const name = prop.name;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.add(name.text);
    }
    if (ts.isSpreadAssignment(prop)) keys.add('__spread__');
  }
  return keys;
}

const calls = [];
const parsed = new Map();
for (const file of walk(COMPONENTS)) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  parsed.set(file, source);
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (name === 'apiRequest' || name === 'fetch') {
        const url = pathPattern(node.arguments[0]);
        const typeArg = node.typeArguments?.[0];
        const expectedKeys =
          typeArg && ts.isTypeLiteralNode(typeArg)
            ? typeArg.members.filter(ts.isPropertySignature).map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : '')).filter(Boolean)
            : [];
        if (url && url.startsWith('/api/')) {
          const options = node.arguments[1];
          const methodNode = options ? property(options, 'method') : null;
          // apiRequest defaults to POST (see components/ui/index.tsx); raw fetch
          // defaults to GET. Getting this wrong produces phantom findings.
          const fallback = name === 'apiRequest' ? 'POST' : 'GET';
          const method = methodNode && ts.isStringLiteral(methodNode) ? methodNode.text : fallback;
          const bodyNode = options ? property(options, 'body') : null;
          calls.push({
            file: path.relative(ROOT, file),
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            url,
            method,
            bodyKeys: bodyNode ? [...propertyNames(bodyNode)] : [],
            bodyIsLiteral: Boolean(bodyNode && ts.isObjectLiteralExpression(bodyNode)),
            bodyIdentifiers: identifiersIn(bodyNode),
            hasFormData: Boolean(options && property(options, 'formData')),
            expectedKeys,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const API_ROOT = path.join(ROOT, 'src', 'app', 'api');

function allRouteFiles(dir = API_ROOT) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return allRouteFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

const ROUTE_TABLE = allRouteFiles().map((file) => {
  const relative = path.relative(API_ROOT, file).replace(/\/route\.ts$/, '').split(path.sep);
  // A concrete example of this route, so a source pattern (which uses [^/]+ for
  // template holes) can be tested against it with a plain regex.
  const sample = '/api/' + relative.map((seg) => (seg.startsWith('[') ? 'SAMPLE' : seg)).join('/');
  return { file, sample };
});

function routeInfoFor(url) {
  const clean = url.split('?')[0].replace(/\/$/, '');
  let pattern;
  try {
    pattern = new RegExp(`^${clean}$`);
  } catch {
    return [];
  }
  return ROUTE_TABLE.filter((entry) => pattern.test(entry.sample)).map((entry) => {
    const source = fs.readFileSync(entry.file, 'utf8');
    const methods = new Set(
      [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)/g)].map((m) => m[1]),
    );
    return { file: entry.file, methods, source };
  });
}

/**
 * Every top-level key the route can return, unioned across all branches:
 *   return ok({ a: 1 })  /  return ok({ b: 2 })
 * A key that appears in any branch counts — which branch runs depends on the
 * request, so a field like `devUrl` is legitimately absent for a verified user.
 * Routes that return a spread (`ok({ ...result })`) are marked unknown.
 */
function returnedKeys(file) {
  const keys = new Set();
  let unknown = false;
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['ok', 'fail'].includes(node.expression.text)) {
      const arg = node.arguments[0];
      if (!arg) return;
      if (ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (ts.isSpreadAssignment(prop)) unknown = true;
          else if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
            const name = prop.name;
            if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.add(name.text);
          }
        }
      } else if (ts.isIdentifier(arg)) {
        // ok(result) — the shape lives in the value; treat as unknown
        unknown = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return { keys, unknown };
}

function acceptedKeys(route) {
  const keys = new Set();
  for (const m of route.source.matchAll(/z\.object\(\{([\s\S]*?)\}\)/g)) {
    for (const k of m[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) keys.add(k[1]);
  }
  const validation = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'validation.ts'), 'utf8');
  for (const m of route.source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@\/lib\/validation'/g)) {
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const decl = new RegExp(`export const ${name} = z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\)`).exec(validation);
      if (decl) for (const k of decl[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) keys.add(k[1]);
    }
  }
  for (const m of route.source.matchAll(/\b(?:body|input|payload)\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) keys.add(m[1]);
  for (const m of route.source.matchAll(/\b(?:body|input|payload)\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\]/g)) keys.add(m[1]);
  return keys;
}

const problems = [];
const unverifiable = [];
let audited = 0;

for (const call of calls) {
  const where = `${call.file}:${call.line}`;
  const routes = routeInfoFor(call.url);
  if (!routes.length) {
    problems.push({ where, text: `${call.method} ${call.url}`, issue: 'no route file resolves to this path' });
    continue;
  }
  audited += 1;
  const allMethods = new Set(routes.flatMap((r) => [...r.methods]));
  if (allMethods.size && !allMethods.has(call.method)) {
    problems.push({
      where,
      text: `${call.method} ${call.url}`,
      issue: `route exports only ${[...allMethods].join('/')} — the browser gets 405 Method Not Allowed`,
    });
    continue;
  }
  if (['GET', 'HEAD'].includes(call.method) && !call.bodyKeys.length) continue;
  if (call.hasFormData) continue;

  let bodyKeys = call.bodyKeys;
  let resolvedFrom = null;
  if (!call.bodyIsLiteral || !bodyKeys.length) {
    // trace the variable back to the object literal it is declared with
    const source = parsed.get(path.join(ROOT, call.file));
    for (const name of call.bodyIdentifiers) {
      if (name === '__spread__') continue;
      const object = source ? declarationObject(name, source) : null;
      if (!object) continue;
      const keys = [...propertiesOf(object)];
      if (keys.includes('__spread__')) continue;
      bodyKeys = [...new Set([...bodyKeys, ...keys])];
      resolvedFrom = `${name} = { ... } at the useState/const declaration`;
      break;
    }
  }
  if (!bodyKeys.length || !resolvedFrom && (!call.bodyIsLiteral || !call.bodyKeys.length)) {
    unverifiable.push({
      where,
      text: `${call.method} ${call.url}`,
      issue: call.bodyIdentifiers.size ? `body variable ${[...call.bodyIdentifiers].join(', ')} could not be traced` : 'no object body',
    });
    continue;
  }
  const accepted = new Set();
  for (const route of routes) for (const key of acceptedKeys(route)) accepted.add(key);
  const unknown = bodyKeys.filter((key) => !accepted.has(key));
  if (unknown.length) {
    problems.push({
      where,
      text: `${call.method} ${call.url}`,
      issue: `sends ${unknown.map((k) => `"${k}"`).join(', ')} — not accepted by ${routes.map((r) => path.relative(ROOT, r.file)).join(', ')}${resolvedFrom ? ` (from ${resolvedFrom})` : ''}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Response shape (static): does the route return the field names the component
// reads? Routes whose shape comes from a spread/value can't be judged here and
// are checked by --live instead.
// ---------------------------------------------------------------------------
const shapeProblems = [];
for (const call of calls) {
  if (call.url.includes('[^/]+')) continue;
  const routes = routeInfoFor(call.url);
  if (!routes.length) continue;
  let unknown = false;
  const available = new Set();
  for (const route of routes) {
    const info = returnedKeys(route.file);
    if (info.unknown) unknown = true;
    for (const key of info.keys) available.add(key);
  }
  if (unknown || !available.size) continue;
  const expects = call.expectedKeys.filter((key) => !available.has(key));
  if (expects.length) {
    shapeProblems.push({
      where: `${call.file}:${call.line}`,
      text: `${call.method} ${call.url}`,
      issue: `reads data.${expects.join(' / data.')} — the route only ever returns ${[...available].join(', ')}`,
    });
  }
}

console.log(`audited ${audited} client API call(s) with a resolvable route\n`);
if (!problems.length) console.log('no method / path / body mismatches found\n');
for (const p of problems) console.log(`· ${p.where}\n  ${p.text}\n  ${p.issue}\n`);
if (unverifiable.length) {
  console.log(`--- not verifiable statically (${unverifiable.length}) ---`);
  for (const u of unverifiable) console.log(`  ${u.where}  ${u.text}`);
}
// ---------------------------------------------------------------------------
// --live: call the running app and assert the components' expected fields are
// actually present in the response. Static analysis cannot see through
// `ok({ ...repositoryResult })`, so the field names the UI reads are verified
// against real responses. URLs containing an id are skipped (they need a real
// record) and reported as such.
// ---------------------------------------------------------------------------
if (process.argv.includes('--live')) {
  const BASE = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
  const cookies = new Map();
  const call = async (method, path, body) => {
    const headers = {};
    if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const c of response.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: response.status, json };
  };

  const email = process.env.SMOKE_OWNER_EMAIL ?? 'owner@test.local';
  const password = process.env.SMOKE_OWNER_PASSWORD ?? 'Str0ngPassw0rd!';
  const login = await call('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) {
    console.log(`\n--live: could not sign in (${login.status}) — is the dev server running?`);
    process.exit(1);
  }

  const expectations = new Map();
  for (const c of calls) {
    if (!c.expectedKeys.length) continue;
    if (c.url.includes('[^/]+')) continue;
    const key = `${c.method} ${c.url}`;
    expectations.set(key, {
      keys: new Set([...(expectations.get(key)?.keys ?? []), ...c.expectedKeys]),
      where: c.file,
      rawUrl: c.url,
    });
  }

  console.log(`--live: verifying ${expectations.size} response shape(s) against ${BASE}\n`);
  const missingFields = [];
  for (const [key, entry] of expectations) {
    const [method, path] = key.split(' ');
    const response = await call(method, path, method === 'GET' ? undefined : {});
    if (response.status >= 400) {
      console.log(`  ${String(response.status).padEnd(4)} ${key} (skipped — needs a body/record)`);
      continue;
    }
    const data = response.json?.data ?? {};
    const absent = [...entry.keys].filter((k) => !(k in data));
    // A field the route declares but this branch omits (e.g. `devUrl` for an
    // already-verified account) is a note, not a defect.
    const declared = new Set();
    for (const route of routeInfoFor(entry.rawUrl ?? path)) {
      for (const k of returnedKeys(route.file).keys) declared.add(k);
    }
    const real = absent.filter((k) => !declared.has(k));
    const branch = absent.filter((k) => declared.has(k));
    console.log(
      `  ${String(response.status).padEnd(4)} ${key}${real.length ? `  MISSING ${real.join(', ')}` : '  ok'}${
        branch.length ? `  (other branch: ${branch.join(', ')})` : ''
      }`,
    );
    if (real.length) missingFields.push({ where: entry.where, key, absent: real });
  }
  if (missingFields.length) {
    console.log('\nClient expectations not satisfied by the live API:');
    for (const m of missingFields) console.log(`  · ${m.where} — ${m.key} is missing ${m.absent.join(', ')}`);
  }
  process.exit(problems.length || missingFields.length ? 1 : 0);
}

process.exit(problems.length ? 1 : 0);
