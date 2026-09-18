#!/usr/bin/env node
/**
 * Automatically insert [mishna+gemara default_collapsed=true {N}] tags into
 * perek files.  The start of every perek is always a mishna (position 0).
 * Additional mishna boundaries are detected by "מתני"/"מתני'"/"מתניתין"
 * validated by a nearby "גמ'"/"גמ"/"גמרא" within MAX_GM_DIST words.
 *
 * If a perek has only a single mishna (the opening one), no tags are inserted.
 *
 * Safety: a perek whose [mishna+gemara] tags already each contain a nested
 * [mishna]+[gemara] pair (i.e. it was already fully processed, by this
 * pipeline or by hand) is left untouched by default, since re-running the
 * מתני/גמ' auto-detection from scratch can re-derive different boundaries
 * than a previous run or manual curation and would silently destroy that
 * work. Pass --force to reprocess such perakim anyway.
 *
 * Usage: node scripts/mark-mishna.js [masechet-dir] [--skip=1,2,3] [--force]
 *   e.g. node scripts/mark-mishna.js texts/hulin --skip=1,2,3
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { parse as parseMarkup } from '../js/parser.js';

const MAX_GM_DIST = 200;

const TAG_RE = /\[[^\]]*\{\d+\}\]/g;
const NOISE_TOKENS = new Set([')}}', "'", '"', '(', ')']);

function extractWords(markup) {
  const cleaned = markup.replace(TAG_RE, ' ').replace(/>>/g, ' ').replace(/<</g, ' ');
  const allWords = cleaned.split(/\s+/).filter(w => w.length > 0);
  const cleanWords = [];
  const cleanToAll = [];
  for (let i = 0; i < allWords.length; i++) {
    if (!NOISE_TOKENS.has(allWords[i])) {
      cleanToAll.push(i);
      cleanWords.push(allWords[i]);
    }
  }
  return { allWords, cleanWords, cleanToAll };
}

function isMatniWord(w) {
  return w === 'מתני' || w === "מתני'" || w === 'מתניתין';
}

function findValidatedMishnaStarts(words) {
  const starts = [];
  for (let i = 0; i < words.length; i++) {
    if (!isMatniWord(words[i])) continue;
    let hasGm = false;
    for (let j = i + 1; j < Math.min(i + MAX_GM_DIST, words.length); j++) {
      if (words[j] === "גמ'" || words[j] === 'גמ' || words[j] === 'גמרא') { hasGm = true; break; }
    }
    if (hasGm) starts.push(i);
  }
  return starts;
}

// ─── Markup insertion ────────────────────────────────────────

function findClosingBracket(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '[') depth++;
    if (s[i] === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function insertMishnaMarkers(markup, insertions) {
  if (insertions.length === 0) return markup;

  const result = [];
  let wordIdx = 0;
  let insertIdx = 0;
  let pos = 0;

  while (pos < markup.length) {
    if (markup[pos] === ' ' || markup[pos] === '\t') {
      result.push(markup[pos]);
      pos++;
      continue;
    }

    if (markup[pos] === '\n' || markup[pos] === '\r') {
      result.push(markup[pos]);
      pos++;
      continue;
    }

    if (markup[pos] === '[') {
      const closeIdx = findClosingBracket(markup, pos);
      if (closeIdx > pos) {
        const bracket = markup.slice(pos, closeIdx + 1);
        if (/\{\d+\}/.test(bracket)) {
          result.push(bracket);
          pos = closeIdx + 1;
          continue;
        }
      }
    }

    if ((markup[pos] === '>' && markup[pos + 1] === '>') ||
        (markup[pos] === '<' && markup[pos + 1] === '<')) {
      result.push(markup.slice(pos, pos + 2));
      pos += 2;
      continue;
    }

    let end = pos;
    while (end < markup.length && markup[end] !== ' ' && markup[end] !== '\t' &&
           markup[end] !== '\n' && markup[end] !== '\r') {
      if (end > pos && markup[end] === '[') break;
      if (end > pos && markup[end] === '>' && markup[end + 1] === '>') break;
      if (end > pos && markup[end] === '<' && markup[end + 1] === '<') break;
      end++;
    }
    const token = markup.slice(pos, end);
    const isNoise = NOISE_TOKENS.has(token);

    if (!isNoise) {
      while (insertIdx < insertions.length && insertions[insertIdx].wordIndex === wordIdx) {
        const wc = insertions[insertIdx].wordCount;
        result.push(`[mishna+gemara default_collapsed=true {${wc}}] `);
        insertIdx++;
      }
    }

    result.push(token);
    if (!isNoise) wordIdx++;
    pos = end;
  }

  return result.join('');
}

// ─── Already-fully-tagged detection (idempotency guard) ───────

function isFullyTagged(markup) {
  const nodes = parseMarkup(markup);
  let sawAny = false;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type !== 'tag' || n.tag !== 'mishna+gemara' || n.wordCount === 0) continue;
    sawAny = true;
    let hasMishna = false, hasGemara = false;
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[j].type === 'text') break;
      if (nodes[j].type === 'tag' && nodes[j].tag === 'mishna') hasMishna = true;
      if (nodes[j].type === 'tag' && nodes[j].tag === 'gemara') hasGemara = true;
    }
    if (!hasMishna || !hasGemara) return false;
  }
  return sawAny;
}

// ─── Main ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const masechetDir = resolve(args.find(a => !a.startsWith('--')) || 'texts/hulin');
const skipArg = args.find(a => a.startsWith('--skip='));
const skipSet = new Set(
  skipArg ? skipArg.replace('--skip=', '').split(',').map(Number) : []
);
const force = args.includes('--force');

const perakimDir = join(masechetDir, 'perakim');
const files = [];
for (let i = 1; i <= 50; i++) {
  const f = join(perakimDir, `${i}.txt`);
  if (existsSync(f)) files.push({ perek: i, path: f });
}

console.log(`Processing ${files.length} perakim in ${masechetDir} (skipping: ${[...skipSet].join(',') || 'none'})`);

for (const { perek, path } of files) {
  if (skipSet.has(perek)) {
    console.log(`  Perek ${perek}: skipped`);
    continue;
  }

  const markup = readFileSync(path, 'utf-8');

  if (!force && isFullyTagged(markup)) {
    console.log(`  Perek ${perek}: already fully tagged (mishna+gemara with nested mishna/gemara) – skipped (use --force to reprocess)`);
    continue;
  }

  // Remove any existing mishna markers before re-inserting
  const cleanMarkup = markup
    .replace(/\[mishna\+gemara\s+[^\]]*\{\d+\}\]\s*/g, '')
    .replace(/\[mishna\s+default_collapsed[^\]]*\{\d+\}\]\s*/g, '');
  const { allWords, cleanWords, cleanToAll } = extractWords(cleanMarkup);
  const detectedStarts = findValidatedMishnaStarts(cleanWords);

  // Every perek begins with a mishna at position 0.
  // If the first detected marker is within the opening 20 words, use it;
  // otherwise prepend 0 so the perek start is always a mishna boundary.
  const NEAR_START_THRESHOLD = 20;
  const firstDetectedNearStart = detectedStarts.length > 0 && detectedStarts[0] < NEAR_START_THRESHOLD;
  const starts = firstDetectedNearStart ? detectedStarts : [0, ...detectedStarts];

  if (starts.length <= 1) {
    console.log(`  Perek ${perek}: single mishna (whole perek) – skipped`);
    continue;
  }

  const insertions = [];
  for (let i = 0; i < starts.length; i++) {
    const wordIndex = starts[i];
    const allStart = cleanToAll[wordIndex];
    const allNext = i + 1 < starts.length ? cleanToAll[starts[i + 1]] : allWords.length;
    const wordCount = allNext - allStart;
    insertions.push({ wordIndex, wordCount });
  }

  const updated = insertMishnaMarkers(cleanMarkup, insertions);
  writeFileSync(path, updated, 'utf-8');
  console.log(`  Perek ${perek}: inserted ${insertions.length} mishna markers (${starts.map((s, i) => insertions[i].wordCount + 'w').join(', ')})`);
}

console.log('Done.');
