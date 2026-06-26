#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dir = path.join(__dirname, '..', 'texts', 'hulin');

const PEREK_NAMES = [
  'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי',
  'שביעי', 'שמיני', 'תשיעי', 'עשירי', 'אחד עשר', 'שנים עשרה',
];

const perekPattern = new RegExp(
  'פרק (' + PEREK_NAMES.join('|') + ') - '
);

const nameToNumber = {
  'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6,
  'שביעי': 7, 'שמיני': 8, 'תשיעי': 9, 'עשירי': 10,
  'אחד עשר': 11, 'שנים עשרה': 12,
};

console.log('Perek 1: starts at page 2.1, offset 0 (הכל שוחטין)');

for (let page = 2; page <= 142; page++) {
  for (let amud = 1; amud <= 2; amud++) {
    const file = path.join(dir, `${page}.${amud}.txt`);
    if (!fs.existsSync(file)) continue;

    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(perekPattern);
    if (match) {
      const num = nameToNumber[match[1]];
      const title = text.slice(match.index, match.index + 80).replace(/\s+/g, ' ');
      console.log(`Perek ${num}: starts at page ${page}.${amud}, offset ${match.index} (${title}...)`);
    }
  }
}
