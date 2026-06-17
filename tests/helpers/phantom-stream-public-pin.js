'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_PUBLIC_PHANTOM_STREAM = Object.freeze({
  packageName: '@full-self-browsing/phantom-stream',
  packageVersion: '0.1.0',
  packageSpec: '0.1.0',
  packageIntegrity: 'sha512-Hf6K0bjAT5M9dUs7Xw1NB2Cb8hkmiMz7KDO0rq5mRkDKmQnLY1sTqTXwIX2r5gjLKVkl3TCemr3hSucVc1k69g==',
  packageTarball: 'https://registry.npmjs.org/@full-self-browsing/phantom-stream/-/phantom-stream-0.1.0.tgz',
  packageShasum: '87e203e2d1a0f5ef097c8b4aba5fe854a6fe134d',
  stalePackageName: '@fullselfbrowsing/phantom-stream'
});

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!match) return out;
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validatePublicPhantomStreamPin(repoRoot) {
  const root = repoRoot || path.resolve(__dirname, '..', '..');
  const errors = [];
  const pkg = readJson(path.join(root, 'package.json'));
  const lock = readJson(path.join(root, 'package-lock.json'));
  const pinSrc = fs.readFileSync(path.join(root, '.planning', 'PHANTOMSTREAM-PIN.md'), 'utf8');
  const pin = parseFrontmatter(pinSrc);
  const lockRoot = lock.packages && lock.packages[''];
  const lockPackage = lock.packages && lock.packages['node_modules/@full-self-browsing/phantom-stream'];

  function expect(condition, message) {
    if (!condition) errors.push(message);
  }

  expect(pkg.dependencies && pkg.dependencies[EXPECTED_PUBLIC_PHANTOM_STREAM.packageName] === EXPECTED_PUBLIC_PHANTOM_STREAM.packageSpec,
    'package.json must pin @full-self-browsing/phantom-stream exactly');
  expect(!JSON.stringify(pkg).includes(EXPECTED_PUBLIC_PHANTOM_STREAM.stalePackageName),
    'package.json must not reference stale @fullselfbrowsing/phantom-stream');

  expect(lockRoot && lockRoot.dependencies && lockRoot.dependencies[EXPECTED_PUBLIC_PHANTOM_STREAM.packageName] === EXPECTED_PUBLIC_PHANTOM_STREAM.packageSpec,
    'package-lock root dependency must pin @full-self-browsing/phantom-stream exactly');
  expect(lockPackage && lockPackage.version === EXPECTED_PUBLIC_PHANTOM_STREAM.packageVersion,
    'package-lock package entry must resolve version ' + EXPECTED_PUBLIC_PHANTOM_STREAM.packageVersion);
  expect(lockPackage && lockPackage.resolved === EXPECTED_PUBLIC_PHANTOM_STREAM.packageTarball,
    'package-lock package entry must use the approved registry tarball');
  expect(lockPackage && lockPackage.integrity === EXPECTED_PUBLIC_PHANTOM_STREAM.packageIntegrity,
    'package-lock package entry must match the approved registry integrity');
  expect(!JSON.stringify(lock).includes(EXPECTED_PUBLIC_PHANTOM_STREAM.stalePackageName),
    'package-lock must not reference stale @fullselfbrowsing/phantom-stream');

  expect(pin.current_phantomstream_source === 'npm',
    'PHANTOMSTREAM-PIN current_phantomstream_source must be npm');
  expect(pin.current_phantomstream_package === EXPECTED_PUBLIC_PHANTOM_STREAM.packageName,
    'PHANTOMSTREAM-PIN current_phantomstream_package must be @full-self-browsing/phantom-stream');
  expect(pin.current_phantomstream_version === EXPECTED_PUBLIC_PHANTOM_STREAM.packageVersion,
    'PHANTOMSTREAM-PIN current_phantomstream_version must be ' + EXPECTED_PUBLIC_PHANTOM_STREAM.packageVersion);
  expect(pin.current_phantomstream_integrity === EXPECTED_PUBLIC_PHANTOM_STREAM.packageIntegrity,
    'PHANTOMSTREAM-PIN current_phantomstream_integrity must match package-lock');
  expect(pin.current_phantomstream_tarball === EXPECTED_PUBLIC_PHANTOM_STREAM.packageTarball,
    'PHANTOMSTREAM-PIN current_phantomstream_tarball must match package-lock');
  expect(pin.current_phantomstream_shasum === EXPECTED_PUBLIC_PHANTOM_STREAM.packageShasum,
    'PHANTOMSTREAM-PIN current_phantomstream_shasum must match npm metadata');
  expect(pin.rejected_phantomstream_package === EXPECTED_PUBLIC_PHANTOM_STREAM.stalePackageName,
    'PHANTOMSTREAM-PIN rejected_phantomstream_package must record stale package name');
  expect(/E404/.test(pin.rejected_phantomstream_status || ''),
    'PHANTOMSTREAM-PIN rejected_phantomstream_status must record E404');

  return {
    ok: errors.length === 0,
    errors,
    pin,
    packageJson: pkg,
    lockPackage
  };
}

module.exports = {
  EXPECTED_PUBLIC_PHANTOM_STREAM,
  parseFrontmatter,
  validatePublicPhantomStreamPin
};
