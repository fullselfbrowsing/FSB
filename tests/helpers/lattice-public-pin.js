'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_PUBLIC_LATTICE = Object.freeze({
  alias: 'lattice',
  packageName: '@full-self-browsing/lattice',
  packageVersion: '1.4.0',
  packageSpec: 'npm:@full-self-browsing/lattice@1.4.0',
  packageIntegrity: 'sha512-D0cS0YtpjMAkEl03kgg8th9mpUDVnOMJ6QmvW7e8iVIUWmtJ1cYVi7n+eKUmgo21v/waL/qjPBmJ8SlQcjOLww==',
  cliPackageName: '@full-self-browsing/lattice-cli',
  cliPackageVersion: '1.4.0',
  receiptVersion: 'lattice-receipt/v1.3',
  sourceTag: 'v1.4.0',
  sourceSha: 'bb459f88217fc2925b242a49f03bf991d604d43e'
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

function validatePublicLatticePin(repoRoot) {
  const root = repoRoot || path.resolve(__dirname, '..', '..');
  const errors = [];
  const pkg = readJson(path.join(root, 'package.json'));
  const lock = readJson(path.join(root, 'package-lock.json'));
  const pinSrc = fs.readFileSync(path.join(root, '.planning', 'LATTICE-PIN.md'), 'utf8');
  const pin = parseFrontmatter(pinSrc);
  const lockRoot = lock.packages && lock.packages[''];
  const lockAlias = lock.packages && lock.packages['node_modules/lattice'];
  const lockCli = lock.packages && lock.packages['node_modules/@full-self-browsing/lattice-cli'];

  function expect(condition, message) {
    if (!condition) errors.push(message);
  }

  expect(pkg.dependencies && pkg.dependencies.lattice === EXPECTED_PUBLIC_LATTICE.packageSpec,
    'package.json dependencies.lattice must pin the public npm alias');
  expect(pkg.devDependencies && pkg.devDependencies[EXPECTED_PUBLIC_LATTICE.cliPackageName] === EXPECTED_PUBLIC_LATTICE.cliPackageVersion,
    'package.json must pin @full-self-browsing/lattice-cli');
  expect(pkg.engines && /^>=24/.test(pkg.engines.node || ''),
    'package.json engines.node must require Node >=24');

  expect(lockRoot && lockRoot.dependencies && lockRoot.dependencies.lattice === EXPECTED_PUBLIC_LATTICE.packageSpec,
    'package-lock root dependency must pin the public npm alias');
  expect(lockAlias && lockAlias.name === EXPECTED_PUBLIC_LATTICE.packageName,
    'package-lock node_modules/lattice must resolve to @full-self-browsing/lattice');
  expect(lockAlias && lockAlias.version === EXPECTED_PUBLIC_LATTICE.packageVersion,
    'package-lock node_modules/lattice must resolve version ' + EXPECTED_PUBLIC_LATTICE.packageVersion);
  expect(lockAlias && lockAlias.integrity === EXPECTED_PUBLIC_LATTICE.packageIntegrity,
    'package-lock node_modules/lattice integrity must match the ' + EXPECTED_PUBLIC_LATTICE.packageVersion + ' registry tarball');
  expect(lockCli && lockCli.version === EXPECTED_PUBLIC_LATTICE.cliPackageVersion,
    'package-lock must include @full-self-browsing/lattice-cli ' + EXPECTED_PUBLIC_LATTICE.cliPackageVersion);

  expect(pin.current_lattice_source === 'npm',
    'LATTICE-PIN current_lattice_source must be npm');
  expect(pin.current_lattice_package === EXPECTED_PUBLIC_LATTICE.packageName,
    'LATTICE-PIN current_lattice_package must be @full-self-browsing/lattice');
  expect(pin.current_lattice_version === EXPECTED_PUBLIC_LATTICE.packageVersion,
    'LATTICE-PIN current_lattice_version must be ' + EXPECTED_PUBLIC_LATTICE.packageVersion);
  expect(pin.current_lattice_alias === EXPECTED_PUBLIC_LATTICE.alias,
    'LATTICE-PIN current_lattice_alias must be lattice');
  expect(pin.current_lattice_sha === EXPECTED_PUBLIC_LATTICE.sourceSha,
    'LATTICE-PIN current_lattice_sha must match ' + EXPECTED_PUBLIC_LATTICE.sourceTag + ' tag commit');
  expect(pin.current_lattice_tag === EXPECTED_PUBLIC_LATTICE.sourceTag,
    'LATTICE-PIN current_lattice_tag must be ' + EXPECTED_PUBLIC_LATTICE.sourceTag);
  expect(pin.current_lattice_integrity === EXPECTED_PUBLIC_LATTICE.packageIntegrity,
    'LATTICE-PIN current_lattice_integrity must match package-lock');

  expect(!/file:\.\/lattice\/packages\/lattice/.test(JSON.stringify(pkg)),
    'package.json must not reference file:./lattice/packages/lattice');
  expect(!/lattice\/packages\/lattice/.test(JSON.stringify(lock)),
    'package-lock must not reference lattice/packages/lattice');

  return {
    ok: errors.length === 0,
    errors,
    pin,
    packageJson: pkg,
    lockAlias
  };
}

module.exports = {
  EXPECTED_PUBLIC_LATTICE,
  parseFrontmatter,
  validatePublicLatticePin
};
