import { existsSync } from 'fs';
import { join } from 'path';

/**
 * List the perek files (1.txt, 2.txt, ...) present in a masechet's
 * perakim/ directory, in perek order.
 */
export function listPerakimFiles(masechetDir, maxPerek = 50) {
  const perakimDir = join(masechetDir, 'perakim');
  const files = [];
  for (let i = 1; i <= maxPerek; i++) {
    const f = join(perakimDir, `${i}.txt`);
    if (existsSync(f)) files.push({ perek: i, path: f });
  }
  return files;
}
