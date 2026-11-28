// Static checks for the Claude plugin folder (plugins/claude). They mirror the
// Claude plugin directory's pre-submission checklist where it can be checked
// offline: layout, manifest and name rules, the exact npm launcher pin, skill
// front matter, README disclosures and file hygiene. Used by
// tests/claude-plugin-spec.test.js and scripts/export-claude-plugin.mjs.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const CLAUDE_PLUGIN_NAME = 'full-self-browsing';
export const CLAUDE_PLUGIN_SERVER_NAME = 'fsb';

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const RESERVED_WHOLE_NAMES = new Set([
  'claude', 'anthropic', 'anthropics', 'claude-code', 'claude-mods',
  'official', 'plugin', 'mcp', 'test',
]);
const RESERVED_PREFIXES = ['claude-', 'anthropic-', 'anthropics-', 'cc-plugin-'];
const BRAND_WORDS = /(?:^|-)(?:claude|anthropic|anthropics)(?:-|$)/u;
const SKILL_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const FORBIDDEN_NAMES = new Set([
  '.DS_Store', 'Thumbs.db', 'desktop.ini', '__MACOSX', '.gitattributes', '.gitmodules',
  '.npmrc', '.yarnrc', '.yarnrc.yml', 'bunfig.toml', 'uv.toml', 'pip.conf',
]);
const FORBIDDEN_ROOT_DIRS = new Set(['bin', 'hooks', 'node_modules']);
const TEXT_EXTENSIONS = new Set(['.md', '.json']);
const TEXT_BASENAMES = new Set(['LICENSE']);
const IMAGE_EXTENSIONS = new Set(['.png']);
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u;
const MAX_FILES = 512;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_ANY_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const HTTPS_FIELDS = ['homepage', 'documentationUrl', 'supportUrl', 'privacyPolicyUrl'];
const UNSUPPORTED_MANIFEST_KEYS = ['engines', 'hooks', 'userConfig', 'experimental'];
const README_DISCLOSURES = [
  'registry.npmjs.org',
  '127.0.0.1:7225',
  '~/.fsb',
  '--version',
  'telemetry',
  'full-selfbrowsing.com/privacy',
  'claude mcp remove fsb',
];
// Backticked snake_case words in the skill and README that are argument
// names, not tools.
const NON_TOOL_IDENTIFIERS = new Set(['tab_id', 'visual_reason', 'is_final']);

function extensionOf(name) {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index) : '';
}

function isCanonicalJson(text) {
  try {
    return text === `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
  } catch {
    return false;
  }
}

function walk(root) {
  const entries = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      // A checkout of the published plugin repository carries its own .git.
      if (directory === root && name === '.git') continue;
      const absolutePath = join(directory, name);
      const stats = lstatSync(absolutePath);
      const relativePath = relative(root, absolutePath).split(sep).join('/');
      entries.push({ name, absolutePath, relativePath, stats });
      if (stats.isDirectory()) visit(absolutePath);
    }
  };
  visit(root);
  return entries;
}

function parseFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const field = /^([A-Za-z][\w-]*):\s?(.*)$/u.exec(line);
    if (!field) return null;
    fields[field[1]] = field[2];
  }
  return fields;
}

function wordsOutsideCode(markdown) {
  const prose = markdown.replace(/```[\s\S]*?```/gu, ' ');
  return prose.split(/\s+/u).filter((word) => /[A-Za-z]/u.test(word)).length;
}

function backtickedSnakeCase(markdown) {
  const names = new Set();
  for (const match of markdown.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/gu)) {
    names.add(match[1]);
  }
  return [...names];
}

function checkName(name, label, errors) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    errors.push(`${label} must be lowercase letters, digits and hyphens (max 64), got ${JSON.stringify(name)}`);
    return;
  }
  if (RESERVED_WHOLE_NAMES.has(name)) errors.push(`${label} uses a reserved name: ${name}`);
  if (RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    errors.push(`${label} starts with a reserved prefix: ${name}`);
  }
  if (BRAND_WORDS.test(name)) errors.push(`${label} contains a reserved brand word: ${name}`);
}

function checkAscii(text, label, errors) {
  // eslint-disable-next-line no-control-regex
  if (/[^\x09\x0a\x0d\x20-\x7e]/u.test(text)) errors.push(`${label} must be ASCII text`);
}

/**
 * Returns a list of problems with the plugin folder. An empty list means the
 * folder passes every offline check.
 *
 * @param {string} pluginRoot absolute path of the plugin folder
 * @param {{ mcpVersion: string, toolNames?: string[] }} options
 */
export function collectClaudePluginErrors(pluginRoot, { mcpVersion, toolNames } = {}) {
  const errors = [];
  const read = (relativePath) => readFileSync(join(pluginRoot, relativePath), 'utf8');
  const readJsonFile = (relativePath) => {
    const text = read(relativePath);
    if (!isCanonicalJson(text)) {
      errors.push(`${relativePath} must be valid JSON in JSON.stringify(value, null, 2) form with a final newline`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  let entries;
  try {
    entries = walk(pluginRoot);
  } catch (error) {
    return [`cannot read plugin folder: ${error.message}`];
  }
  const files = entries.filter((entry) => entry.stats.isFile());
  const present = new Set(files.map((entry) => entry.relativePath));
  for (const required of [
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    '.mcp.json',
    'README.md',
    'LICENSE',
    'SECURITY.md',
    'skills/fsb/SKILL.md',
  ]) {
    if (!present.has(required)) errors.push(`missing ${required}`);
  }
  if (errors.length > 0) return errors;

  // File hygiene.
  if (files.length > MAX_FILES) errors.push(`plugin has ${files.length} files; keep it at ${MAX_FILES} or fewer`);
  for (const entry of entries) {
    const { name, relativePath, stats } = entry;
    if (stats.isSymbolicLink()) errors.push(`${relativePath} is a symlink`);
    if (FORBIDDEN_NAMES.has(name)) errors.push(`${relativePath} must not be in the plugin`);
    if (!SEGMENT_PATTERN.test(name)) errors.push(`${relativePath} has characters outside letters, digits, dots, hyphens and underscores`);
    if (stats.isDirectory() && !relativePath.includes('/') && FORBIDDEN_ROOT_DIRS.has(name)) {
      errors.push(`${relativePath}/ must not be in the plugin`);
    }
    if (!stats.isFile()) continue;
    const extension = extensionOf(name);
    if (stats.size > MAX_ANY_BYTES) errors.push(`${relativePath} is larger than 5 MiB`);
    if (IMAGE_EXTENSIONS.has(extension)) {
      const bytes = readFileSync(entry.absolutePath);
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE) || !bytes.subarray(-8).equals(PNG_END)) {
        errors.push(`${relativePath} is not a complete PNG`);
      }
    } else if (TEXT_EXTENSIONS.has(extension) || TEXT_BASENAMES.has(name)) {
      if (stats.size > MAX_TEXT_BYTES) errors.push(`${relativePath} is larger than 256 KiB`);
      checkAscii(readFileSync(entry.absolutePath, 'utf8'), relativePath, errors);
    } else {
      errors.push(`${relativePath} has an unsupported file type`);
    }
  }

  // Manifest.
  const manifest = readJsonFile('.claude-plugin/plugin.json');
  if (manifest) {
    checkName(manifest.name, 'plugin name', errors);
    if (manifest.name !== CLAUDE_PLUGIN_NAME) errors.push(`plugin name must stay ${CLAUDE_PLUGIN_NAME}; it is permanent once listed`);
    if (mcpVersion && manifest.version !== mcpVersion) {
      errors.push(`plugin version must equal the MCP version ${mcpVersion}, got ${String(manifest.version)}`);
    }
    for (const field of ['displayName', 'description', 'license']) {
      if (typeof manifest[field] !== 'string' || !manifest[field].trim()) errors.push(`plugin.json needs ${field}`);
    }
    if (typeof manifest.author?.name !== 'string' || !manifest.author.name.trim()) errors.push('plugin.json needs author.name');
    checkAscii(`${manifest.displayName ?? ''}${manifest.author?.name ?? ''}`, 'displayName and author.name', errors);
    for (const field of HTTPS_FIELDS) {
      if (typeof manifest[field] !== 'string' || !manifest[field].startsWith('https://')) {
        errors.push(`plugin.json ${field} must be an https:// URL`);
      }
    }
    if (typeof manifest.icon !== 'string' || !manifest.icon.startsWith('./') || !present.has(manifest.icon.slice(2))) {
      errors.push('plugin.json icon must be a ./ path to an image inside the plugin');
    }
    for (const key of UNSUPPORTED_MANIFEST_KEYS) {
      if (Object.prototype.hasOwnProperty.call(manifest, key)) errors.push(`plugin.json must not set ${key}`);
    }
  }

  // Marketplace (single-plugin repository layout).
  const marketplace = readJsonFile('.claude-plugin/marketplace.json');
  if (marketplace) {
    if (marketplace.name !== CLAUDE_PLUGIN_NAME) errors.push(`marketplace name must be ${CLAUDE_PLUGIN_NAME}`);
    if (typeof marketplace.owner?.name !== 'string' || !marketplace.owner.name.trim()) errors.push('marketplace.json needs owner.name');
    if (typeof marketplace.description !== 'string' || !marketplace.description.trim()) errors.push('marketplace.json needs description');
    const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
    if (plugins.length !== 1) {
      errors.push('marketplace.json must list exactly one plugin');
    } else {
      const [entry] = plugins;
      if (entry.name !== manifest?.name) errors.push('marketplace entry name must equal plugin.json name');
      if (entry.source !== './') errors.push('marketplace entry source must be "./"');
      const extra = Object.keys(entry).filter((key) => !['name', 'source', 'description'].includes(key));
      if (extra.length > 0) errors.push(`marketplace entry must not set ${extra.join(', ')}; plugin.json owns them`);
    }
  }

  // MCP launcher: one server, an exact npm pin.
  const mcpConfig = readJsonFile('.mcp.json');
  if (mcpConfig) {
    const servers = mcpConfig.mcpServers && typeof mcpConfig.mcpServers === 'object' ? mcpConfig.mcpServers : {};
    const names = Object.keys(servers);
    if (Object.keys(mcpConfig).length !== 1 || names.length !== 1 || names[0] !== CLAUDE_PLUGIN_SERVER_NAME) {
      errors.push(`.mcp.json must declare exactly one "${CLAUDE_PLUGIN_SERVER_NAME}" server under mcpServers`);
    } else {
      const server = servers[CLAUDE_PLUGIN_SERVER_NAME];
      const expectedArgs = ['-y', `fsb-mcp-server@${mcpVersion}`];
      const keys = Object.keys(server).sort().join(',');
      if (keys !== 'args,command' || server.command !== 'npx'
        || JSON.stringify(server.args) !== JSON.stringify(expectedArgs)) {
        errors.push(`.mcp.json must launch exactly npx ${expectedArgs.join(' ')}`);
      }
    }
  }

  // Skill.
  const skill = read('skills/fsb/SKILL.md');
  const frontMatter = parseFrontMatter(skill);
  if (!frontMatter) {
    errors.push('skills/fsb/SKILL.md needs simple YAML front matter');
  } else {
    const keys = Object.keys(frontMatter);
    const unsupported = keys.filter((key) => !SKILL_KEYS.has(key));
    if (unsupported.length > 0) errors.push(`skill front matter keys not accepted on every surface: ${unsupported.join(', ')}`);
    if (frontMatter.name !== 'fsb') errors.push('skill name must equal its folder name fsb');
    const description = frontMatter.description || '';
    if (!description.trim() || description.length > 1024) errors.push('skill description must be 1 to 1024 characters');
  }
  if (skill.split('\n').length >= 500) errors.push('skills/fsb/SKILL.md must stay under 500 lines');

  // README: listing description and disclosures.
  const readme = read('README.md');
  if (wordsOutsideCode(readme) < 40) errors.push('README.md needs at least 40 words outside code blocks');
  for (const phrase of README_DISCLOSURES) {
    if (!readme.includes(phrase)) errors.push(`README.md must disclose ${JSON.stringify(phrase)}`);
  }
  const pins = readme.match(/fsb-mcp-server@[^\s`)]+/gu) || [];
  if (!pins.includes(`fsb-mcp-server@${mcpVersion}`)) errors.push(`README.md must show the launcher fsb-mcp-server@${mcpVersion}`);
  for (const pin of new Set(pins)) {
    if (pin !== `fsb-mcp-server@${mcpVersion}`) errors.push(`README.md names ${pin}; use fsb-mcp-server@${mcpVersion}`);
  }
  for (const match of readme.matchAll(/<img\b|<picture\b|src="/gu)) {
    errors.push(`README.md must show images with Markdown image syntax only (found ${match[0]})`);
  }

  // Every backticked tool name the skill or README mentions must exist.
  if (Array.isArray(toolNames) && toolNames.length > 0) {
    const known = new Set(toolNames);
    for (const [label, text] of [['skills/fsb/SKILL.md', skill], ['README.md', readme]]) {
      for (const name of backtickedSnakeCase(text)) {
        if (!known.has(name) && !NON_TOOL_IDENTIFIERS.has(name)) {
          errors.push(`${label} mentions \`${name}\`, which is not a registered MCP tool`);
        }
      }
    }
  }

  return errors;
}
