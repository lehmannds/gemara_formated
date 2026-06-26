/**
 * Local development server for the Gemara editor.
 *
 * - Serves static files (html, js, css) from the repo root
 * - REST API for reading/writing .gmr markup files from texts/
 *
 * Run:  node server.js
 * Default port: 3000 (override with PORT env var)
 */

import { createServer } from 'node:http';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEXTS_DIR = join(__dirname, 'texts');
const PORT = parseInt(process.env.PORT || '3002', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gmr': 'text/plain; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
};

async function ensureTextsDir() {
  try {
    await mkdir(TEXTS_DIR, { recursive: true });
  } catch { /* already exists */ }
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function send404(res) {
  res.writeHead(404);
  res.end('Not Found');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * Recursively list all files under dir, returning paths relative to base.
 * Each entry has its extension stripped.
 */
async function listTextsRecursive(dir, base) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listTextsRecursive(full, base));
    } else {
      const rel = relative(base, full).replace(/\\/g, '/');
      results.push(rel.replace(/\.[^.]+$/, ''));
    }
  }
  return results;
}

function fuzzyMatchPath(query, path) {
  if (!query || !query.trim()) return 1;
  const segments = path.toLowerCase().split(/[\/\\.]+/).filter(Boolean);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    for (const seg of segments) {
      if (seg === t) { best = 10; break; }
      if (seg.startsWith(t)) best = Math.max(best, 5);
      else if (seg.includes(t)) best = Math.max(best, 1);
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/**
 * Resolve a text id (e.g. "hulin/2.1") to a real file path.
 * Tries .gmr first, then .txt. Returns null if not found.
 */
async function resolveTextFile(id) {
  for (const ext of ['.gmr', '.txt']) {
    const filePath = join(TEXTS_DIR, `${id}${ext}`);
    try {
      await readFile(filePath, 'utf-8');
      return { filePath, ext };
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Parse the simple perakim.yaml structure into a JS object.
 * Handles only the known flat list-of-maps format.
 */
function parsePerakimYaml(text) {
  const result = { perakim: [], last_page: null };
  let current = null;

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) continue;

    const lastPageMatch = line.match(/^last_page:\s*(.+)$/);
    if (lastPageMatch) {
      result.last_page = lastPageMatch[1].trim();
      continue;
    }

    if (line.match(/^\s*- perek:/)) {
      current = {};
      result.perakim.push(current);
      const val = line.match(/- perek:\s*(.+)/);
      if (val) current.perek = parseInt(val[1], 10);
      continue;
    }

    if (current) {
      const kv = line.match(/^\s+(\w+):\s*(.+)$/);
      if (kv) {
        const key = kv[1];
        let val = kv[2].trim();
        if (key === 'perek' || key === 'offset') val = parseInt(val, 10);
        current[key] = val;
      }
    }
  }
  return result;
}

/**
 * Parse labels.yaml into a JS object.
 * Handles the known structure: list of label objects with nested args.
 */
function parseLabelsYaml(text) {
  const labels = [];
  let current = null;
  let currentArg = null;

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) continue;

    // Top-level label: "  - name: ..." (2-space indent)
    if (line.match(/^ {2}- name:\s/)) {
      currentArg = null;
      current = { args: [] };
      labels.push(current);
      const val = line.match(/- name:\s*(.+)/);
      if (val) current.name = val[1].trim();
      continue;
    }

    // Label property: "    key: value" (4-space indent, not deeper)
    if (current && line.match(/^ {4}\w/) && !line.match(/^ {6,}/)) {
      currentArg = null;
      const kv = line.match(/^\s+(\w+):\s*(.+)$/);
      if (kv) {
        const key = kv[1];
        let val = kv[2].trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (val === '[]') { current[key] = []; continue; }
        current[key] = val;
      }
      continue;
    }

    // Arg entry: "      - name: ..." (6-space indent)
    if (current && line.match(/^ {6}- name:\s/)) {
      currentArg = {};
      current.args.push(currentArg);
      const val = line.match(/- name:\s*(.+)/);
      if (val) currentArg.name = val[1].trim();
      continue;
    }

    // Arg property: "        key: value" (8-space indent)
    if (currentArg && line.match(/^ {8}\w/)) {
      const kv = line.match(/^\s+(\w+):\s*(.+)$/);
      if (kv) {
        const key = kv[1];
        let val = kv[2].trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
        currentArg[key] = val;
      }
    }
  }
  return { labels };
}

async function handleAPI(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // GET /api/labels - return label definitions from labels.yaml
  if (req.method === 'GET' && path === '/api/labels') {
    const labelsPath = join(__dirname, 'labels.yaml');
    try {
      const raw = await readFile(labelsPath, 'utf-8');
      const data = parseLabelsYaml(raw);
      sendJSON(res, 200, data);
    } catch {
      sendJSON(res, 404, { error: 'labels.yaml not found' });
    }
    return true;
  }

  // GET /api/masechtot - list available masechtot (dirs under texts/ with perakim.yaml)
  if (req.method === 'GET' && path === '/api/masechtot') {
    await ensureTextsDir();
    const entries = await readdir(TEXTS_DIR, { withFileTypes: true });
    const masechtot = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await readFile(join(TEXTS_DIR, entry.name, 'perakim.yaml'), 'utf-8');
        masechtot.push(entry.name);
      } catch { /* no perakim.yaml, skip */ }
    }
    sendJSON(res, 200, { masechtot });
    return true;
  }

  // GET /api/perakim/:masechet - list perakim for a masechet
  const perakimMatch = path.match(/^\/api\/perakim\/(.+)$/);
  if (req.method === 'GET' && perakimMatch) {
    const masechet = decodeURIComponent(perakimMatch[1]);
    if (masechet.includes('..')) {
      sendJSON(res, 400, { error: 'Invalid path' });
      return true;
    }
    const yamlPath = join(TEXTS_DIR, masechet, 'perakim.yaml');
    try {
      const raw = await readFile(yamlPath, 'utf-8');
      const data = parsePerakimYaml(raw);
      sendJSON(res, 200, { masechet, perakim: data.perakim, last_page: data.last_page });
    } catch {
      sendJSON(res, 404, { error: `No perakim.yaml for "${masechet}"` });
    }
    return true;
  }

  // GET /api/texts/search?q=... - search text files
  if (req.method === 'GET' && path === '/api/texts/search') {
    await ensureTextsDir();
    const q = url.searchParams.get('q') || '';
    const all = await listTextsRecursive(TEXTS_DIR, TEXTS_DIR);
    const scored = all
      .map((p) => ({ path: p, score: fuzzyMatchPath(q, p) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const results = scored.map((x) => x.path);
    sendJSON(res, 200, { results });
    return true;
  }

  // GET /api/texts - list available .gmr files
  if (req.method === 'GET' && path === '/api/texts') {
    await ensureTextsDir();
    const files = await readdir(TEXTS_DIR);
    const gmrFiles = files
      .filter((f) => f.endsWith('.gmr'))
      .map((f) => f.replace('.gmr', ''));
    sendJSON(res, 200, { texts: gmrFiles });
    return true;
  }

  // GET /api/text/:id - read a text file (supports nested paths like hulin/2.1)
  const getMatch = path.match(/^\/api\/text\/(.+)$/);
  if (req.method === 'GET' && getMatch) {
    const id = decodeURIComponent(getMatch[1]);
    if (id.includes('..')) {
      sendJSON(res, 400, { error: 'Invalid path' });
      return true;
    }
    const found = await resolveTextFile(id);
    if (found) {
      const content = await readFile(found.filePath, 'utf-8');
      sendJSON(res, 200, { id, content });
    } else {
      sendJSON(res, 404, { error: `Text "${id}" not found` });
    }
    return true;
  }

  // PUT /api/text/:id - write a text file
  const putMatch = path.match(/^\/api\/text\/(.+)$/);
  if (req.method === 'PUT' && putMatch) {
    const id = decodeURIComponent(putMatch[1]);
    if (id.includes('..')) {
      sendJSON(res, 400, { error: 'Invalid path' });
      return true;
    }
    const found = await resolveTextFile(id);
    const filePath = found ? found.filePath : join(TEXTS_DIR, `${id}.gmr`);
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });
    const body = await readBody(req);
    let content;
    try {
      const parsed = JSON.parse(body);
      content = parsed.content;
    } catch {
      content = body;
    }
    await writeFile(filePath, content, 'utf-8');
    sendJSON(res, 200, { id, saved: true });
    return true;
  }

  return false;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/editor.html';

  // Security: prevent directory traversal
  const filePath = resolve(join(__dirname, pathname));
  if (!filePath.startsWith(__dirname)) {
    send404(res);
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    send404(res);
  }
}

const server = createServer(async (req, res) => {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const handled = await handleAPI(req, res);
    if (!handled) {
      await serveStatic(req, res);
    }
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`Gemara editor server running at http://localhost:${PORT}`);
});
