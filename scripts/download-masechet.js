#!/usr/bin/env node

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UNITS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

function toHebrew(n) {
  let result = '';
  if (n >= 100) {
    result += HUNDREDS[Math.floor(n / 100)];
    n %= 100;
  }
  if (n === 15) return result + 'טו';
  if (n === 16) return result + 'טז';
  if (n >= 10) {
    result += TENS[Math.floor(n / 10)];
    n %= 10;
  }
  if (n > 0) {
    result += UNITS[n];
  }
  return result;
}

const MAX_RETRIES = 5;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GemaraDownloader/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { status, body } = await httpGet(url);
    if (status === 200) return body;
    if (status === 429) {
      const wait = attempt * 5000;
      console.log(`    rate-limited, waiting ${wait / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`HTTP ${status} for ${url}`);
  }
  throw new Error(`Failed after ${MAX_RETRIES} retries (429) for ${url}`);
}

function extractGemara(wikitext) {
  const startMarker = /<\u05e7\u05d8\u05e2 \u05d4\u05ea\u05d7\u05dc\u05d4=\u05d2\/?>/;
  const endMarker = /<\u05e7\u05d8\u05e2 \u05e1\u05d5\u05e3=\u05d2\/?>/;

  const startMatch = wikitext.match(startMarker);
  if (!startMatch) throw new Error('Could not find Gemara start marker');

  const afterStart = wikitext.slice(startMatch.index + startMatch[0].length);
  const endMatch = afterStart.match(endMarker);
  if (!endMatch) throw new Error('Could not find Gemara end marker');

  let text = afterStart.slice(0, endMatch.index);

  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2');
  text = processTemplates(text);
  text = text.replace(/'{2,}/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

function processTemplates(text) {
  let prev;
  do {
    prev = text;

    // ── Person names → [speaker type=תנא/אמורא {N}] display ──
    text = text.replace(/\{\{(תנא|אמורא)\|[^|}]*\|([^{}]*)\}\}/g, (_, type, display) => {
      const wc = display.trim().split(/\s+/).length;
      return `[speaker type=${type} {${wc}}] ${display.trim()}`;
    });
    text = text.replace(/\{\{(תנא|אמורא)\|([^|}]*)\}\}/g, (_, type, name) => {
      const wc = name.trim().split(/\s+/).length;
      return `[speaker type=${type} {${wc}}] ${name.trim()}`;
    });

    // ── Verse refs wrapped in קטן: {{קטן|({{הפניה לפסוק|book ch|verse}})}} ──
    text = text.replace(
      /\{\{קטן\|\(?\{\{הפניה לפסוק\|([^|{}]*)\|([^{}]*)\}\}\)?\}\}/g,
      (_, bookCh, verse) => {
        const ref = (bookCh.trim() + ' ' + verse.trim()).replace(/ /g, '%20');
        return `[verse ref=${ref} {0}]`;
      }
    );
    // ── Standalone verse refs: {{הפניה לפסוק|book ch|verse}} ──
    text = text.replace(
      /\{\{הפניה לפסוק\|([^|{}]*)\|([^{}]*)\}\}/g,
      (_, bookCh, verse) => {
        const ref = (bookCh.trim() + ' ' + verse.trim()).replace(/ /g, '%20');
        return `[verse ref=${ref} {0}]`;
      }
    );
    // ── {{ממ|book ch|verse}} – another verse-ref variant ──
    text = text.replace(
      /\{\{ממ\|([^|{}]*)\|([^{}]*)\}\}/g,
      (_, bookCh, verse) => {
        const ref = (bookCh.trim() + ' ' + verse.trim()).replace(/ /g, '%20');
        return `[verse ref=${ref} {0}]`;
      }
    );

    // ── Mishna marker: {{מתני'|...}} → preserve as word for mark-mishna.js ──
    text = text.replace(/\{\{מתני'[^{}]*\}\}/g, "מתני'");

    // ── Strip structural/formatting templates ──
    text = text.replace(/\{\{(?:שוליים|שולייםלמטה|גמ'|קטן)[^{}]*\}\}/g, '');
    text = text.replace(/\{\{[^{}]*\}\}/g, '');
  } while (text !== prev);
  text = text.replace(/\{\{|\}\}/g, '');
  return text;
}

// ─── CLI parsing ─────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const positional = [];
let firstPage = 2;
let lastPage = null;
let dirName = null;

for (const arg of rawArgs) {
  if (arg.startsWith('--first=')) firstPage = parseInt(arg.slice(8), 10);
  else if (arg.startsWith('--last=')) lastPage = parseInt(arg.slice(7), 10);
  else if (arg.startsWith('--dir=')) dirName = arg.slice(6);
  else positional.push(arg);
}

const masechetName = positional[0];
if (!masechetName) {
  printUsage();
  process.exit(1);
}
dirName = dirName || masechetName;

function printUsage() {
  console.error('Usage:');
  console.error('  node download-masechet.js <name> --last=N all         Download all pages');
  console.error('  node download-masechet.js <name> --last=N reprocess   Re-extract from raw files');
  console.error('  node download-masechet.js <name> <page> <amud>        Download one page');
  console.error('');
  console.error('Options:');
  console.error('  --first=N   First daf number (default: 2)');
  console.error('  --last=N    Last daf number (required for "all" / "reprocess" mode)');
  console.error('  --dir=name  Output dir name under texts/ (default: masechet name)');
  console.error('');
  console.error('Examples:');
  console.error('  node download-masechet.js ברכות --last=64 all');
  console.error('  node download-masechet.js ברכות --last=64 reprocess');
  console.error('  node download-masechet.js חולין --last=142 9 1');
}

// ─── Download ────────────────────────────────────────────────

const textsDir = path.join(__dirname, '..', 'texts', dirName);
const rawDir = path.join(textsDir, 'raw');

async function downloadPage(page, amud) {
  const hebrewPage = toHebrew(page);
  const hebrewAmud = amud === 1 ? 'א' : 'ב';
  const pageTitle = encodeURIComponent(`${masechetName}_${hebrewPage}_${hebrewAmud}`);
  const apiUrl = `https://he.wikisource.org/w/api.php?action=parse&page=${pageTitle}&prop=wikitext&format=json`;

  console.log(`Fetching ${masechetName} ${hebrewPage} ${hebrewAmud}  (${page}.${amud})...`);

  const json = await fetchWithRetry(apiUrl);
  const data = JSON.parse(json);

  if (data.error) {
    throw new Error(`API error: ${data.error.info}`);
  }

  const wikitext = data.parse.wikitext['*'];

  fs.mkdirSync(rawDir, { recursive: true });
  const rawFile = path.join(rawDir, `${page}.${amud}.txt`);
  fs.writeFileSync(rawFile, wikitext, 'utf8');

  const text = extractGemara(wikitext);

  fs.mkdirSync(textsDir, { recursive: true });
  const outFile = path.join(textsDir, `${page}.${amud}.txt`);
  fs.writeFileSync(outFile, text, 'utf8');

  console.log(`  → saved ${outFile} (${text.length} chars)`);
  return text;
}

function reprocessPage(page, amud) {
  const rawFile = path.join(rawDir, `${page}.${amud}.txt`);
  if (!fs.existsSync(rawFile)) return false;

  const wikitext = fs.readFileSync(rawFile, 'utf8');
  const text = extractGemara(wikitext);

  const outFile = path.join(textsDir, `${page}.${amud}.txt`);
  fs.writeFileSync(outFile, text, 'utf8');
  return true;
}

async function main() {
  const mode = positional[1];

  if (mode === 'reprocess') {
    if (!lastPage) {
      console.error('Error: --last=N is required for "reprocess" mode');
      process.exit(1);
    }
    console.log(`Reprocessing ${dirName}: daf ${firstPage}–${lastPage} from raw files`);
    let processed = 0, missing = 0;
    for (let page = firstPage; page <= lastPage; page++) {
      for (let amud = 1; amud <= 2; amud++) {
        if (reprocessPage(page, amud)) {
          processed++;
        } else {
          missing++;
        }
      }
    }
    console.log(`\nDone: ${processed} reprocessed, ${missing} raw files missing`);

  } else if (mode === 'all') {
    if (!lastPage) {
      console.error('Error: --last=N is required for "all" mode');
      process.exit(1);
    }

    console.log(`Downloading ${masechetName}: daf ${firstPage}–${lastPage} → texts/${dirName}/`);
    let downloaded = 0, skipped = 0, failed = 0;

    for (let page = firstPage; page <= lastPage; page++) {
      for (let amud = 1; amud <= 2; amud++) {
        const rawFile = path.join(rawDir, `${page}.${amud}.txt`);
        if (fs.existsSync(rawFile)) {
          reprocessPage(page, amud);
          skipped++;
          continue;
        }
        try {
          await downloadPage(page, amud);
          downloaded++;
          await new Promise((r) => setTimeout(r, 2000));
        } catch (err) {
          failed++;
          console.error(`  ✗ ${page}.${amud}: ${err.message}`);
        }
      }
    }
    console.log(`\nDone: ${downloaded} downloaded, ${skipped} from raw (exist), ${failed} failed`);

  } else if (positional.length >= 3) {
    const page = parseInt(positional[1], 10);
    const amud = parseInt(positional[2], 10);
    if (isNaN(page) || isNaN(amud) || amud < 1 || amud > 2) {
      console.error('Error: page must be a number, amud must be 1 or 2');
      process.exit(1);
    }
    await downloadPage(page, amud);
  } else {
    printUsage();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
