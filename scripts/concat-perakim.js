#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CLI ─────────────────────────────────────────────────────

const masechetDir = path.resolve(process.argv[2] || '');
if (!masechetDir || !fs.existsSync(masechetDir)) {
  console.error('Usage: node concat-perakim.js <masechet-dir>');
  console.error('  e.g. node concat-perakim.js texts/ברכות');
  process.exit(1);
}

const outDir = path.join(masechetDir, 'perakim');

// ─── Auto-detect page range ──────────────────────────────────

const pageFiles = fs.readdirSync(masechetDir)
  .filter(f => /^\d+\.[12]\.txt$/.test(f))
  .map(f => {
    const m = f.match(/^(\d+)\.([12])\.txt$/);
    return { page: parseInt(m[1], 10), amud: parseInt(m[2], 10) };
  });

if (pageFiles.length === 0) {
  console.error('No page files found in ' + masechetDir);
  process.exit(1);
}

const FIRST_PAGE = Math.min(...pageFiles.map(f => f.page));
const LAST_PAGE = Math.max(...pageFiles.map(f => f.page));

console.log(`Detected page range: ${FIRST_PAGE}–${LAST_PAGE} (${pageFiles.length} files)`);

// ─── Hebrew ordinals → perek number ─────────────────────────

const ORDINAL_TO_NUMBER = {
  'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6,
  'שביעי': 7, 'שמיני': 8, 'תשיעי': 9, 'עשירי': 10,
  'אחד עשר': 11, 'אחד עשרה': 11,
  'שנים עשר': 12, 'שנים עשרה': 12, 'שתים עשרה': 12,
  'שלשה עשר': 13, 'שלושה עשר': 13,
  'ארבעה עשר': 14,
  'חמשה עשר': 15, 'חמישה עשר': 15,
  'ששה עשר': 16,
  'שבעה עשר': 17,
  'שמונה עשר': 18, 'שמנה עשר': 18,
  'תשעה עשר': 19,
  'עשרים': 20,
  'עשרים ואחד': 21, 'אחד ועשרים': 21,
  'עשרים ושנים': 22, 'שנים ועשרים': 22,
  'עשרים ושלשה': 23, 'עשרים ושלושה': 23,
  'עשרים וארבעה': 24, 'ארבעה ועשרים': 24,
};

const ordinalNames = Object.keys(ORDINAL_TO_NUMBER).sort((a, b) => b.length - a.length);
const perekPattern = new RegExp('פרק (' + ordinalNames.join('|') + ') [-–] ');

// ─── Phase 1: scan pages and discover perek boundaries ───────

function readPage(page, amud) {
  const file = path.join(masechetDir, `${page}.${amud}.txt`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

const boundaries = [{ perek: 1, page: FIRST_PAGE, amud: 1, offset: 0, title: 'ראשון' }];

for (let page = FIRST_PAGE; page <= LAST_PAGE; page++) {
  for (let amud = 1; amud <= 2; amud++) {
    const text = readPage(page, amud);
    if (!text) continue;
    const match = text.match(perekPattern);
    if (match) {
      boundaries.push({
        perek: ORDINAL_TO_NUMBER[match[1]],
        page,
        amud,
        offset: match.index,
        title: match[1],
      });
    }
  }
}

boundaries.sort((a, b) => a.perek - b.perek);

console.log('\nFound perek boundaries:');
for (const b of boundaries) {
  console.log(`  Perek ${b.perek}: page ${b.page}.${b.amud}, offset ${b.offset} (${b.title})`);
}

// ─── Phase 1b: write perakim.yaml ────────────────────────────

const yamlLines = ['perakim:'];
for (const b of boundaries) {
  yamlLines.push(
    `  - perek: ${b.perek}`,
    `    start_page: ${b.page}.${b.amud}`,
    `    offset: ${b.offset}`,
    `    title: ${b.title}`,
  );
}

// ─── Phase 2: find last page that has content ────────────────

let lastPage = FIRST_PAGE, lastAmud = 1;
for (let page = LAST_PAGE; page >= FIRST_PAGE; page--) {
  for (let amud = 2; amud >= 1; amud--) {
    if (readPage(page, amud) !== null) {
      lastPage = page;
      lastAmud = amud;
      page = 0;
      break;
    }
  }
}

yamlLines.push('', `last_page: ${lastPage}.${lastAmud}`);
const yamlFile = path.join(masechetDir, 'perakim.yaml');
fs.writeFileSync(yamlFile, yamlLines.join('\n') + '\n', 'utf8');
console.log(`\nWrote ${yamlFile}`);

// ─── Phase 3: concatenate ────────────────────────────────────

function pageKey(page, amud) {
  return page * 10 + amud;
}

function* pageRange(fromPage, fromAmud, toPage, toAmud) {
  let p = fromPage, a = fromAmud;
  while (pageKey(p, a) <= pageKey(toPage, toAmud)) {
    yield { page: p, amud: a };
    if (a === 1) a = 2;
    else { a = 1; p++; }
  }
}

fs.mkdirSync(outDir, { recursive: true });

console.log('\nConcatenating:');

for (let i = 0; i < boundaries.length; i++) {
  const cur = boundaries[i];
  const next = boundaries[i + 1];

  const endPage = next ? next.page : lastPage;
  const endAmud = next ? next.amud : lastAmud;

  const chunks = [];

  for (const { page, amud } of pageRange(cur.page, cur.amud, endPage, endAmud)) {
    const text = readPage(page, amud);
    if (text === null) continue;

    const isStartPage = (page === cur.page && amud === cur.amud);
    const isEndPage = next && (page === next.page && amud === next.amud);

    if (isStartPage && isEndPage) {
      chunks.push(text.slice(cur.offset, next.offset));
    } else if (isStartPage) {
      chunks.push(text.slice(cur.offset));
    } else if (isEndPage) {
      chunks.push(text.slice(0, next.offset));
    } else {
      chunks.push(text);
    }
  }

  const merged = chunks.join(' ').trim();
  const outFile = path.join(outDir, `${cur.perek}.txt`);
  fs.writeFileSync(outFile, merged, 'utf8');

  console.log(`  Perek ${cur.perek} (${cur.title}): ${merged.length} chars, ${chunks.length} pages → ${cur.perek}.txt`);
}

console.log('\nConcatenation done.');

// ─── Phase 4: insert page markers ───────────────────────────

console.log('\nRunning page marker insertion...');
execFileSync(process.execPath, [path.join(__dirname, 'mark-pages.js'), masechetDir], { stdio: 'inherit' });
