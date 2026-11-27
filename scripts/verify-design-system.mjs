#!/usr/bin/env node
/**
 * Keeps design-system/ and DESIGN.md honest about what FSB ships.
 *
 * Fails, naming both files and both values, when:
 *   - a token in design-system/tokens differs from the shipped token block it
 *     mirrors, or exists on only one side. Names that exist only in the design
 *     system must carry a same-line comment that starts with "proposed";
 *   - an overlay token no longer matches the selector and property it names in
 *     extension/content/visual-feedback.js;
 *   - a DESIGN.md front-matter value differs from the token it stands for, or a
 *     {reference} in it points nowhere;
 *   - a specimen card prints a token value that differs from the token;
 *   - a design-system asset differs from its canonical copy under showcase/;
 *   - a relative link in the design docs points at a missing file;
 *   - a surface, foundation or decision page lacks its required headings,
 *     decision numbers repeat or skip, or design-system/index.html misses a card.
 *
 * Usage: node scripts/verify-design-system.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  customProperties,
  lexCss,
  normalizeHeader,
  normalizeValue,
  scopeKey
} from './lib/design-css.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DS = 'design-system';

const SITE_FILES = ['colors', 'effects', 'spacing', 'typography', 'fonts'].map((name) => `${DS}/tokens/${name}.css`);
const PRODUCT_FILE = `${DS}/tokens/product-surface.css`;
const OVERLAY_FILE = `${DS}/tokens/overlay.css`;
const SITE_SHIPPED = 'showcase/angular/src/styles.scss';
const PRODUCT_SHIPPED = 'extension/shared/fsb-ui-core.css';
const ONBOARDING_SHIPPED = 'extension/ui/onboarding.css';
const OVERLAY_SHIPPED = 'extension/content/visual-feedback.js';

export const PRODUCT_SCOPE = '[data-surface="product"]';
export const PRODUCT_DARK_SCOPE = '[data-surface="product"][data-theme="dark"], [data-theme="dark"] [data-surface="product"]';
export const OVERLAY_SCOPE = '[data-surface="overlay"]';

/** Token scopes of the design system, by the names the other tables use. */
export const SCOPES = {
  site: { files: SITE_FILES, scope: ':root' },
  'site-light': { files: SITE_FILES, scope: '[data-theme="light"]' },
  'site-phone': { files: SITE_FILES, scope: '@media (max-width: 768px) > :root' },
  product: { files: [PRODUCT_FILE], scope: PRODUCT_SCOPE },
  'product-dark': { files: [PRODUCT_FILE], scope: PRODUCT_DARK_SCOPE },
  overlay: { files: [OVERLAY_FILE], scope: OVERLAY_SCOPE }
};

/**
 * Each design-system scope and the shipped block it mirrors. "both" means every
 * name must exist on both sides; "subset" means the shipped block only copies
 * some of the names, and those must match.
 */
export const MIRRORS = [
  { name: 'site palette (dark default)', scope: 'site', shipped: SITE_SHIPPED, shippedScope: ':root', mode: 'both' },
  { name: 'site palette (light theme)', scope: 'site-light', shipped: SITE_SHIPPED, shippedScope: '[data-theme="light"]', mode: 'both' },
  { name: 'site layout (phones)', scope: 'site-phone', shipped: SITE_SHIPPED, shippedScope: '@media (max-width: 768px) > :root', mode: 'both' },
  { name: 'product palette (light default)', scope: 'product', shipped: PRODUCT_SHIPPED, shippedScope: ':root', mode: 'both' },
  { name: 'product palette (dark theme)', scope: 'product-dark', shipped: PRODUCT_SHIPPED, shippedScope: '[data-theme="dark"]', mode: 'both' },
  { name: 'onboarding copy of the site palette', scope: 'site', shipped: ONBOARDING_SHIPPED, shippedScope: ':root', mode: 'subset' },
  { name: 'onboarding copy of the site light theme', scope: 'site-light', shipped: ONBOARDING_SHIPPED, shippedScope: '[data-theme="light"]', mode: 'subset' }
];

/**
 * DESIGN.md front-matter leaves and the token each one restates. `pick` reads
 * part of a value: the first or last argument of clamp(), or the duration or
 * easing of a transition shorthand.
 */
export const FRONTMATTER_TOKENS = {
  'colors.primary': { scope: 'site', token: '--primary' },
  'colors.primary-hover': { scope: 'site', token: '--primary-hover' },
  'colors.site.dark.surface': { scope: 'site', token: '--bg-body' },
  'colors.site.dark.surface-card': { scope: 'site', token: '--bg-card' },
  'colors.site.dark.surface-elevated': { scope: 'site', token: '--bg-elevated' },
  'colors.site.dark.on-surface': { scope: 'site', token: '--text-primary' },
  'colors.site.dark.on-surface-variant': { scope: 'site', token: '--text-secondary' },
  'colors.site.dark.on-surface-muted': { scope: 'site', token: '--text-muted' },
  'colors.site.light.surface': { scope: 'site-light', token: '--bg-body' },
  'colors.site.light.surface-card': { scope: 'site-light', token: '--bg-card' },
  'colors.site.light.surface-elevated': { scope: 'site-light', token: '--bg-elevated' },
  'colors.site.light.on-surface': { scope: 'site-light', token: '--text-primary' },
  'colors.site.light.on-surface-variant': { scope: 'site-light', token: '--text-secondary' },
  'colors.site.light.on-surface-muted': { scope: 'site-light', token: '--text-muted' },
  'colors.product.light.surface': { scope: 'product', token: '--fsb-surface-base' },
  'colors.product.light.surface-card': { scope: 'product', token: '--fsb-surface-elevated' },
  'colors.product.light.surface-muted': { scope: 'product', token: '--fsb-surface-muted' },
  'colors.product.light.on-surface': { scope: 'product', token: '--fsb-text-primary' },
  'colors.product.light.on-surface-variant': { scope: 'product', token: '--fsb-text-secondary' },
  'colors.product.light.on-surface-muted': { scope: 'product', token: '--fsb-text-muted' },
  'colors.product.dark.surface': { scope: 'product-dark', token: '--fsb-surface-base' },
  'colors.product.dark.surface-card': { scope: 'product-dark', token: '--fsb-surface-elevated' },
  'colors.product.dark.surface-muted': { scope: 'product-dark', token: '--fsb-surface-muted' },
  'colors.product.dark.on-surface': { scope: 'product-dark', token: '--fsb-text-primary' },
  'colors.product.dark.on-surface-variant': { scope: 'product-dark', token: '--fsb-text-secondary' },
  'colors.product.dark.on-surface-muted': { scope: 'product-dark', token: '--fsb-text-muted' },
  'colors.product.success': { scope: 'product', token: '--fsb-success' },
  'colors.product.warning': { scope: 'product', token: '--fsb-warning' },
  'colors.product.error': { scope: 'product', token: '--fsb-danger' },
  'colors.product.info': { scope: 'product', token: '--fsb-info' },
  'colors.overlay.thinking': { scope: 'overlay', token: '--fsb-ov-thinking-1' },
  'colors.overlay.acting': { scope: 'overlay', token: '--fsb-ov-acting-1' },
  'colors.overlay.calling': { scope: 'overlay', token: '--fsb-ov-calling-1' },
  'colors.overlay.done': { scope: 'overlay', token: '--fsb-ov-done' },
  'colors.overlay.guarded': { scope: 'overlay', token: '--fsb-ov-guarded' },
  'colors.overlay.crawl': { scope: 'overlay', token: '--fsb-ov-crawl' },
  'typography.wordmark.fontFamily': { scope: 'site', token: '--font-brand' },
  'typography.wordmark.fontWeight': { scope: 'site', token: '--weight-hairline' },
  'typography.body-md.fontFamily': { scope: 'site', token: '--font-sans' },
  'typography.body-md.fontSize': { scope: 'site', token: '--text-body' },
  'typography.body-md.lineHeight': { scope: 'site', token: '--leading-body' },
  'typography.paragraph.lineHeight': { scope: 'site', token: '--leading-relaxed' },
  'typography.label-mono.fontFamily': { scope: 'site', token: '--font-mono' },
  'typography.label-mono.letterSpacing': { scope: 'site', token: '--tracking-eyebrow' },
  'typography.sm.headline-lg.fontSize': { scope: 'site', token: '--text-h1', pick: 'clamp-min' },
  'typography.lg.headline-lg.fontSize': { scope: 'site', token: '--text-h1', pick: 'clamp-max' },
  'typography.sm.headline-md.fontSize': { scope: 'site', token: '--text-h2', pick: 'clamp-min' },
  'typography.lg.headline-md.fontSize': { scope: 'site', token: '--text-h2', pick: 'clamp-max' },
  'typography.sm.headline-sm.fontSize': { scope: 'site', token: '--text-h3', pick: 'clamp-min' },
  'typography.lg.headline-sm.fontSize': { scope: 'site', token: '--text-h3', pick: 'clamp-max' },
  'typography.headline.fontWeight': { scope: 'site', token: '--weight-bold' },
  'typography.headline.lineHeight': { scope: 'site', token: '--leading-tight' },
  'typography.headline.letterSpacing': { scope: 'site', token: '--tracking-tight' },
  'rounded.site.sm': { scope: 'site', token: '--radius-sm' },
  'rounded.site.md': { scope: 'site', token: '--radius-md' },
  'rounded.site.lg': { scope: 'site', token: '--radius-lg' },
  'rounded.site.xl': { scope: 'site', token: '--radius-xl' },
  'rounded.product.sm': { scope: 'product', token: '--fsb-radius-sm' },
  'rounded.product.md': { scope: 'product', token: '--fsb-radius-md' },
  'rounded.product.lg': { scope: 'product', token: '--fsb-radius-lg' },
  'rounded.product.xl': { scope: 'product', token: '--fsb-radius-xl' },
  'rounded.full': { scope: 'product', token: '--fsb-radius-pill' },
  'spacing.1': { scope: 'product', token: '--fsb-space-1' },
  'spacing.2': { scope: 'product', token: '--fsb-space-2' },
  'spacing.3': { scope: 'product', token: '--fsb-space-3' },
  'spacing.4': { scope: 'product', token: '--fsb-space-4' },
  'spacing.6': { scope: 'product', token: '--fsb-space-6' },
  'spacing.8': { scope: 'product', token: '--fsb-space-8' },
  'spacing.12': { scope: 'product', token: '--fsb-space-12' },
  'spacing.container-max': { scope: 'site', token: '--max-width' },
  'spacing.nav-height': { scope: 'site', token: '--nav-height' },
  'spacing.sm.nav-height': { scope: 'site-phone', token: '--nav-height' },
  'motion.state-change.duration': { scope: 'site', token: '--transition-fast', pick: 'duration' },
  'motion.state-change.timingFunction': { scope: 'site', token: '--transition-fast', pick: 'easing' },
  'motion.surface-change.duration': { scope: 'site', token: '--transition-base', pick: 'duration' },
  'motion.surface-change.timingFunction': { scope: 'site', token: '--transition-base', pick: 'easing' },
  'motion.surface-enter.duration': { scope: 'site', token: '--transition-slow', pick: 'duration' },
  'motion.surface-enter.timingFunction': { scope: 'site', token: '--transition-slow', pick: 'easing' }
};

const TOKEN_GROUPS = ['colors', 'typography', 'rounded', 'spacing', 'motion'];

/** Design-system assets and their byte-identical twins in the repo. */
export const ASSET_TWINS = {
  'assets/icons/opentabs.svg': 'showcase/assets/opentabs.svg',
  'assets/logos/fsb-logo-dark-footer.png': 'showcase/assets/fsb_logo_dark_footer.png',
  'assets/logos/fsb-logo-light-footer.png': 'showcase/assets/fsb_logo_light_footer.png',
  'assets/logos/icon128.png': 'showcase/assets/icon128.png',
  'assets/logos/icon48.png': 'showcase/assets/icon48.png',
  ...Object.fromEntries(
    ['all.svg', 'anthropic.webp', 'claude.svg', 'cursor.svg', 'google.png', 'hermes.png', 'openai.svg',
      'openclaw.svg', 'opencode.svg', 'openrouter.svg', 'vscode.svg', 'xai.png']
      .map((name) => [`assets/providers/${name}`, `showcase/assets/providers/${name}`])
  )
};

/** Assets with no file twin, and why. */
export const DESIGN_ONLY_ASSETS = {
  'assets/providers/windsurf.svg': 'No Windsurf mark ships in the product yet.',
  'assets/logos/fsb-mark-b.svg': 'The B of the wordmark; shipped pages inline the same path.'
};

/** Pages that inline the wordmark B, which must use the same path as fsb-mark-b.svg. */
const MARK_B_PAGES = [
  'showcase/angular/src/app/layout/showcase-shell/showcase-shell.component.html',
  'extension/ui/onboarding.html'
];

export const PAGE_TEMPLATES = {
  [`${DS}/surfaces`]: ['What it is', 'Palette and tokens', 'Anatomy', 'States', 'Motion', 'Copy and i18n',
    'Accessibility', 'Tests that pin it', 'Known issues', 'Sources'],
  [`${DS}/foundations`]: ['Rules', 'Tokens', 'Specimens', 'Known gaps', 'Evidence']
};

export const DECISION_HEADINGS = ['Context and problem statement', 'Considered options', 'Decision outcome',
  'Consequences', 'Evidence'];

const DECISION_STATUS = /^(Proposed|Accepted|Deprecated|Rejected|Superseded by (\d{4}))\b/;

/** Pointer files outside design-system/ whose relative links must resolve. */
const LINKED_DOCS = ['DESIGN.md', 'AGENTS.md', 'CONTRIBUTING.md', '.claude/skills/fsb-design/SKILL.md',
  '.claude/rules/ui-styling.md', '.github/pull_request_template.md'];

// ---------------------------------------------------------------- helpers

function readText(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function listFiles(relDir, predicate) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (predicate(child)) out.push(child);
    }
  };
  if (existsSync(join(ROOT, relDir))) walk(relDir);
  return out.sort();
}

export function isProposed(decl) {
  return decl.trailing.some((comment) => /^proposed\b/i.test(comment));
}

/**
 * Collects one scope's custom properties across several files.
 * @returns {{ tokens: Map<string, {decl: object, file: string}>, errors: string[] }}
 */
export function collectScope(sources, scope) {
  const tokens = new Map();
  const errors = [];
  for (const { file, text } of sources) {
    for (const decl of lexCss(text, { scss: file.endsWith('.scss') }).decls) {
      if (!decl.prop.startsWith('--') || scopeKey(decl.context) !== scope) continue;
      if (tokens.has(decl.prop)) {
        errors.push(`${decl.prop} is declared twice for ${scope}: ${tokens.get(decl.prop).file} and ${file}`);
        continue;
      }
      tokens.set(decl.prop, { decl, file });
    }
  }
  return { tokens, errors };
}

/** Compares a design-system scope with the shipped block it mirrors. */
export function compareMirror(mirror, dsTokens, shippedTokens) {
  const errors = [];
  for (const [prop, shipped] of shippedTokens) {
    const ds = dsTokens.get(prop);
    if (!ds) {
      errors.push(`${mirror.name}: ${prop} ships in ${mirror.shipped} ("${shipped.value}") but is missing from the design system`);
      continue;
    }
    if (isProposed(ds.decl)) {
      errors.push(`${mirror.name}: ${prop} is marked proposed in ${ds.file} but already ships in ${mirror.shipped}; drop the marker`);
    }
    if (normalizeValue(ds.decl.value) !== normalizeValue(shipped.value)) {
      errors.push(`${mirror.name}: ${prop} is "${ds.decl.value}" in ${ds.file} but "${shipped.value}" in ${mirror.shipped}`);
    }
  }
  if (mirror.mode === 'both') {
    for (const [prop, ds] of dsTokens) {
      if (shippedTokens.has(prop) || isProposed(ds.decl)) continue;
      errors.push(`${mirror.name}: ${prop} is in ${ds.file} but not in ${mirror.shipped}; ship it there or mark it with a same-line /* proposed */ comment`);
    }
  }
  return errors;
}

/** Splits a selector list on its top-level commas. */
export function splitSelectors(header) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of header) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(normalizeHeader(current));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(normalizeHeader(current));
  return parts;
}

/**
 * The stylesheets visual-feedback.js writes into its shadow roots: template
 * literals assigned to `.textContent`, either inline or through a named
 * constant (`style.textContent = PILL_CSS`).
 */
export function extractOverlayCss(jsText) {
  const blocks = [];
  const inline = /\.textContent\s*=\s*`([\s\S]*?)`/g;
  let match;
  while ((match = inline.exec(jsText))) blocks.push(match[1]);
  const names = new Set();
  const byName = /\.textContent\s*=\s*([A-Za-z_$][\w$]*)\s*;/g;
  while ((match = byName.exec(jsText))) names.add(match[1]);
  for (const name of names) {
    const declared = new RegExp(`\\b(?:const|let|var)\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*\`([\\s\\S]*?)\``).exec(jsText);
    if (declared) blocks.push(declared[1]);
  }
  return blocks;
}

/**
 * Each overlay token names its source as a same-line comment:
 *   --fsb-ov-thinking-1: #ff8c00; /* .viewport-glow-root.state-thinking --glow-color-1 *\/
 */
export function checkOverlayTokens(dsTokens, jsText, shippedLabel = OVERLAY_SHIPPED) {
  const errors = [];
  const shipped = extractOverlayCss(jsText).flatMap((css) => lexCss(css).decls);
  for (const [prop, { decl, file }] of dsTokens) {
    const source = decl.trailing[0];
    if (!source) {
      errors.push(`${prop} in ${file} names no source; add a same-line comment "<selector> <property>"`);
      continue;
    }
    const words = source.split(/\s+/);
    const property = words.pop();
    const selector = normalizeHeader(words.join(' '));
    const matches = shipped.filter((d) => d.prop === property
      && d.context.length > 0
      && !d.context.slice(0, -1).some((header) => header.startsWith('@'))
      && splitSelectors(d.context[d.context.length - 1]).includes(selector));
    if (matches.length === 0) {
      errors.push(`${prop}: ${shippedLabel} has no "${property}" under "${selector}"`);
      continue;
    }
    const values = [...new Set(matches.map((d) => normalizeValue(d.value)))];
    if (values.length > 1) {
      errors.push(`${prop}: "${selector}" sets ${property} to more than one value in ${shippedLabel} (${values.join(' | ')}); name a more specific source`);
      continue;
    }
    if (values[0] !== normalizeValue(decl.value)) {
      errors.push(`${prop} is "${decl.value}" in ${file} but ${selector} ${property} is "${matches[0].value}" in ${shippedLabel}`);
    }
  }
  return errors;
}

/**
 * Parses YAML front matter limited to nested maps of scalars, which is all the
 * design.md format needs here. Lists, flow collections, anchors, block scalars,
 * tabs, duplicate keys and empty values are errors. A space followed by # starts
 * a comment, so hex colours must be quoted.
 */
export function parseFrontmatter(text) {
  const errors = [];
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return { data: null, errors: ['DESIGN.md must start with a --- front-matter line'] };
  const end = lines.findIndex((value, index) => index > 0 && value.trim() === '---');
  if (end === -1) return { data: null, errors: ['DESIGN.md front matter has no closing --- line'] };

  const root = {};
  const stack = [{ indent: -1, node: root }];

  const stripComment = (value) => {
    let quote = null;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
        return value.slice(0, i);
      }
    }
    return value;
  };

  const scalar = (raw, lineNo) => {
    const value = raw.trim();
    if (value.startsWith('"')) {
      if (!value.endsWith('"') || value.length < 2) errors.push(`DESIGN.md line ${lineNo}: unterminated "string"`);
      return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (value.startsWith("'")) {
      if (!value.endsWith("'") || value.length < 2) errors.push(`DESIGN.md line ${lineNo}: unterminated 'string'`);
      return value.slice(1, -1).replace(/''/g, "'");
    }
    if (/^[{[&*|>!%@`]/.test(value)) {
      errors.push(`DESIGN.md line ${lineNo}: "${value}" uses YAML syntax this checker does not read; quote the value`);
    }
    return value;
  };

  for (let index = 1; index < end; index += 1) {
    const lineNo = index + 1;
    const line = lines[index];
    if (/^\s*\t/.test(line) || /^\t/.test(line)) {
      errors.push(`DESIGN.md line ${lineNo}: indent with spaces, not tabs`);
      continue;
    }
    const body = stripComment(line);
    if (!body.trim()) continue;
    const indent = body.length - body.trimStart().length;
    const content = body.trim();
    if (content.startsWith('- ') || content === '-') {
      errors.push(`DESIGN.md line ${lineNo}: lists are not supported in the front matter`);
      continue;
    }
    const match = /^("([^"]+)"|'([^']+)'|([A-Za-z0-9_.-]+))\s*:(.*)$/.exec(content);
    if (!match) {
      errors.push(`DESIGN.md line ${lineNo}: expected "key: value"`);
      continue;
    }
    const key = match[2] || match[3] || match[4];
    const rest = match[5];

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (Object.prototype.hasOwnProperty.call(parent, key)) {
      errors.push(`DESIGN.md line ${lineNo}: duplicate key "${key}"`);
      continue;
    }
    if (rest.trim() === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      parent[key] = scalar(rest, lineNo);
    }
  }

  const prune = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') {
        if (Object.keys(value).length === 0) errors.push(`DESIGN.md: "${[...path, key].join('.')}" has no value`);
        else prune(value, [...path, key]);
      }
    }
  };
  prune(root, []);
  return { data: root, errors, bodyStart: end + 1 };
}

/** Flattens nested maps to dot paths of their scalar leaves. */
export function flatten(node, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(node || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') Object.assign(out, flatten(value, path));
    else out[path] = value;
  }
  return out;
}

function splitArgs(inner) {
  const args = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  args.push(current.trim());
  return args;
}

export function pickValue(value, pick) {
  if (!pick) return value;
  if (pick === 'clamp-min' || pick === 'clamp-max') {
    const match = /^clamp\((.*)\)$/.exec(value.trim());
    if (!match) return null;
    const args = splitArgs(match[1]);
    return pick === 'clamp-min' ? args[0] : args[args.length - 1];
  }
  const [duration, ...easing] = value.trim().split(/\s+/);
  if (pick === 'duration') return duration;
  if (pick === 'easing') return easing.join(' ');
  return null;
}

/** Compares DESIGN.md front matter with the design-system tokens. */
export function checkFrontmatter(data, scopes, table = FRONTMATTER_TOKENS) {
  const errors = [];
  const leaves = flatten(data);
  for (const [path, value] of Object.entries(leaves)) {
    const group = path.split('.')[0];
    if (TOKEN_GROUPS.includes(group) && !table[path]) {
      errors.push(`DESIGN.md: ${path} is not tied to a token; add it to FRONTMATTER_TOKENS in scripts/verify-design-system.mjs or remove it`);
    }
    if (group === 'components' && /^\{.+\}$/.test(String(value).trim())) {
      const target = String(value).trim().slice(1, -1);
      const isLeaf = Object.prototype.hasOwnProperty.call(leaves, target);
      const isGroup = Object.keys(leaves).some((leaf) => leaf.startsWith(`${target}.`));
      if (!isLeaf && !(target.startsWith('typography.') && isGroup)) {
        errors.push(`DESIGN.md: ${path} refers to {${target}}, which is not defined`);
      }
    }
  }
  for (const [path, spec] of Object.entries(table)) {
    if (!Object.prototype.hasOwnProperty.call(leaves, path)) {
      errors.push(`DESIGN.md: ${path} is missing (it restates ${spec.token})`);
      continue;
    }
    const scope = scopes[spec.scope];
    const entry = scope && scope.get(spec.token);
    if (!entry) {
      errors.push(`DESIGN.md: ${path} restates ${spec.token}, which is not in the design system's ${spec.scope} tokens`);
      continue;
    }
    const expected = pickValue(entry.decl.value, spec.pick);
    if (expected === null) {
      errors.push(`DESIGN.md: cannot read ${spec.pick} from ${spec.token} ("${entry.decl.value}")`);
      continue;
    }
    if (normalizeValue(String(leaves[path])) !== normalizeValue(expected)) {
      errors.push(`DESIGN.md: ${path} is "${leaves[path]}" but ${spec.token} is "${expected}" in ${entry.file}`);
    }
  }
  return errors;
}

function resolveVar(tokens, value, depth = 0) {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match || depth > 5) return value;
  const next = tokens.get(match[1]);
  return next ? resolveVar(tokens, next.decl.value, depth + 1) : value;
}

/** Specimen cards print a token beside its value; hex values must match the token. */
export function checkCardLabels(cardPath, html, scopes) {
  const errors = [];
  const name = basename(cardPath);
  const pattern = /class="var">\s*(--[\w-]+)\s*<\/span>\s*<span class="lbl">\s*([^<]*)/g;
  let match;
  while ((match = pattern.exec(html))) {
    const [, prop, label] = match;
    const printed = label.trim();
    if (!/^#[0-9a-fA-F]{3,8}$/.test(printed)) continue;
    let scopeName = name.includes('light') ? 'site-light' : 'site';
    if (prop.startsWith('--fsb-ov-')) scopeName = 'overlay';
    else if (prop.startsWith('--fsb-')) scopeName = name.includes('dark') ? 'product-dark' : 'product';
    const tokens = scopes[scopeName];
    const entry = tokens && (tokens.get(prop) || (scopeName === 'product-dark' ? scopes.product.get(prop) : null));
    if (!entry) {
      errors.push(`${cardPath} prints ${prop}, which is not a ${scopeName} token`);
      continue;
    }
    const actual = normalizeValue(resolveVar(scopes[scopeName], entry.decl.value));
    if (actual !== normalizeValue(printed)) {
      errors.push(`${cardPath} prints ${prop} as ${printed}, but the token is ${entry.decl.value}`);
    }
  }
  return errors;
}

/** Relative links in a Markdown file that point at missing files. */
export function findBrokenLinks(file, text, exists) {
  const errors = [];
  const withoutFences = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
  const pattern = /\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = pattern.exec(withoutFences))) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    let clean;
    try {
      clean = decodeURI(target.split('#')[0].split('?')[0]);
    } catch {
      errors.push(`${file} has a malformed link target: ${target}`);
      continue;
    }
    if (!clean) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(file), clean));
    if (!exists(resolved)) errors.push(`${file} links to ${target}, which does not exist`);
  }
  return errors;
}

/** DESIGN.md external references (`@path`) resolve from the repo root. */
export function findBrokenReferences(file, text, exists) {
  const errors = [];
  const pattern = /`@([^`\s#]+\.[A-Za-z0-9]+)(#[^`\s]+)?`/g;
  let match;
  while ((match = pattern.exec(text))) {
    const target = match[1];
    if (target.startsWith('/') || posix.normalize(target).startsWith('..')) {
      errors.push(`${file}: reference @${target} must stay inside the repo`);
    } else if (!exists(posix.normalize(target))) {
      errors.push(`${file}: reference @${target} points at a missing file`);
    }
  }
  return errors;
}

export function h2Headings(text) {
  return text
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, '')
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
}

/** Required headings must all appear, in order. */
export function checkHeadings(file, text, required) {
  const headings = h2Headings(text);
  const errors = [];
  let cursor = 0;
  for (const heading of required) {
    const found = headings.indexOf(heading, cursor);
    if (found === -1) {
      errors.push(`${file} needs a "## ${heading}" section${headings.includes(heading) ? ' (it is out of order)' : ''}`);
    } else {
      cursor = found + 1;
    }
  }
  return errors;
}

/** Decision records: numbered from 0000 with no gaps, one number each, fixed shape. */
export function checkDecisions(files) {
  const errors = [];
  const byNumber = new Map();
  for (const { file, text } of files) {
    const match = /^(\d{4})-[a-z0-9-]+\.md$/.exec(basename(file));
    if (!match) {
      errors.push(`${file}: decision files are named NNNN-short-title.md`);
      continue;
    }
    const number = match[1];
    if (byNumber.has(number)) errors.push(`decision ${number} is used twice: ${byNumber.get(number).file} and ${file}`);
    else byNumber.set(number, { file, text });
    const firstLine = text.split('\n')[0];
    if (!firstLine.startsWith(`# ${number}. `)) errors.push(`${file} must start with "# ${number}. <title>"`);
    const status = /^- Status: (.+)$/m.exec(text);
    if (!status || !DECISION_STATUS.test(status[1].trim())) {
      errors.push(`${file} needs "- Status: Proposed | Accepted | Deprecated | Rejected | Superseded by NNNN"`);
    }
    if (!/^- Date: \d{4}-\d{2}-\d{2}$/m.test(text)) errors.push(`${file} needs "- Date: YYYY-MM-DD"`);
    errors.push(...checkHeadings(file, text, DECISION_HEADINGS));
  }
  const numbers = [...byNumber.keys()].sort();
  numbers.forEach((number, index) => {
    const expected = String(index).padStart(4, '0');
    if (number !== expected) errors.push(`decision numbers must run from 0000 without gaps: found ${number} where ${expected} belongs`);
  });
  for (const [number, { file, text }] of byNumber) {
    const status = /^- Status: Superseded by (\d{4})/m.exec(text);
    if (!status) continue;
    const successor = byNumber.get(status[1]);
    if (!successor) errors.push(`${file} is superseded by ${status[1]}, which does not exist`);
    else if (!successor.text.includes(`Supersedes ${number}`)) errors.push(`${successor.file} must say "Supersedes ${number}"`);
  }
  return errors;
}

function svgPath(text) {
  const match = /<path[^>]*\sd="([^"]+)"/.exec(text);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------- main

function loadScopes(errors) {
  const scopes = {};
  for (const [name, { files, scope }] of Object.entries(SCOPES)) {
    const sources = files.map((file) => ({ file, text: readText(file) }));
    const collected = collectScope(sources, scope);
    errors.push(...collected.errors);
    scopes[name] = collected.tokens;
  }
  return scopes;
}

export function run() {
  const errors = [];
  const counts = {};
  const exists = (relPath) => existsSync(join(ROOT, relPath));

  const scopes = loadScopes(errors);

  for (const mirror of MIRRORS) {
    const shipped = customProperties(
      lexCss(readText(mirror.shipped), { scss: mirror.shipped.endsWith('.scss') }).decls,
      mirror.shippedScope
    );
    errors.push(...compareMirror(mirror, scopes[mirror.scope], shipped));
    counts[mirror.name] = shipped.size;
  }

  errors.push(...checkOverlayTokens(scopes.overlay, readText(OVERLAY_SHIPPED)));
  counts['overlay tokens'] = scopes.overlay.size;

  const designMd = readText('DESIGN.md');
  const { data, errors: yamlErrors } = parseFrontmatter(designMd);
  errors.push(...yamlErrors);
  if (data) errors.push(...checkFrontmatter(data, scopes));
  errors.push(...findBrokenReferences('DESIGN.md', designMd, exists));

  const cards = listFiles(DS, (file) => file.endsWith('.card.html'));
  for (const card of cards) errors.push(...checkCardLabels(card, readText(card), scopes));
  counts['specimen cards'] = cards.length;

  const indexHtml = exists(`${DS}/index.html`) ? readText(`${DS}/index.html`) : '';
  if (!indexHtml) errors.push(`${DS}/index.html is missing`);
  const listed = new Set();
  const cardRef = /\s(?:src|href)="([^"#?]+\.card\.html)"/g;
  let frame;
  while ((frame = cardRef.exec(indexHtml))) {
    const target = posix.normalize(posix.join(DS, frame[1]));
    listed.add(target);
    if (!exists(target)) errors.push(`${DS}/index.html shows ${frame[1]}, which does not exist`);
  }
  for (const card of cards) {
    if (!listed.has(card)) errors.push(`${DS}/index.html does not show ${card}`);
  }

  const assets = listFiles(`${DS}/assets`, () => true);
  for (const asset of assets) {
    const local = asset.slice(DS.length + 1);
    if (ASSET_TWINS[local]) {
      const twin = ASSET_TWINS[local];
      if (!exists(twin)) {
        errors.push(`${asset} should match ${twin}, which does not exist`);
      } else if (!readFileSync(join(ROOT, asset)).equals(readFileSync(join(ROOT, twin)))) {
        errors.push(`${asset} differs from ${twin}; copy the shipped file over it`);
      }
    } else if (!DESIGN_ONLY_ASSETS[local]) {
      errors.push(`${asset} has no shipped twin; add it to ASSET_TWINS or DESIGN_ONLY_ASSETS in scripts/verify-design-system.mjs`);
    }
  }
  for (const local of Object.keys(ASSET_TWINS)) {
    if (!exists(`${DS}/${local}`)) errors.push(`${DS}/${local} is listed in ASSET_TWINS but missing`);
  }
  const markB = exists(`${DS}/assets/logos/fsb-mark-b.svg`) ? svgPath(readText(`${DS}/assets/logos/fsb-mark-b.svg`)) : null;
  for (const page of MARK_B_PAGES) {
    if (markB && !readText(page).includes(`d="${markB}"`)) {
      errors.push(`${page} no longer inlines the wordmark B path from ${DS}/assets/logos/fsb-mark-b.svg`);
    }
  }
  counts.assets = assets.length;

  const markdown = [...LINKED_DOCS.filter(exists), ...listFiles(DS, (file) => file.endsWith('.md'))];
  for (const file of LINKED_DOCS) {
    if (!exists(file)) errors.push(`${file} is missing`);
  }
  for (const file of markdown) errors.push(...findBrokenLinks(file, readText(file), exists));
  counts['linked documents'] = markdown.length;

  for (const [dir, required] of Object.entries(PAGE_TEMPLATES)) {
    for (const file of listFiles(dir, (path) => path.endsWith('.md') && basename(path) !== 'README.md')) {
      errors.push(...checkHeadings(file, readText(file), required));
    }
  }
  const decisions = listFiles(`${DS}/decisions`, (path) => path.endsWith('.md') && basename(path) !== 'README.md')
    .map((file) => ({ file, text: readText(file) }));
  errors.push(...checkDecisions(decisions));
  counts.decisions = decisions.length;

  return { errors, counts };
}

function main() {
  const { errors, counts } = run();
  if (errors.length) {
    console.error(`verify-design-system: ${errors.length} problem(s)`);
    for (const error of errors) console.error(`  - ${error}`);
    console.error('\nThe rules live in DESIGN.md and design-system/README.md.');
    process.exit(1);
  }
  const summary = Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', ');
  console.log(`verify-design-system: ok (${summary})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
