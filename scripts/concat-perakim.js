#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hulinDir = path.join(__dirname, '..', 'texts', 'hulin');
const outDir = path.join(hulinDir, 'perakim');

const FIRST_PAGE = 2;
const LAST_PAGE = 142;

const PEREK_NAMES = [
  'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי',
  'שביעי', 'שמיני', 'תשיעי', 'עשירי', 'אחד עשר', 'שנים עשרה',
];
const perekPattern = new RegExp('פרק (' + PEREK_NAMES.join('|') + ') - ');
const nameToNumber = {
  'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6,
  'שביעי': 7, 'שמיני': 8, 'תשיעי': 9, 'עשירי': 10,
  'אחד עשר': 11, 'שנים עשרה': 12,
};

// --- Phase 1: scan pages and discover perek boundaries ---

function readPage(page, amud) {
  const file = path.join(hulinDir, `${page}.${amud}.txt`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

const boundaries = [{ perek: 1, page: FIRST_PAGE, amud: 1, offset: 0, title: 'הכל שוחטין' }];

for (let page = FIRST_PAGE; page <= LAST_PAGE; page++) {
  for (let amud = 1; amud <= 2; amud++) {
    const text = readPage(page, amud);
    if (!text) continue;
    const match = text.match(perekPattern);
    if (match) {
      boundaries.push({
        perek: nameToNumber[match[1]],
        page,
        amud,
        offset: match.index,
        title: match[0].replace('פרק ', '').replace(' - ', ''),
      });
    }
  }
}

boundaries.sort((a, b) => a.perek - b.perek);

console.log('Found perek boundaries:');
for (const b of boundaries) {
  console.log(`  Perek ${b.perek}: page ${b.page}.${b.amud}, offset ${b.offset} (${b.title})`);
}

// --- Phase 1b: write perakim.yaml ---

const yamlLines = ['perakim:'];
for (const b of boundaries) {
  yamlLines.push(
    `  - perek: ${b.perek}`,
    `    start_page: ${b.page}.${b.amud}`,
    `    offset: ${b.offset}`,
    `    title: ${b.title}`,
  );
}

// --- Phase 2: find last page that has content ---

let lastPage = FIRST_PAGE, lastAmud = 1;
for (let page = LAST_PAGE; page >= FIRST_PAGE; page--) {
  for (let amud = 2; amud >= 1; amud--) {
    if (readPage(page, amud) !== null) {
      lastPage = page;
      lastAmud = amud;
      page = 0; // break outer
      break;
    }
  }
}

yamlLines.push('', `last_page: ${lastPage}.${lastAmud}`);
const yamlFile = path.join(hulinDir, 'perakim.yaml');
fs.writeFileSync(yamlFile, yamlLines.join('\n') + '\n', 'utf8');
console.log(`\nWrote ${yamlFile}`);

// --- Phase 3: concatenate ---

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

console.log('\nDone.');
