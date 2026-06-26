#!/usr/bin/env node
/**
 * Automatically insert [page value=... {0}] markers into perek files by
 * matching page-file text against the perek's plain text.
 *
 * Usage: node scripts/mark-pages.js texts/hulin
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ─── YAML parser (matches server.js format) ─────────────────

function parsePerakimYaml(text) {
  const result = { perakim: [], last_page: null };
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const lastPageMatch = line.match(/^last_page:\s*(.+)$/);
    if (lastPageMatch) { result.last_page = lastPageMatch[1].trim(); continue; }
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

// ─── Gimatria ────────────────────────────────────────────────

const ONES  = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS  = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDS = ['', 'ק', 'ר', 'ש', 'ת'];

function toGimatria(n) {
  if (n === 15) return 'טו';
  if (n === 16) return 'טז';
  let result = '';
  if (n >= 100) { result += HUNDS[Math.floor(n / 100)]; n %= 100; }
  if (n >= 10)  { result += TENS[Math.floor(n / 10)];  n %= 10; }
  if (n >= 1)   { result += ONES[n]; }
  return result;
}

function pageToHebrew(pageStr) {
  const [dafStr, amudStr] = pageStr.split('.');
  const daf = parseInt(dafStr, 10);
  const amud = amudStr === '1' ? 'א' : 'ב';
  return `${toGimatria(daf)} ${amud}`;
}

// ─── Word extraction ─────────────────────────────────────────

function extractWordsFromPageFile(text) {
  return text.split(/\s+/)
    .filter(w => w.length > 0 && w !== ')}}');
}

function extractWordsFromPerek(markup) {
  const TAG_RE = /\[([^\]]+)\]/g;
  const cleaned = markup.replace(TAG_RE, ' ').replace(/>>/g, ' ').replace(/<</g, ' ');
  return cleaned.split(/\s+/).filter(w => w.length > 0);
}

// ─── Page iteration ──────────────────────────────────────────

function nextPage(pageStr) {
  const [dafStr, amudStr] = pageStr.split('.');
  const daf = parseInt(dafStr, 10);
  if (amudStr === '1') return `${daf}.2`;
  return `${daf + 1}.1`;
}

function pageToNum(pageStr) {
  const [daf, amud] = pageStr.split('.');
  return parseInt(daf, 10) * 2 + (amud === '2' ? 1 : 0);
}

// ─── Matching ────────────────────────────────────────────────

function findPageStart(perekWords, pageWords, startFrom) {
  const matchLen = Math.min(6, pageWords.length);
  if (matchLen === 0) return -1;

  for (let i = startFrom; i <= perekWords.length - matchLen; i++) {
    let ok = true;
    for (let j = 0; j < matchLen; j++) {
      if (perekWords[i + j] !== pageWords[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

// ─── Markup insertion ────────────────────────────────────────

function insertPageMarkers(markup, insertions) {
  if (insertions.length === 0) return markup;

  const result = [];
  let wordIdx = 0;
  let insertIdx = 0;
  let pos = 0;

  while (pos < markup.length) {
    // Skip whitespace
    if (markup[pos] === ' ' || markup[pos] === '\t') {
      result.push(markup[pos]);
      pos++;
      continue;
    }

    // Newlines
    if (markup[pos] === '\n' || markup[pos] === '\r') {
      result.push(markup[pos]);
      pos++;
      continue;
    }

    // Tag: [...]
    if (markup[pos] === '[') {
      const closeIdx = findClosingBracket(markup, pos);
      if (closeIdx > pos) {
        result.push(markup.slice(pos, closeIdx + 1));
        pos = closeIdx + 1;
        continue;
      }
    }

    // >> or <<
    if ((markup[pos] === '>' && markup[pos + 1] === '>') ||
        (markup[pos] === '<' && markup[pos + 1] === '<')) {
      result.push(markup.slice(pos, pos + 2));
      pos += 2;
      continue;
    }

    // Word: check if we need to insert a page marker before this word
    while (insertIdx < insertions.length && insertions[insertIdx].wordIndex === wordIdx) {
      const v = insertions[insertIdx].value;
      const encoded = v.includes(' ') ? v.replace(/ /g, '%20') : v;
      result.push(`[page value=${encoded} {0}] `);
      insertIdx++;
    }

    // Read the word
    let end = pos;
    while (end < markup.length && markup[end] !== ' ' && markup[end] !== '\t' &&
           markup[end] !== '\n' && markup[end] !== '\r') {
      if (end > pos && markup[end] === '[') break;
      if (end > pos && markup[end] === '>' && markup[end + 1] === '>') break;
      if (end > pos && markup[end] === '<' && markup[end + 1] === '<') break;
      end++;
    }
    result.push(markup.slice(pos, end));
    wordIdx++;
    pos = end;
  }

  return result.join('');
}

function findClosingBracket(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '[') depth++;
    if (s[i] === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// ─── Main ────────────────────────────────────────────────────

const masechetDir = resolve(process.argv[2] || 'texts/hulin');
const perakimYaml = readFileSync(join(masechetDir, 'perakim.yaml'), 'utf-8');
const config = parsePerakimYaml(perakimYaml);
const perakim = config.perakim;
const lastPage = config.last_page || null;

console.log(`Processing ${perakim.length} perakim in ${masechetDir}`);

for (let pi = 0; pi < perakim.length; pi++) {
  const perek = perakim[pi];
  const perekFile = join(masechetDir, 'perakim', `${perek.perek}.txt`);
  if (!existsSync(perekFile)) {
    console.log(`  Perek ${perek.perek}: file not found, skipping`);
    continue;
  }

  const markup = readFileSync(perekFile, 'utf-8');

  // Remove any existing page markers before re-inserting
  const cleanMarkup = markup.replace(/\[page\s+[^\]]*\{0\}\]\s*/g, '');
  const perekWords = extractWordsFromPerek(cleanMarkup);

  // Determine page range for this perek
  const startPage = perek.start_page;
  const endPage = pi + 1 < perakim.length
    ? perakim[pi + 1].start_page
    : (lastPage ? nextPage(lastPage) : null);

  // Collect all pages in range
  const pages = [];
  let pg = startPage;
  const maxPageNum = endPage ? pageToNum(endPage) : pageToNum(startPage) + 200;
  while (pageToNum(pg) < maxPageNum) {
    const pageFile = join(masechetDir, `${pg}.txt`);
    if (existsSync(pageFile)) {
      const text = readFileSync(pageFile, 'utf-8');
      const words = extractWordsFromPageFile(text);
      pages.push({ page: pg, words, hebrew: pageToHebrew(pg) });
    }
    pg = nextPage(pg);
  }

  if (pages.length === 0) {
    console.log(`  Perek ${perek.perek}: no page files found`);
    continue;
  }

  const insertions = [];
  let searchFrom = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    let pageWords = page.words;

    if (i === 0 && perek.offset > 0) {
      const fullText = pageWords.join(' ');
      const offsetWords = fullText.slice(0, perek.offset)
        .split(/\s+/).filter(w => w.length > 0).length;
      pageWords = pageWords.slice(offsetWords);
    }

    // Skip perek header in page files (e.g. "פרק שני - השוחט")
    if (i === 0 && pageWords.length > 0 && pageWords[0] === 'פרק') {
      let skip = 0;
      for (let j = 0; j < Math.min(10, pageWords.length); j++) {
        skip = j + 1;
        if (pageWords[j] === '-') break;
      }
      if (skip > 0 && skip < pageWords.length) {
        pageWords = pageWords.slice(skip);
      }
    }

    if (pageWords.length < 3) continue;

    const wordIdx = findPageStart(perekWords, pageWords, searchFrom);
    if (wordIdx >= 0) {
      if (i === 0 && wordIdx <= 2) {
        insertions.push({ wordIndex: 0, value: page.hebrew });
      } else {
        insertions.push({ wordIndex: wordIdx, value: page.hebrew });
      }
      searchFrom = wordIdx + 1;
    } else {
      // Try with fewer match words (3 instead of 6)
      const shortMatch = findPageStartShort(perekWords, pageWords, searchFrom);
      if (shortMatch >= 0) {
        insertions.push({ wordIndex: shortMatch, value: page.hebrew });
        searchFrom = shortMatch + 1;
      } else {
        console.log(`    Perek ${perek.perek}: could not find page ${page.page} (${page.hebrew}), words: ${pageWords.slice(0, 6).join(' ')}`);
      }
    }
  }

  if (insertions.length === 0) {
    console.log(`  Perek ${perek.perek}: no page markers to insert`);
    continue;
  }

  const updated = insertPageMarkers(cleanMarkup, insertions);
  writeFileSync(perekFile, updated, 'utf-8');
  console.log(`  Perek ${perek.perek}: inserted ${insertions.length} page markers`);
}

console.log('Done.');

function findPageStartShort(perekWords, pageWords, startFrom) {
  const matchLen = Math.min(3, pageWords.length);
  if (matchLen === 0) return -1;
  for (let i = startFrom; i <= perekWords.length - matchLen; i++) {
    let ok = true;
    for (let j = 0; j < matchLen; j++) {
      if (perekWords[i + j] !== pageWords[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}
