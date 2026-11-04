/**
 * Local stand-in for Netlify Functions when you run `npm run dev`.
 * Start with: node --import tsx scripts/local-api.mjs
 * Loads .env from project root — same MYSQL_* / MONITOR_ACCESS_TOKEN as Netlify.
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

async function loadHandler(name) {
  const file = path.join(root, 'netlify', 'functions', `${name}.ts`);
  const mod = await import(pathToFileURL(file).href);
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

const orders = await loadHandler('orders');
const orderDetail = await loadHandler('order-detail');
const syncGroupChildren = await loadHandler('sync-group-children-prc');

const routes = {
  '/api/orders': orders,
  '/.netlify/functions/orders': orders,
  '/api/order-detail': orderDetail,
  '/.netlify/functions/order-detail': orderDetail,
  '/api/sync-group-children-prc': syncGroupChildren,
  '/.netlify/functions/sync-group-children-prc': syncGroupChildren,
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const handler = routes[url.pathname];

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: `No route ${url.pathname}` }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8') || null;

  try {
    const result = await handler(toNetlifyEvent(req, url, body), {});
    res.writeHead(result.statusCode || 200, result.headers || {});
    res.end(result.body ?? '');
  } catch (err) {
    console.error(err);
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
  console.log(
    `[local-api] http://127.0.0.1:${PORT}` +
      (host
        ? ` → MySQL ${host}`
        : '  ⚠ brak .env — skopiuj .env.example → .env i uzupełnij MYSQL_*'),
  );
});
