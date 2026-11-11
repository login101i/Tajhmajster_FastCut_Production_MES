/**
 * Local stand-in for Netlify Functions when you run `npm run dev`.
 * Start with: node --import tsx scripts/local-api.mjs
 * Loads .env from project root — same MYSQL_* / MONITOR_ACCESS_TOKEN as Netlify.
 *
 * Handlers are loaded lazily (and can be reloaded) so new function files
 * appear without a full process restart.
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

const PORT = Number(process.env.LOCAL_API_PORT || 8787);

/** pathname → netlify function basename (without .ts) */
const ROUTE_MAP = {
  '/api/orders': 'orders',
  '/.netlify/functions/orders': 'orders',
  '/api/order-detail': 'order-detail',
  '/.netlify/functions/order-detail': 'order-detail',
  '/api/sync-group-children-prc': 'sync-group-children-prc',
  '/.netlify/functions/sync-group-children-prc': 'sync-group-children-prc',
  '/api/orders-to-sync-prc': 'orders-to-sync-prc',
  '/.netlify/functions/orders-to-sync-prc': 'orders-to-sync-prc',
  '/api/production-last-change': 'production-last-change',
  '/.netlify/functions/production-last-change': 'production-last-change',
  '/api/undo-checklist-scan': 'undo-checklist-scan',
  '/.netlify/functions/undo-checklist-scan': 'undo-checklist-scan',
};

const handlerCache = new Map();

async function loadHandler(name) {
  const file = path.join(root, 'netlify', 'functions', `${name}.ts`);
  if (!fs.existsSync(file)) {
    throw new Error(`Function file missing: netlify/functions/${name}.ts`);
  }
  const mtime = fs.statSync(file).mtimeMs;
  const cached = handlerCache.get(name);
  if (cached && cached.mtime === mtime) return cached.handler;

  // cache-bust ESM import so edits reload
  const href = `${pathToFileURL(file).href}?t=${mtime}`;
  const mod = await import(href);
  if (typeof mod.handler !== 'function') {
    throw new Error(`No export handler in ${name}.ts`);
  }
  handlerCache.set(name, { mtime, handler: mod.handler });
  return mod.handler;
}

function toNetlifyEvent(req, url, body) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(',');
  }
  const qs = {};
  url.searchParams.forEach((value, key) => {
    qs[key] = value;
  });
  return {
    httpMethod: req.method || 'GET',
    headers,
    queryStringParameters: Object.keys(qs).length ? qs : null,
    body: body || null,
    path: url.pathname,
    rawUrl: url.toString(),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const fnName = ROUTE_MAP[url.pathname];

  console.log(`[local-api] ${req.method} ${url.pathname}${url.search}`);

  if (!fnName) {
    const routes = [...new Set(Object.keys(ROUTE_MAP))].sort();
    console.warn(`[local-api] 404 No route ${url.pathname}. Known:`, routes.join(', '));
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: `No route ${url.pathname}`,
        knownRoutes: routes,
      }),
    );
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8') || null;

  try {
    const handler = await loadHandler(fnName);
    const result = await handler(toNetlifyEvent(req, url, body), {});
    const status = result.statusCode || 200;
    if (status >= 400) {
      console.warn(`[local-api] ${fnName} → ${status}`, result.body?.slice?.(0, 300));
    } else {
      console.log(`[local-api] ${fnName} → ${status}`);
    }
    res.writeHead(status, result.headers || {});
    res.end(result.body ?? '');
  } catch (err) {
    console.error(`[local-api] ${fnName} error:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'error',
      }),
    );
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const host = process.env.MYSQL_HOST;
  const routes = [...new Set(Object.values(ROUTE_MAP))].sort();
  console.log(
    `[local-api] http://127.0.0.1:${PORT}` +
      (host
        ? ` → MySQL ${host}`
        : '  ⚠ brak .env — skopiuj .env.example → .env i uzupełnij MYSQL_*'),
  );
  console.log(`[local-api] functions: ${routes.join(', ')}`);
});
