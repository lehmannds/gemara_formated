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

  // Strip <...> HTML/wiki tags
  text = text.replace(/<[^>]+>/g, '');
  // Strip [[link|display]] → display, [[link]] → link
  text = text.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2');
  // Process {{ templates }}: preserve person names, strip the rest
  text = processTemplates(text);
  // Strip bold/italic markers
  text = text.replace(/'{2,}/g, '');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

function processTemplates(text) {
  let prev;
  do {
    prev = text;

    text = text.replace(/\{\{(תנא|אמורא)\|[^|}]*\|([^{}]*)\}\}/g, (_, type, display) => {
      const wc = display.trim().split(/\s+/).length;
      return `[speaker type=${type} {${wc}}] ${display.trim()}`;
    });
    text = text.replace(/\{\{(תנא|אמורא)\|([^|}]*)\}\}/g, (_, type, name) => {
      const wc = name.trim().split(/\s+/).length;
      return `[speaker type=${type} {${wc}}] ${name.trim()}`;
    });

    text = text.replace(
      /\{\{קטן\|\(?\{\{הפניה לפסוק\|([^|{}]*)\|([^{}]*)\}\}\)?\}\}/g,
      (_, bookCh, verse) => {
        const ref = (bookCh.trim() + ' ' + verse.trim()).replace(/ /g, '%20');
        return `[verse ref=${ref} {0}]`;
      }
    );
    text = text.replace(
      /\{\{הפניה לפסוק\|([^|{}]*)\|([^{}]*)\}\}/g,
      (_, bookCh, verse) => {
        const ref = (bookCh.trim() + ' ' + verse.trim()).replace(/ /g, '%20');
        return `[verse ref=${ref} {0}]`;
      }
    );
    text = text.replace(
      /\{\{ממ\|([^|{}]*)\|([^{}]*)\}\}/g,
      (_, bookCh, verse) => {
        const ref = (bookCh.trim() + ' ' + verse.trim()).replace(/ /g, '%20');
        return `[verse ref=${ref} {0}]`;
      }
    );

    text = text.replace(/\{\{מתני'[^{}]*\}\}/g, "מתני'");
    text = text.replace(/\{\{(?:שוליים|שולייםלמטה|גמ'|קטן)[^{}]*\}\}/g, '');
    text = text.replace(/\{\{[^{}]*\}\}/g, '');
  } while (text !== prev);
  text = text.replace(/\{\{|\}\}/g, '');
  return text;
}

async function downloadPage(page, amud) {
  const hebrewPage = toHebrew(page);
  const hebrewAmud = amud === 1 ? 'א' : 'ב';
  const pageTitle = encodeURIComponent(`חולין_${hebrewPage}_${hebrewAmud}`);
  const apiUrl = `https://he.wikisource.org/w/api.php?action=parse&page=${pageTitle}&prop=wikitext&format=json`;

  console.log(`Fetching חולין ${hebrewPage} ${hebrewAmud}  (${page}.${amud})...`);

  const json = await fetchWithRetry(apiUrl);
  const data = JSON.parse(json);

  if (data.error) {
    throw new Error(`API error: ${data.error.info}`);
  }

  const wikitext = data.parse.wikitext['*'];
  const text = extractGemara(wikitext);

  const outDir = path.join(__dirname, '..', 'texts', 'hulin');
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${page}.${amud}.txt`);
  fs.writeFileSync(outFile, text, 'utf8');

  console.log(`  → saved ${outFile}`);
  console.log(`  → ${text.length} chars`);
  console.log(`  → starts: ${text.slice(0, 40)}...`);
  console.log(`  → ends:   ...${text.slice(-40)}`);

  return text;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 2) {
    const page = parseInt(args[0], 10);
    const amud = parseInt(args[1], 10);
    if (isNaN(page) || isNaN(amud) || amud < 1 || amud > 2) {
      console.error('Usage: node download-hulin.js <page> <amud>');
      console.error('  page: 2-142, amud: 1 or 2');
      process.exit(1);
    }
    await downloadPage(page, amud);
  } else if (args[0] === 'all') {
    const outDir = path.join(__dirname, '..', 'texts', 'hulin');
    let downloaded = 0, skipped = 0, failed = 0;
    for (let page = 2; page <= 142; page++) {
      for (let amud = 1; amud <= 2; amud++) {
        const outFile = path.join(outDir, `${page}.${amud}.txt`);
        if (fs.existsSync(outFile)) {
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
    console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped (exist), ${failed} failed`);
  } else {
    console.error('Usage:');
    console.error('  node download-hulin.js <page> <amud>   Download one page');
    console.error('  node download-hulin.js all              Download all pages');
    console.error('');
    console.error('Examples:');
    console.error('  node download-hulin.js 9 1    # חולין ט א');
    console.error('  node download-hulin.js all    # all pages ב..קמב');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
