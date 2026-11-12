#!/usr/bin/env node
/**
 * Archive once, export twice.
 *
 * FSB ships the Safari app through BOTH channels, so the two must come from
 * the SAME archive -- never a forked project. Only the export step differs.
 *
 *   developer-id : signed + notarized, distributed from full-selfbrowsing.com
 *   app-store    : uploaded to App Store Connect
 *
 * Ship developer-id first. App Review is a genuine risk for FSB (<all_urls>
 * host permissions, nativeMessaging, a localhost socket to an out-of-band MCP
 * server, and browser automation as the core function), so the launch should
 * not depend on it.
 *
 * Usage:
 *   node scripts/release-safari.mjs --archive
 *   node scripts/release-safari.mjs --export=developer-id [--notarize --profile=<keychain-profile>]
 *   node scripts/release-safari.mjs --export=app-store
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROJECT = join(ROOT, 'safari', 'FSB', 'FSB.xcodeproj');
const OUT = join(ROOT, 'build', 'safari-release');
const ARCHIVE = join(OUT, 'FSB.xcarchive');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const val = (f) => { const h = argv.find((a) => a.startsWith(`--${f}=`)); return h ? h.slice(f.length + 3) : null; };

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}\n`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
}

if (!existsSync(PROJECT)) {
  console.error(`release-safari: ${PROJECT} not found. Scaffold it first (see safari/README.md).`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

if (has('archive')) {
  // Refresh the extension payload + version stamp before archiving so the
  // bundle can never ship a stale build/safari.
  run('npm', ['run', 'build:safari']);
  run('xcodebuild', ['archive', '-project', PROJECT, '-scheme', 'FSB',
                     '-configuration', 'Release', '-archivePath', ARCHIVE]);
  console.log(`\nrelease-safari: archived -> ${ARCHIVE}`);
}

const exportKind = val('export');
if (exportKind) {
  const plist = exportKind === 'app-store'
    ? join(ROOT, 'safari', 'Config', 'ExportOptions-AppStore.plist')
    : join(ROOT, 'safari', 'Config', 'ExportOptions-DeveloperID.plist');
  const dest = join(OUT, exportKind);
  run('xcodebuild', ['-exportArchive', '-archivePath', ARCHIVE,
                     '-exportOptionsPlist', plist, '-exportPath', dest]);
  console.log(`\nrelease-safari: exported ${exportKind} -> ${dest}`);

  if (has('notarize')) {
    const profile = val('profile');
    if (!profile) {
      console.error('release-safari: --notarize requires --profile=<notarytool keychain profile>');
      process.exit(1);
    }
    const zip = join(dest, 'FSB.zip');
    run('ditto', ['-c', '-k', '--keepParent', join(dest, 'FSB.app'), zip]);
    run('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', profile, '--wait']);
    run('xcrun', ['stapler', 'staple', join(dest, 'FSB.app')]);
    console.log('\nrelease-safari: notarized + stapled');
  }
}

if (!has('archive') && !exportKind) {
  console.log('release-safari: nothing to do. Pass --archive and/or --export=developer-id|app-store');
}
