// Phase 261 / CI-05 -- per-locale gzipped main-bundle budget enforcement.
// Invariant: each locale's `main-<hash>.js` must be <= 1 MB after gzipSync.
// Source: 261-RESEARCH.md Pattern 4 verbatim.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BROWSER_DIR = join(process.cwd(), 'showcase/dist/showcase-angular/browser');
const LIMIT_BYTES = 1024 * 1024;  // 1 MB gzipped
const LOCALES = ['', 'es', 'de', 'ja', 'ko', 'zh-CN', 'zh-TW'];  // '' = source locale at dist root

let failed = false;
for (const subPath of LOCALES) {
  const localeDir = subPath === '' ? BROWSER_DIR : join(BROWSER_DIR, subPath);
  const entries = readdirSync(localeDir).filter((f) =>
    /^main-[\w-]+\.js$/.test(f)
  );
  if (entries.length === 0) {
    console.error(`No main-*.js found in ${localeDir}`);
    failed = true;
    continue;
  }
  for (const file of entries) {
    const raw = readFileSync(join(localeDir, file));
    const gz = gzipSync(raw);
    const label = subPath === '' ? '(source/en)' : subPath;
    const status = gz.length <= LIMIT_BYTES ? 'OK' : 'FAIL';
    console.log(`  ${label.padEnd(12)} ${file}  raw=${raw.length} gz=${gz.length}  ${status}`);
    if (gz.length > LIMIT_BYTES) failed = true;
  }
}

if (failed) {
  console.error(`Per-locale gzipped budget exceeded (limit ${LIMIT_BYTES} bytes).`);
  process.exit(1);
}
console.log('All locales within gzipped budget.');
