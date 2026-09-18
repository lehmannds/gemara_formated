#!/usr/bin/env node
/**
 * Full pipeline: download pages → concat perakim (+ page markers) → mark mishna.
 *
 * Usage:
 *   node scripts/full-download-process.js <masechet_hebrew> --last=N [--first=N] [--dir=name] [--skip-mishna=1,2,3] [--reprocess]
 *
 * Examples:
 *   node scripts/full-download-process.js ברכות --last=64
 *   node scripts/full-download-process.js חולין --last=142 --skip-mishna=1,2,3
 *   node scripts/full-download-process.js ברכות --last=64 --reprocess   (re-extract from raw, no download)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CLI parsing ─────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const positional = [];
let firstPage = 2;
let lastPage = null;
let dirName = null;
let skipMishna = null;
let reprocess = false;

for (const arg of rawArgs) {
  if (arg.startsWith('--first=')) firstPage = parseInt(arg.slice(8), 10);
  else if (arg.startsWith('--last=')) lastPage = parseInt(arg.slice(7), 10);
  else if (arg.startsWith('--dir=')) dirName = arg.slice(6);
  else if (arg.startsWith('--skip-mishna=')) skipMishna = arg.slice(14);
  else if (arg === '--reprocess') reprocess = true;
  else positional.push(arg);
}

const masechetName = positional[0];
if (!masechetName || !lastPage) {
  console.error('Usage: node full-download-process.js <masechet_hebrew> --last=N [--first=N] [--dir=name] [--skip-mishna=1,2,3]');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/full-download-process.js ברכות --last=64');
  console.error('  node scripts/full-download-process.js חולין --last=142 --skip-mishna=1,2,3');
  process.exit(1);
}

dirName = dirName || masechetName;
const masechetDir = path.join('texts', dirName);

function banner(step, description) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Step ${step}: ${description}`);
  console.log('='.repeat(60) + '\n');
}

function runScript(scriptName, args) {
  const scriptPath = path.join(__dirname, scriptName);
  execFileSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
}

// ─── Step 1: Download ────────────────────────────────────────

const downloadMode = reprocess ? 'reprocess' : 'all';
banner(1, reprocess
  ? `Reprocess ${masechetName} from raw files (daf ${firstPage}–${lastPage})`
  : `Download ${masechetName} (daf ${firstPage}–${lastPage})`);

const downloadArgs = [masechetName, `--last=${lastPage}`, `--first=${firstPage}`, downloadMode];
if (dirName !== masechetName) downloadArgs.splice(1, 0, `--dir=${dirName}`);
runScript('download-masechet.js', downloadArgs);

// ─── Step 2: Concat perakim + page markers ───────────────────

banner(2, `Concat perakim + insert page markers (${masechetDir})`);
runScript('concat-perakim.js', [masechetDir]);

// ─── Step 3: Mark mishna+gemara sections ──────────────────────

banner(3, `Mark mishna+gemara sections (${masechetDir})`);
const mishnaArgs = [masechetDir];
if (skipMishna) mishnaArgs.push(`--skip=${skipMishna}`);
runScript('mark-mishna.js', mishnaArgs);

// ─── Step 4: Split mishna+gemara into [mishna]/[gemara] tags ─

banner(4, `Split mishna/gemara sub-tags (${masechetDir})`);
runScript('split-mishna-gemara.js', [masechetDir, '--dir']);

console.log(`\n${'='.repeat(60)}`);
console.log(`  All done! Output in ${masechetDir}/perakim/`);
console.log('='.repeat(60) + '\n');
