import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function hashTree(root, include = name => name.endsWith('.js') || name === 'package.json') {
  const hash = createHash('sha256');
  async function visit(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && include(entry.name)) {
        hash.update(path.relative(root, file)); hash.update('\0'); hash.update(await readFile(file)); hash.update('\0');
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}
