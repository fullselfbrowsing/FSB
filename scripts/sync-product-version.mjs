#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(
  process.env.FSB_VERSION_SYNC_ROOT || resolve(scriptDirectory, '..'),
);
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const CHROME_COMPONENT_MAX = 65_535;
const pendingWrites = new Map();

const extensionStructuredTargets = Object.freeze([
  'extension/manifest.json',
  'package.json',
  'package-lock.json',
  'showcase/angular/package.json',
  'showcase/angular/package-lock.json',
  'showcase/angular/src/app/core/seo/version.ts',
  'showcase/server/package.json',
  'showcase/server/package-lock.json',
  'skills/fsb/SKILL.md',
]);

const mcpStructuredTargets = Object.freeze([
  'mcp/package.json',
  'mcp/package-lock.json',
  'mcp/server.json',
  'mcp/build/version.d.ts',
  'mcp/build/version.js',
  'mcp/src/version.ts',
  'mcp/native-host/runtime-integrity.json',
]);

const currentSurfaceTargets = Object.freeze([
  'README.md',
  'CHANGELOG.md',
  'extension/README.md',
  'extension/ui/onboarding.js',
  'extension/ui/options.js',
  'extension/ui/sidepanel.js',
  'mcp/README.md',
  'mcp/CHANGELOG.md',
  'mcp/src/index.ts',
  'mcp/src/install.ts',
  'mcp/src/platforms.ts',
  'showcase/about.html',
  'showcase/angular/scripts/llms.source.md',
  'showcase/angular/scripts/llms-full.source.md',
  'showcase/angular/public/llms.txt',
  'showcase/angular/public/llms-full.txt',
  'skills/fsb/references/multi-agent-contract.md',
  'store-assets/chrome-web-store/listing-copy.md',
  '.github/workflows/npm-publish.yml',
  '.github/workflows/chrome-extension.yml',
]);

const allTargets = Object.freeze([...new Set([
  ...extensionStructuredTargets,
  ...mcpStructuredTargets,
  ...currentSurfaceTargets,
])].sort());

const llmsTargets = Object.freeze([
  'showcase/angular/scripts/llms.source.md',
  'showcase/angular/scripts/llms-full.source.md',
  'showcase/angular/public/llms.txt',
  'showcase/angular/public/llms-full.txt',
]);

function absolute(relativePath) {
  return resolve(repositoryRoot, relativePath);
}

function readText(relativePath) {
  if (pendingWrites.has(relativePath)) return pendingWrites.get(relativePath);
  return readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function containsUnpinnedMcpCommand(text) {
  const lines = String(text || '').split(/\r?\n/u);
  return lines.some((line, index) => {
    if (!/fsb-mcp-server(?!@latest)/u.test(line)) return false;
    if (/-y[^\r\n]*fsb-mcp-server(?!@latest)/u.test(line)) return true;
    const previousLine = index > 0 ? lines[index - 1] : '';
    return /-y/u.test(previousLine);
  });
}

function writeText(relativePath, content) {
  const previous = readText(relativePath);
  if (previous === content) return false;
  const diskContent = readFileSync(absolute(relativePath), 'utf8');
  if (diskContent === content) {
    pendingWrites.delete(relativePath);
  } else {
    pendingWrites.set(relativePath, content);
  }
  return true;
}

function writeJson(relativePath, value) {
  return writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stagedBytes(relativePath) {
  return Buffer.from(readText(relativePath), 'utf8');
}

function commitPendingWrites() {
  const originals = new Map();
  const committed = [];
  try {
    for (const [relativePath, content] of pendingWrites) {
      originals.set(relativePath, readFileSync(absolute(relativePath), 'utf8'));
      committed.push(relativePath);
      writeFileSync(absolute(relativePath), content, 'utf8');
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const relativePath of committed.reverse()) {
      try {
        writeFileSync(absolute(relativePath), originals.get(relativePath), 'utf8');
      } catch (rollbackError) {
        rollbackErrors.push(`${relativePath}: ${rollbackError.message}`);
      }
    }
    const rollbackSuffix = rollbackErrors.length > 0
      ? `; rollback also failed for ${rollbackErrors.join(', ')}`
      : '';
    throw new Error(`could not commit version updates: ${error.message}${rollbackSuffix}`);
  } finally {
    pendingWrites.clear();
  }
}

function validateVersion(version, { chrome = false } = {}) {
  const match = VERSION_PATTERN.exec(version || '');
  if (!match) {
    throw new Error(`version must be numeric X.Y.Z without prerelease/build metadata; received ${JSON.stringify(version)}`);
  }
  if (chrome && match.slice(1).map(Number).some((component) => component > CHROME_COMPONENT_MAX)) {
    throw new Error(`each Chrome extension version component must be <= ${CHROME_COMPONENT_MAX}`);
  }
  return version;
}

function setPackageAndLock(packagePath, lockPath, version) {
  const packageJson = readJson(packagePath);
  packageJson.version = version;
  const changed = [writeJson(packagePath, packageJson)];

  const lock = readJson(lockPath);
  lock.version = version;
  if (!lock.packages || !lock.packages['']) {
    throw new Error(`${lockPath} has no root packages entry`);
  }
  lock.packages[''].version = version;
  changed.push(writeJson(lockPath, lock));
  return changed.some(Boolean);
}

function replaceExactly(relativePath, pattern, replacement, label) {
  const source = readText(relativePath);
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`${relativePath}: expected exactly one ${label}; found ${matches?.length || 0}`);
  }
  return writeText(relativePath, source.replace(pattern, replacement));
}

function replaceAllCurrent(relativePath, pattern, replacement, label) {
  const source = readText(relativePath);
  const matches = source.match(pattern);
  if (!matches || matches.length === 0) {
    throw new Error(`${relativePath}: expected at least one ${label}`);
  }
  return writeText(relativePath, source.replace(pattern, replacement));
}

function replaceFirstCurrent(relativePath, pattern, replacement, label) {
  const source = readText(relativePath);
  const firstPattern = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  if (!firstPattern.test(source)) {
    throw new Error(`${relativePath}: expected ${label}`);
  }
  return writeText(relativePath, source.replace(firstPattern, replacement));
}

function collectPreparedExtensionChangelogErrors(version) {
  const current = readText('CHANGELOG.md').match(/^## v(\d+\.\d+\.\d+)\b/mu)?.[1];
  return current === version
    ? []
    : [`latest extension changelog release: expected ${version}, got ${String(current)}`];
}

function collectPreparedMcpChangelogErrors(version) {
  const changelog = readText('mcp/CHANGELOG.md');
  const anchor = changelog.match(/^<a id="v(\d+\.\d+\.\d+)"><\/a>$/mu)?.[1];
  const heading = changelog.match(/^## (\d+\.\d+\.\d+) \(/mu)?.[1];
  const errors = [];
  if (heading !== version) {
    errors.push(`latest MCP changelog release: expected ${version}, got ${String(heading)}`);
  }
  if (anchor !== version) {
    errors.push(`latest MCP changelog anchor: expected ${version}, got ${String(anchor)}`);
  }
  return errors;
}

function assertPreparedChangelog(domain, version) {
  const errors = domain === 'extension'
    ? collectPreparedExtensionChangelogErrors(version)
    : collectPreparedMcpChangelogErrors(version);
  if (errors.length > 0) {
    throw new Error(`author the ${version} entry at the top of ${domain === 'extension' ? 'CHANGELOG.md' : 'mcp/CHANGELOG.md'} before version:set:${domain}:\n- ${errors.join('\n- ')}`);
  }
}

function setLlmsExtensionSurfaces(version) {
  const changed = [];
  for (const relativePath of llmsTargets) {
    let source = readText(relativePath);
    const releasePattern = /Current release: FSB v\d+\.\d+\.\d+/gu;
    if ((source.match(releasePattern) || []).length !== 1) {
      throw new Error(`${relativePath}: expected one current FSB release sentence`);
    }
    source = source.replace(releasePattern, `Current release: FSB v${version}`);
    const skillPattern = /Frontmatter ships with `name: fsb`, `version: \d+\.\d+\.\d+`/gu;
    if (relativePath.includes('llms-full')) {
      if ((source.match(skillPattern) || []).length !== 1) {
        throw new Error(`${relativePath}: expected one current FSB skill version sentence`);
      }
      source = source.replace(
        skillPattern,
        `Frontmatter ships with \`name: fsb\`, \`version: ${version}\``,
      );
    }
    changed.push(writeText(relativePath, source));
  }
  return changed.some(Boolean);
}

function setLlmsMcpSurfaces(version) {
  const changed = [];
  for (const relativePath of llmsTargets) {
    const source = readText(relativePath);
    const pattern = /with fsb-mcp-server \d+\.\d+\.\d+/gu;
    if ((source.match(pattern) || []).length !== 1) {
      throw new Error(`${relativePath}: expected one current MCP release sentence`);
    }
    changed.push(writeText(
      relativePath,
      source.replace(pattern, `with fsb-mcp-server ${version}`),
    ));
  }
  return changed.some(Boolean);
}

function setMcpReadmeSurfaces(extensionVersion, mcpVersion) {
  const changed = [];
  changed.push(replaceFirstCurrent(
    'mcp/README.md',
    /^### What's New In v\d+\.\d+\.\d+$/gmu,
    `### What's New In v${mcpVersion}`,
    'MCP README current release heading',
  ));
  changed.push(replaceExactly(
    'mcp/README.md',
    /^- \*\*(?:Unified product version|Compatibility):\*\* .*$/gmu,
    `- **Compatibility:** \`fsb-mcp-server\` ${mcpVersion} requires FSB extension ${extensionVersion} or newer for \`mcp:task-status\`. Upgrade the extension and restart the MCP host together.`,
    'MCP README current compatibility summary',
  ));
  changed.push(replaceExactly(
    'mcp/README.md',
    /^(?:The FSB extension manifest is the canonical product version\.|The MCP package has its own version).*$/gmu,
    `The MCP package has its own version (\`${mcpVersion}\`) because it is published independently from the extension release (\`${extensionVersion}\`). Use \`npm run version:set:mcp -- X.Y.Z\` for MCP releases and \`npm run version:set:extension -- X.Y.Z\` for extension releases; \`npm run version:check\` verifies both domains without requiring them to match.`,
    'MCP README versioning policy',
  ));
  changed.push(replaceExactly(
    'mcp/README.md',
    /^Compatibility for this release: .*$/gmu,
    `Compatibility for this release: MCP ${mcpVersion} requires extension ${extensionVersion} or newer for the \`mcp:task-status\` route used by \`complete_task\`, \`partial_task\`, and \`fail_task\`. Existing \`0.10.0\` tool routes remain additive and unchanged.`,
    'MCP README compatibility pair',
  ));
  changed.push(replaceExactly(
    'mcp/README.md',
    /^### Releasing \d+\.\d+\.\d+$/gmu,
    `### Releasing ${mcpVersion}`,
    'MCP README release heading',
  ));
  changed.push(replaceExactly(
    'mcp/README.md',
    /^This .* build is release-prep ready\..*$/gmu,
    `This ${mcpVersion} build is release-prep ready. The actual \`npm publish\` remains user-gated through the MCP-only tag workflow.`,
    'MCP README release-prep version',
  ));
  changed.push(replaceExactly(
    'mcp/README.md',
    /^- Preferred: .*tag workflow.*$/gmu,
    `- Preferred: after merging to \`main\`, run the MCP-only tag workflow (\`git tag mcp-v${mcpVersion} && git push origin mcp-v${mcpVersion}\`). It publishes the verified npm artifact and creates the MCP GitHub release.`,
    'MCP README release tag guidance',
  ));
  return changed.some(Boolean);
}

function setExtensionPublicSurfaces(version) {
  const changed = [];
  changed.push(replaceExactly(
    'README.md',
    /^# FSB v\d+\.\d+\.\d+ Full Self Browsing$/gmu,
    `# FSB v${version} Full Self Browsing`,
    'current README title',
  ));
  changed.push(replaceExactly(
    'README.md',
    /version-\d+\.\d+\.\d+-0078D4/gmu,
    `version-${version}-0078D4`,
    'current README version badge',
  ));
  changed.push(replaceExactly(
    'README.md',
    /^> FSB v\d+\.\d+\.\d+ is functional/gmu,
    `> FSB v${version} is functional`,
    'current README release notice',
  ));
  changed.push(replaceExactly(
    'extension/README.md',
    /FSB v\d+\.\d+\.\d+/gu,
    `FSB v${version}`,
    'extension README current version',
  ));
  changed.push(replaceExactly(
    'store-assets/chrome-web-store/listing-copy.md',
    /^FSB v\d+\.\d+\.\d+$/gmu,
    `FSB v${version}`,
    'store listing current version',
  ));
  changed.push(replaceExactly(
    'skills/fsb/references/multi-agent-contract.md',
    /current as of v\d+\.\d+\.\d+/gu,
    `current as of v${version}`,
    'skill contract current version',
  ));
  changed.push(replaceAllCurrent(
    'showcase/about.html',
    /FSB v\d+\.\d+\.\d+/gu,
    `FSB v${version}`,
    'legacy showcase current version',
  ));
  changed.push(setLlmsExtensionSurfaces(version));
  return changed.some(Boolean);
}

function setExtensionVersion(version) {
  validateVersion(version, { chrome: true });
  assertPreparedChangelog('extension', version);
  const changed = [];

  const manifest = readJson('extension/manifest.json');
  manifest.version = version;
  manifest.name = `FSB v${version}`;
  changed.push(writeJson('extension/manifest.json', manifest));

  const rootPackage = readJson('package.json');
  rootPackage.version = version;
  rootPackage.scripts.package = 'npm run package:extension';
  const versionBadge = Array.isArray(rootPackage.badges)
    ? rootPackage.badges.find((badge) => badge?.description === 'Version')
    : null;
  if (!versionBadge) throw new Error('package.json has no Version badge');
  versionBadge.url = `https://img.shields.io/badge/version-${version}-blue.svg`;
  changed.push(writeJson('package.json', rootPackage));

  const rootLock = readJson('package-lock.json');
  rootLock.version = version;
  if (!rootLock.packages?.['']) throw new Error('package-lock.json has no root packages entry');
  rootLock.packages[''].version = version;
  changed.push(writeJson('package-lock.json', rootLock));

  changed.push(setPackageAndLock(
    'showcase/angular/package.json',
    'showcase/angular/package-lock.json',
    version,
  ));
  changed.push(setPackageAndLock(
    'showcase/server/package.json',
    'showcase/server/package-lock.json',
    version,
  ));
  changed.push(replaceExactly(
    'skills/fsb/SKILL.md',
    /^version: \d+\.\d+\.\d+$/gmu,
    `version: ${version}`,
    'skill frontmatter version',
  ));
  changed.push(replaceExactly(
    'showcase/angular/src/app/core/seo/version.ts',
    /APP_VERSION = '\d+\.\d+\.\d+'/gu,
    `APP_VERSION = '${version}'`,
    'Angular APP_VERSION',
  ));
  changed.push(setExtensionPublicSurfaces(version));
  changed.push(setMcpReadmeSurfaces(version, readJson('mcp/package.json').version));
  return changed.some(Boolean);
}

function setMcpVersion(version) {
  validateVersion(version);
  assertPreparedChangelog('mcp', version);
  const changed = [];

  changed.push(setPackageAndLock('mcp/package.json', 'mcp/package-lock.json', version));
  const server = readJson('mcp/server.json');
  server.version = version;
  if (!Array.isArray(server.packages) || server.packages.length !== 1) {
    throw new Error('mcp/server.json must contain exactly one package entry');
  }
  server.packages[0].version = version;
  changed.push(writeJson('mcp/server.json', server));
  changed.push(replaceExactly(
    'mcp/src/version.ts',
    /FSB_MCP_VERSION = '\d+\.\d+\.\d+'/gu,
    `FSB_MCP_VERSION = '${version}'`,
    'MCP runtime version constant',
  ));
  changed.push(replaceExactly(
    'mcp/build/version.js',
    /FSB_MCP_VERSION = '\d+\.\d+\.\d+'/gu,
    `FSB_MCP_VERSION = '${version}'`,
    'compiled MCP runtime version constant',
  ));
  changed.push(replaceExactly(
    'mcp/build/version.d.ts',
    /FSB_MCP_VERSION = "\d+\.\d+\.\d+"/gu,
    `FSB_MCP_VERSION = "${version}"`,
    'compiled MCP declaration version constant',
  ));

  const integrity = readJson('mcp/native-host/runtime-integrity.json');
  integrity.packageVersion = version;
  integrity.lockSha256 = sha256(stagedBytes('mcp/package-lock.json'));
  changed.push(writeJson('mcp/native-host/runtime-integrity.json', integrity));
  changed.push(setLlmsMcpSurfaces(version));
  changed.push(setMcpReadmeSurfaces(readJson('extension/manifest.json').version, version));
  return changed.some(Boolean);
}

function collectParityErrors() {
  const errors = [];
  const manifest = readJson('extension/manifest.json');
  const extensionVersion = manifest.version;
  const mcpVersion = readJson('mcp/package.json').version;
  try {
    validateVersion(extensionVersion, { chrome: true });
  } catch (error) {
    errors.push(`extension: ${error.message}`);
  }
  try {
    validateVersion(mcpVersion);
  } catch (error) {
    errors.push(`MCP: ${error.message}`);
  }

  const equal = (actual, expected, label) => {
    if (actual !== expected) errors.push(`${label}: expected ${expected}, got ${String(actual)}`);
  };
  const contains = (relativePath, snippet, label) => {
    if (!readText(relativePath).includes(snippet)) {
      errors.push(`${label}: missing ${JSON.stringify(snippet)}`);
    }
  };
  const checkPackageAndLock = (packagePath, lockPath, expected, label) => {
    const packageJson = readJson(packagePath);
    const lock = readJson(lockPath);
    equal(packageJson.version, expected, `${label} version`);
    equal(lock.version, expected, `${label} lock top-level version`);
    equal(lock.packages?.['']?.version, expected, `${label} lock root version`);
  };

  equal(manifest.name, `FSB v${extensionVersion}`, 'extension manifest name');
  for (const [packagePath, lockPath, label] of [
    ['package.json', 'package-lock.json', 'root package'],
    ['showcase/angular/package.json', 'showcase/angular/package-lock.json', 'Angular showcase'],
    ['showcase/server/package.json', 'showcase/server/package-lock.json', 'showcase server'],
  ]) {
    checkPackageAndLock(packagePath, lockPath, extensionVersion, label);
  }
  checkPackageAndLock('mcp/package.json', 'mcp/package-lock.json', mcpVersion, 'MCP package');

  const rootPackage = readJson('package.json');
  equal(rootPackage.scripts?.package, 'npm run package:extension', 'root package command');
  equal(
    rootPackage.badges?.find((badge) => badge?.description === 'Version')?.url,
    `https://img.shields.io/badge/version-${extensionVersion}-blue.svg`,
    'root package version badge',
  );
  contains('package.json', '"version:set:extension"', 'extension version setter script');
  contains('package.json', '"version:set:mcp"', 'MCP version setter script');

  const server = readJson('mcp/server.json');
  equal(server.version, mcpVersion, 'MCP server metadata version');
  equal(server.packages?.[0]?.version, mcpVersion, 'MCP server package version');
  contains('mcp/src/version.ts', `FSB_MCP_VERSION = '${mcpVersion}'`, 'MCP runtime version');
  contains('mcp/build/version.js', `FSB_MCP_VERSION = '${mcpVersion}'`, 'compiled MCP runtime version');
  contains('mcp/build/version.d.ts', `FSB_MCP_VERSION = "${mcpVersion}"`, 'compiled MCP declaration version');
  contains('skills/fsb/SKILL.md', `version: ${extensionVersion}`, 'skill frontmatter');
  contains(
    'showcase/angular/src/app/core/seo/version.ts',
    `APP_VERSION = '${extensionVersion}'`,
    'Angular APP_VERSION',
  );

  const integrity = readJson('mcp/native-host/runtime-integrity.json');
  equal(integrity.packageVersion, mcpVersion, 'native runtime integrity package version');
  equal(integrity.lockSha256, sha256(stagedBytes('mcp/package-lock.json')), 'native runtime integrity lock hash');

  contains('README.md', `# FSB v${extensionVersion} Full Self Browsing`, 'root README title');
  contains('README.md', `version-${extensionVersion}-0078D4`, 'root README badge');
  contains('extension/README.md', `FSB v${extensionVersion}`, 'extension README');
  contains('store-assets/chrome-web-store/listing-copy.md', `FSB v${extensionVersion}`, 'store listing');
  contains('skills/fsb/references/multi-agent-contract.md', `current as of v${extensionVersion}`, 'skill contract');
  for (const relativePath of llmsTargets) {
    contains(relativePath, `Current release: FSB v${extensionVersion}`, `${relativePath} extension release`);
    contains(relativePath, `with fsb-mcp-server ${mcpVersion}`, `${relativePath} MCP release`);
    if (relativePath.includes('llms-full')) {
      contains(relativePath, `\`version: ${extensionVersion}\``, `${relativePath} skill release`);
    }
  }

  const mcpReadme = readText('mcp/README.md');
  const mcpHeadings = [...mcpReadme.matchAll(/^### What's New In v(\d+\.\d+\.\d+)$/gmu)]
    .map((match) => match[1]);
  equal(mcpHeadings[0], mcpVersion, 'MCP README current release heading');
  if (new Set(mcpHeadings).size !== mcpHeadings.length) {
    errors.push('MCP README contains duplicate What\'s New release headings');
  }
  contains(
    'mcp/README.md',
    `MCP ${mcpVersion} requires extension ${extensionVersion} or newer`,
    'MCP README compatibility pair',
  );
  contains('mcp/README.md', `### Releasing ${mcpVersion}`, 'MCP README release heading');
  contains(
    'mcp/README.md',
    `git tag mcp-v${mcpVersion} && git push origin mcp-v${mcpVersion}`,
    'MCP release tag guidance',
  );
  contains(
    'CHANGELOG.md',
    `The extension version is \`${extensionVersion}\``,
    'extension changelog current-version summary',
  );
  contains(
    'mcp/CHANGELOG.md',
    `fsb-mcp-server@${mcpVersion}`,
    'MCP changelog current publish artifact',
  );
  errors.push(...collectPreparedExtensionChangelogErrors(extensionVersion));
  errors.push(...collectPreparedMcpChangelogErrors(mcpVersion));

  const mcpWorkflow = readText('.github/workflows/npm-publish.yml');
  if (!mcpWorkflow.includes("- 'mcp-v*'")) errors.push('MCP release workflow does not trigger on mcp-v* tags');
  if (mcpWorkflow.includes("- 'extension-v*'") || /^\s+- 'v\*'$/mu.test(mcpWorkflow)) {
    errors.push('MCP release workflow contains a non-MCP release tag trigger');
  }
  const extensionWorkflow = readText('.github/workflows/chrome-extension.yml');
  if (!extensionWorkflow.includes("- 'extension-v*'")) {
    errors.push('extension release workflow does not trigger on extension-v* tags');
  }
  if (extensionWorkflow.includes("- 'mcp-v*'") || /^\s+- 'v\*'$/mu.test(extensionWorkflow)) {
    errors.push('extension release workflow contains a non-extension release tag trigger');
  }
  contains(
    '.github/workflows/npm-publish.yml',
    'mcp-v${{ steps.package-version.outputs.version }}',
    'MCP workflow tag binding',
  );
  contains(
    '.github/workflows/chrome-extension.yml',
    'extension-v${{ steps.extension-version.outputs.version }}',
    'extension workflow tag binding',
  );

  for (const relativePath of [
    'README.md',
    'extension/ui/onboarding.js',
    'extension/ui/sidepanel.js',
    'mcp/README.md',
    'mcp/src/index.ts',
    'mcp/src/install.ts',
    'mcp/src/platforms.ts',
    'skills/fsb/SKILL.md',
    'showcase/angular/scripts/llms.source.md',
    'showcase/angular/scripts/llms-full.source.md',
  ]) {
    if (containsUnpinnedMcpCommand(readText(relativePath))) {
      errors.push(`${relativePath}: contains an unpinned npx MCP command`);
    }
  }
  contains('mcp/src/install.ts', "STDIO_COMMAND = 'npx -y fsb-mcp-server@latest'", 'generated MCP stdio configuration');
  contains('mcp/src/platforms.ts', "args: ['-y', 'fsb-mcp-server@latest']", 'generated platform configuration');
  contains('extension/ui/onboarding.js', 'chrome.runtime.getManifest().version', 'extension onboarding manifest version');
  contains('extension/ui/options.js', 'chrome.runtime.getManifest().version', 'extension dashboard manifest version');

  return { extensionVersion, mcpVersion, errors };
}

function collectManagedSurfaceErrors(extensionVersion, mcpVersion) {
  if (pendingWrites.size > 0) {
    throw new Error('managed surface drift check requires an empty staging area');
  }
  try {
    setExtensionVersion(extensionVersion);
    setMcpVersion(mcpVersion);
    return [...pendingWrites.keys()].map(
      (relativePath) => `${relativePath}: differs from the independent version setters`,
    );
  } catch (error) {
    return [`managed release surface preflight failed: ${error.message}`];
  } finally {
    pendingWrites.clear();
  }
}

function assertVersionParity({ checkManagedSurfaces = false } = {}) {
  const { extensionVersion, mcpVersion, errors } = collectParityErrors();
  if (checkManagedSurfaces) {
    errors.push(...collectManagedSurfaceErrors(extensionVersion, mcpVersion));
  }
  if (errors.length > 0) {
    throw new Error(
      `independent version parity failed (extension ${extensionVersion || 'unknown'}, MCP ${mcpVersion || 'unknown'}):\n- ${errors.join('\n- ')}`,
    );
  }
  return { extensionVersion, mcpVersion };
}

function printTargets() {
  console.log(JSON.stringify(allTargets, null, 2));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--check') {
    const { extensionVersion, mcpVersion } = assertVersionParity({ checkManagedSurfaces: true });
    console.log(`version-check: extension ${extensionVersion}; MCP ${mcpVersion}`);
    return;
  }
  if (args.length === 1 && args[0] === '--print-targets') {
    printTargets();
    return;
  }
  if (args.length !== 2 || !['extension', 'mcp'].includes(args[0])) {
    throw new Error('usage: sync-product-version.mjs extension <X.Y.Z> | mcp <X.Y.Z> | --check | --print-targets');
  }

  const [domain, requestedVersion] = args;
  const version = validateVersion(requestedVersion, { chrome: domain === 'extension' });
  const changed = domain === 'extension'
    ? setExtensionVersion(version)
    : setMcpVersion(version);
  const versions = {
    extensionVersion: readJson('extension/manifest.json').version,
    mcpVersion: readJson('mcp/package.json').version,
  };
  commitPendingWrites();
  console.log(`version-check: extension ${versions.extensionVersion}; MCP ${versions.mcpVersion}`);
  console.log(`version-set:${domain}: ${changed ? 'updated' : 'already synchronized at'} ${version}`);
}

try {
  for (const relativePath of allTargets) {
    if (!existsSync(absolute(relativePath))) {
      throw new Error(`required version target is missing: ${relativePath}`);
    }
  }
  main();
} catch (error) {
  pendingWrites.clear();
  console.error(`version-sync: ${error.message}`);
  process.exitCode = 1;
}
