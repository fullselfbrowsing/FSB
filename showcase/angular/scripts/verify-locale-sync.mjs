// Phase 261 / ROUTE-02 CI invariant -- asserts Angular + Express locale registries are in lock-step.
// Invoked from CI before the Angular build. Exits 0 on parity, 1 on drift.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const NG = join(ROOT, 'showcase/angular/src/app/core/i18n/locale-constants.ts');
const EX = join(ROOT, 'showcase/server/src/utils/locale-constants.js');
const SRV = join(ROOT, 'showcase/server/server.js');

function extractLocales(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const match = text.match(/LOCALES\s*[:=]\s*\[([^\]]+)\]/);
  if (!match) {
    throw new Error(`Could not find LOCALES array literal in ${filePath}`);
  }
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

// The 404 handler in server.js carries its own copy table because it renders
// without the Angular app, so it is the one locale list that cannot be derived
// from the registry. Assert it covers every locale rather than letting a new
// one ship an English 404 body under its own <html lang>.
function extractNotFoundLocales(filePath) {
  const text = readFileSync(filePath, 'utf8');
  const match = text.match(/NOT_FOUND_COPY\s*=\s*\{([\s\S]*?)\n\};/);
  if (!match) {
    throw new Error(`Could not find NOT_FOUND_COPY object literal in ${filePath}`);
  }
  return [...match[1].matchAll(/^\s*'([\w-]+)'\s*:/gm)].map((m) => m[1]);
}

const ngLocales = extractLocales(NG);
const exLocales = extractLocales(EX);
const same = ngLocales.length === exLocales.length
  && ngLocales.every((code, i) => code === exLocales[i]);

if (!same) {
  console.error('Locale registry drift detected.');
  console.error('  Angular:', JSON.stringify(ngLocales));
  console.error('  Express:', JSON.stringify(exLocales));
  process.exit(1);
}

const notFoundLocales = extractNotFoundLocales(SRV);
const missingCopy = ngLocales.filter((code) => !notFoundLocales.includes(code));
if (missingCopy.length) {
  console.error('404 copy drift detected in showcase/server/server.js.');
  console.error('  NOT_FOUND_COPY is missing:', JSON.stringify(missingCopy));
  process.exit(1);
}

console.log('Locale registry parity verified:', JSON.stringify(ngLocales));
console.log('404 copy table covers every locale:', JSON.stringify(notFoundLocales));
