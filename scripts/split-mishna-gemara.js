/**
 * split-mishna-gemara.js — For each [mishna+gemara {N}] section that doesn't
 * already have [mishna {M}] and [gemara {K}] sub-tags, detect the "גמ" marker
 * and insert them automatically.
 *
 * Usage:
 *   node scripts/split-mishna-gemara.js <file> [--dry-run]
 *   node scripts/split-mishna-gemara.js <masechet-dir> --dir [--dry-run]
 *     e.g. node scripts/split-mishna-gemara.js texts/hulin --dir
 */
import { parse, serialize } from '../js/parser.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

function splitFile(content) {
  const nodes = parse(content);
  let insertions = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'tag' || node.tag !== 'mishna+gemara' || node.wordCount === 0) continue;

    const mgStart = i;
    const mgWordCount = node.wordCount;

    // Check if [mishna]/[gemara] sub-tags already exist anywhere within this
    // mishna+gemara section's word span (not just immediately adjacent —
    // [gemara] normally sits after the mishna's words, not right at the start).
    let hasMishna = false;
    let hasGemara = false;
    {
      let wc = 0;
      for (let j = i + 1; j < nodes.length && wc < mgWordCount; j++) {
        if (nodes[j].type === 'text') { wc++; continue; }
        if (nodes[j].type === 'tag' && nodes[j].tag === 'mishna') hasMishna = true;
        if (nodes[j].type === 'tag' && nodes[j].tag === 'gemara') hasGemara = true;
      }
    }

    // Count words to find where "גמ" appears (marks start of gemara)
    let wordIdx = 0;
    let gemaraStartWord = -1;
    let mishnaWordCount = 0;

    for (let j = i + 1; j < nodes.length && wordIdx < mgWordCount; j++) {
      if (nodes[j].type === 'text') {
        // "גמ" or "גמ'" as a standalone word marks gemara start
        if (gemaraStartWord === -1 && /^גמ['׳]?$/.test(nodes[j].value)) {
          gemaraStartWord = wordIdx;
          mishnaWordCount = wordIdx;
        }
        wordIdx++;
      }
    }

    if (gemaraStartWord === -1) {
      // No "גמ" marker found — try "מתני" then look for next non-mishna section
      // Skip this section, can't auto-detect
      console.log(`    Skipping mishna+gemara at node ${i} (no גמ marker found, ${mgWordCount} words)`);
      continue;
    }

    const gemaraWordCount = mgWordCount - mishnaWordCount;

    if (!hasMishna && mishnaWordCount > 0) {
      // Insert [mishna {N}] right after the mishna+gemara tag
      const mishnaTag = { type: 'tag', tag: 'mishna', props: {}, wordCount: mishnaWordCount };
      nodes.splice(i + 1, 0, mishnaTag);
      insertions++;
      console.log(`    Inserted [mishna {${mishnaWordCount}}] after node ${i}`);
      // Adjust i since we inserted
      i++;
    }

    if (!hasGemara && gemaraWordCount > 0) {
      // Find the text node at gemaraStartWord and insert [gemara] before it
      let wc = 0;
      for (let j = mgStart + 1; j < nodes.length; j++) {
        if (nodes[j].type === 'text') {
          if (wc === gemaraStartWord) {
            const gemaraTag = { type: 'tag', tag: 'gemara', props: {}, wordCount: gemaraWordCount };
            nodes.splice(j, 0, gemaraTag);
            insertions++;
            console.log(`    Inserted [gemara {${gemaraWordCount}}] before word "${nodes[j + 1]?.value}" at position ${j}`);
            break;
          }
          wc++;
        }
      }
    }
  }

  return { nodes, insertions };
}

// ─── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirMode = args.includes('--dir');
const target = args.find(a => !a.startsWith('--'));

if (!target) {
  console.error('Usage:');
  console.error('  node scripts/split-mishna-gemara.js <file> [--dry-run]');
  console.error('  node scripts/split-mishna-gemara.js <masechet-dir> --dir [--dry-run]');
  process.exit(1);
}

if (dirMode) {
  const masechetDir = resolve(target);
  const perakimDir = join(masechetDir, 'perakim');
  const files = [];
  for (let i = 1; i <= 50; i++) {
    const f = join(perakimDir, `${i}.txt`);
    if (existsSync(f)) files.push({ perek: i, path: f });
  }

  console.log(`Splitting mishna/gemara in ${files.length} perakim in ${masechetDir}`);
  let totalInsertions = 0;
  for (const { perek, path } of files) {
    console.log(`  Perek ${perek}:`);
    const content = readFileSync(path, 'utf-8');
    const { nodes, insertions } = splitFile(content);
    totalInsertions += insertions;
    if (insertions === 0) {
      console.log('    No changes needed.');
      continue;
    }
    if (!dryRun) {
      writeFileSync(path, serialize(nodes), 'utf-8');
    }
  }
  console.log(dryRun
    ? `\nDry run: ${totalInsertions} insertions would be made.`
    : `\nDone: ${totalInsertions} insertions made.`);
} else {
  const file = target;
  const content = readFileSync(file, 'utf8');
  const { nodes, insertions } = splitFile(content);

  if (insertions === 0) {
    console.log('No changes needed.');
    process.exit(0);
  }

  const output = serialize(nodes);
  if (dryRun) {
    console.log(`\nDry run: would write ${output.length} chars, ${insertions} insertions.`);
  } else {
    writeFileSync(file, output, 'utf8');
    console.log(`\nWrote ${file}: ${insertions} insertions.`);
  }
}
