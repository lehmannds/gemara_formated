/**
 * recompute-mg.js — Recompute [mishna+gemara] and [gemara] boundaries
 * based on [mishna] tag positions in a text file.
 *
 * Usage:
 *   node scripts/recompute-mg.js <file> [--dry-run]
 *   node scripts/recompute-mg.js <masechet-dir> --dir [--dry-run]
 *     e.g. node scripts/recompute-mg.js texts/hulin --dir
 */
import { parse, serialize } from '../js/parser.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { listPerakimFiles } from './lib/perakim-fs.js';

function recomputeFile(content, label) {
  const nodes = parse(content);

  // 1. Remove all existing [mishna+gemara] and [gemara] tags
  let removed = 0;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].type === 'tag' && (nodes[i].tag === 'mishna+gemara' || nodes[i].tag === 'gemara')) {
      nodes.splice(i, 1);
      removed++;
    }
  }
  console.log(`  ${label}: removed ${removed} existing mishna+gemara/gemara tags.`);

  // 2. Find all [mishna] positions
  const mishnaPositions = [];
  let wordIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'tag' && nodes[i].tag === 'mishna') {
      mishnaPositions.push({ nodeIdx: i, wordStart: wordIdx, wordCount: nodes[i].wordCount });
    } else if (nodes[i].type === 'text') {
      wordIdx++;
    }
  }
  const totalWords = wordIdx;
  console.log(`  ${label}: found ${mishnaPositions.length} mishna tags, ${totalWords} total words.`);

  if (mishnaPositions.length === 0) {
    console.log(`  ${label}: no mishna tags found, nothing to do.`);
    return { nodes, changed: removed > 0 };
  }

  // 3. Compute spans and insert from last to first
  for (let m = mishnaPositions.length - 1; m >= 0; m--) {
    const cur = mishnaPositions[m];
    const nextMishnaStart = m + 1 < mishnaPositions.length
      ? mishnaPositions[m + 1].wordStart
      : totalWords;
    const mgWordCount = nextMishnaStart - cur.wordStart;
    const gemaraWordCount = mgWordCount - cur.wordCount;

    console.log(`    Mishna ${m + 1}: wordStart=${cur.wordStart}, mishna=${cur.wordCount} words, gemara=${gemaraWordCount} words, total=${mgWordCount}`);

    // Find the [mishna] tag node index directly and insert before it.
    // (Re-scanning rather than trusting cur.nodeIdx: an earlier iteration's
    // [gemara] insertion can land at or before a later mishnaPositions
    // entry's captured index in some layouts, which would silently shift it.)
    let insertPos = -1;
    let wc = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'tag' && nodes[i].tag === 'mishna' && wc === cur.wordStart) {
        insertPos = i;
        break;
      }
      if (nodes[i].type === 'text') wc++;
    }
    if (insertPos === -1) continue;

    // Insert [mishna+gemara] before everything at this position
    nodes.splice(insertPos, 0, {
      type: 'tag', tag: 'mishna+gemara',
      props: { default_collapsed: 'true' },
      wordCount: mgWordCount,
    });

    // Insert [gemara] after the mishna's words
    if (gemaraWordCount > 0) {
      const gemaraWordStart = cur.wordStart + cur.wordCount;
      let gwc = 0;
      let gPos = -1;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].type === 'text') {
          if (gwc === gemaraWordStart) { gPos = i; break; }
          gwc++;
        }
      }
      if (gPos !== -1) {
        while (gPos > 0 && nodes[gPos - 1].type === 'tag' && nodes[gPos - 1].tag !== 'mishna') {
          gPos--;
        }
        nodes.splice(gPos, 0, {
          type: 'tag', tag: 'gemara',
          props: {},
          wordCount: gemaraWordCount,
        });
      }
    }
  }

  return { nodes, changed: true };
}

// ─── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirMode = args.includes('--dir');
const target = args.find(a => !a.startsWith('--'));

if (!target) {
  console.error('Usage:');
  console.error('  node scripts/recompute-mg.js <file> [--dry-run]');
  console.error('  node scripts/recompute-mg.js <masechet-dir> --dir [--dry-run]');
  process.exit(1);
}

if (dirMode) {
  const masechetDir = resolve(target);
  const files = listPerakimFiles(masechetDir);

  console.log(`Recomputing mishna+gemara/gemara in ${files.length} perakim in ${masechetDir}`);
  for (const { perek, path } of files) {
    const content = readFileSync(path, 'utf-8');
    const { nodes, changed } = recomputeFile(content, `Perek ${perek}`);
    if (changed && !dryRun) {
      writeFileSync(path, serialize(nodes), 'utf-8');
    }
  }
  console.log(dryRun ? '\nDry run complete.' : '\nDone.');
} else {
  const file = target;
  const content = readFileSync(file, 'utf8');
  const { nodes } = recomputeFile(content, file);

  const output = serialize(nodes);
  if (dryRun) {
    console.log(`\nDry run: would write ${output.length} chars.`);
  } else {
    writeFileSync(file, output, 'utf8');
    console.log(`\nWrote ${file}.`);
  }
}
