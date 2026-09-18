/**
 * format-perek.js — Format a perek text file with newlines, indentation,
 * and structural markers, mimicking the style of hulin perek 3.
 *
 * Usage: node scripts/format-perek.js <input-file> [output-file]
 *        If output-file is omitted, overwrites input-file.
 */
import fs from 'fs';

const inFile = process.argv[2];
const outFile = process.argv[3] || inFile;
if (!inFile) { console.error('Usage: node scripts/format-perek.js <file> [out]'); process.exit(1); }

let text = fs.readFileSync(inFile, 'utf8').trim().replace(/\r\n/g, '\n');

// ═══════════════════════════════════════════════════════════════════════
// 1. Protect tags: temporarily replace [...] tags so we don't break them
// ═══════════════════════════════════════════════════════════════════════
const tags = [];
text = text.replace(/\[[^\]]*\{[0-9]+\}\]/g, m => {
  tags.push(m);
  return `⟨TAG${tags.length - 1}⟩`;
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Insert line-break markers (⏎) before structural patterns
// ═══════════════════════════════════════════════════════════════════════

// ── Tags themselves (page, mishna, group) ──
text = text.replace(/⟨TAG/g, '⏎⟨TAG');

// ── Gemara start ──
text = text.replace(/ גמ['׳]? /g, '⏎גמ ');

// ── Mishna quotation start ──
text = text.replace(/ מתני['׳]? /g, '⏎מתני ');
text = text.replace(/ מתני$/gm, '⏎מתני');

// ── Baraitot ──
text = text.replace(/ תנו רבנן /g, '⏎תנו רבנן ');
text = text.replace(/ ת"ר /g, '⏎ת"ר ');

// ── "תניא" introducing a baraita ──
text = text.replace(/ תניא /g, '⏎תניא ');

// ── "תני" teaching ──
text = text.replace(/ תני /g, '⏎תני ');

// ── End-of-sugya colons ──
// A colon followed by more text means a sugya ended.
text = text.replace(/: (?=[⟨א-ת(])/g, ':\n');

// ── "אמר מר" — analyzing a specific mishna phrase ──
text = text.replace(/ אמר מר /g, '⏎אמר מר ');

// ── Major named statements by amoraim/tanaim ──
// "א"ר", "אמר ר'", "אמר רב", "אמר רבי", "אמר רבא", "אמר רבה" etc.
// Only when preceded by end-of-sentence markers or tags
const amoraPattern = /(?<=[:.\n⏎]) ?(?:א"ר|אמר (?:ר'|רב |רבי |רבא |רבה |לוי ))/g;
text = text.replace(amoraPattern, m => '⏎' + m.trimStart());

// ── "וא"ר" / "ואמר ר'" patterns ──
text = text.replace(/(?<=[:.\n⏎]) ?(?:וא"ר |ואמר (?:ר'|רב |רבי |רבא |רבה ))/g,
  m => '⏎' + m.trimStart());

// ── "א"ל" (said to him) as new speaker turn ──
text = text.replace(/(?<=[:.\n⏎]) ?א"ל /g, '⏎א"ל ');

// ── Challenges ──
text = text.replace(/ (?:מתיב|מתקיף) /g, m => '⏎' + m.trim() + ' ');
text = text.replace(/ ורמינהו /g, '⏎ורמינהו ');
text = text.replace(/ איתיביה /g, '⏎איתיביה ');

// ── Questions ──
text = text.replace(/ בעי /g, '⏎בעי ');
text = text.replace(/ איבעיא להו /g, '⏎איבעיא להו ');
text = text.replace(/ בעא מיניה /g, '⏎בעא מיניה ');

// ── "ת"ש" (come and hear) ──
text = text.replace(/ ת"ש /g, '⏎ת"ש ');

// ── Story/aggada markers ──
text = text.replace(/ מעשה /g, '⏎מעשה ');

// ═══════════════════════════════════════════════════════════════════════
// 3. Restore tags
// ═══════════════════════════════════════════════════════════════════════
text = text.replace(/⟨TAG(\d+)⟩/g, (_, i) => tags[+i]);

// ═══════════════════════════════════════════════════════════════════════
// 4. Convert ⏎ to actual newlines, clean up
// ═══════════════════════════════════════════════════════════════════════
text = text.replace(/⏎/g, '\n');

// Split into lines, trim each
let lines = text.split('\n').map(l => l.trim());

// Remove empty leading line
while (lines.length && lines[0] === '') lines.shift();

// Collapse runs of >2 empty lines into 2
const cleaned = [];
let emptyRun = 0;
for (const line of lines) {
  if (line === '') {
    emptyRun++;
    if (emptyRun <= 2) cleaned.push('');
  } else {
    emptyRun = 0;
    cleaned.push(line);
  }
}

const output = cleaned.join('\n');
fs.writeFileSync(outFile, output, 'utf8');
console.log(`Done. ${outFile}: ${cleaned.length} lines`);
