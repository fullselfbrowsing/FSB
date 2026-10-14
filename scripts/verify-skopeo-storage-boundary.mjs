#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');
const EXTENSION_ROOT = 'extension';
const BACKGROUND_PATH = 'extension/background.js';
const MANIFEST_PATH = 'extension/manifest.json';
const TRUSTED_STORE_PATH = 'extension/utils/trusted-local-feature-store.js';
const GRAPH_MODULE_PATHS = Object.freeze([
  'extension/utils/skopeo-graph-schema.js',
  'extension/utils/skopeo-graph-store.js',
  'extension/utils/skopeo-graph-extractor.js',
  'extension/utils/skopeo-graph-query.js',
  'extension/utils/skopeo-graph-engine.js'
]);
const GRAPH_IMPORT_PATHS = Object.freeze(GRAPH_MODULE_PATHS.map((path) =>
  path.slice('extension/'.length)));
export const TRUTH_MODULE_PATHS = Object.freeze([
  'extension/utils/skopeo-truth-schema.js',
  'extension/utils/skopeo-truth-extractor.js',
  'extension/utils/skopeo-lineage-adjudicator.js',
  'extension/utils/skopeo-deadline-engine.js',
  'extension/utils/skopeo-truth-store.js',
  'extension/utils/skopeo-truth-engine.js'
]);
const TRUTH_IMPORT_PATHS = Object.freeze(TRUTH_MODULE_PATHS.map((path) =>
  path.slice('extension/'.length)));
export const ALERT_MODULE_PATHS = Object.freeze([
  'extension/utils/skopeo-alert-schema.js',
  'extension/utils/skopeo-alert-store.js',
  'extension/utils/skopeo-alert-engine.js',
  'extension/utils/skopeo-alert-runtime.js'
]);
const ALERT_IMPORT_PATHS = Object.freeze(ALERT_MODULE_PATHS.map((path) =>
  path.slice('extension/'.length)));
const PINNED_STORAGE_FREE_FILES = Object.freeze([
  'extension/utils/diagnostics-ring-buffer.js',
  'extension/utils/automation-logger.js',
  'extension/content/dom-state.js',
  'extension/content/actions.js'
]);

function sourceLine(source, offset) {
  return source.slice(0, Math.max(0, offset)).split('\n').length;
}

function diagnostic(path, source, offset, message) {
  return `${path}:${sourceLine(source, offset)}: ${message}`;
}

function maskComments(source) {
  let output = '';
  let state = 'code';
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') {
        state = 'code';
        output += '\n';
      } else {
        output += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        state = 'code';
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (state === 'single' || state === 'double' || state === 'template') {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if ((state === 'single' && char === "'") ||
                 (state === 'double' && char === '"') ||
                 (state === 'template' && char === '`')) {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      state = 'block-comment';
    } else {
      output += char;
      if (char === "'") state = 'single';
      else if (char === '"') state = 'double';
      else if (char === '`') state = 'template';
    }
  }

  return output;
}

function readWithOverrides(root, relativePath, sourceOverrides) {
  if (Object.prototype.hasOwnProperty.call(sourceOverrides, relativePath)) {
    return sourceOverrides[relativePath];
  }
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) return null;
  return readFileSync(absolutePath, 'utf8');
}

function parseLiteralArray(backgroundSource, name, errors) {
  const source = maskComments(backgroundSource);
  const declaration = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*=\\s*(?:Object\\.freeze\\s*\\(\\s*)?(\\[[\\s\\S]*?\\])\\s*\\)?\\s*;`
  ).exec(source);
  if (!declaration) {
    errors.push(`${BACKGROUND_PATH}:1: could not resolve literal ${name}; failing closed`);
    return [];
  }

  const literal = declaration[1];
  const entries = [];
  const stringPattern = /(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1/g;
  let match;
  while ((match = stringPattern.exec(literal)) !== null) {
    entries.push(match[2].replace(/\\(['"\\])/g, '$1'));
  }

  const residue = literal
    .replace(stringPattern, '')
    .replace(/[\[\],\s]/g, '');
  if (residue || entries.length === 0 || entries.some((entry) => !entry.endsWith('.js'))) {
    errors.push(diagnostic(
      BACKGROUND_PATH,
      source,
      declaration.index,
      `${name} must be a non-empty array of literal JavaScript paths; failing closed`
    ));
    return [];
  }
  return entries.map((entry) => `${EXTENSION_ROOT}/${entry}`);
}

function extensionRelativeDependency(ownerPath, candidate) {
  if (!candidate || !candidate.endsWith('.js') || isAbsolute(candidate)) return null;
  let normalized;
  if (candidate.startsWith('./') || candidate.startsWith('../')) {
    normalized = posix.normalize(posix.join(posix.dirname(ownerPath), candidate));
  } else if (candidate.startsWith('extension/')) {
    normalized = posix.normalize(candidate);
  } else {
    normalized = posix.normalize(posix.join(EXTENSION_ROOT, candidate));
  }
  if (!normalized.startsWith(`${EXTENSION_ROOT}/`) || normalized.includes('/../')) return null;
  return normalized;
}

function literalDependencies(path, source) {
  const masked = maskComments(source);
  const dependencies = new Set();
  const patterns = [
    /\bimportScripts\s*\(\s*(['"])([^'"]+\.js)\1/g,
    /\brequire\s*\(\s*(['"])([^'"]+\.js)\1\s*\)/g,
    /\bimport\s*\(\s*(['"])([^'"]+\.js)\1\s*\)/g,
    /\bimport\s+(?:[^'";]+?\s+from\s+)?(['"])([^'"]+\.js)\1/g,
    /\b(?:chrome\.)?runtime\.getURL\s*\(\s*(['"])([^'"]+\.js)\1\s*\)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(masked)) !== null) {
      const dependency = extensionRelativeDependency(path, match[2]);
      if (dependency) dependencies.add(dependency);
    }
  }
  return [...dependencies];
}

function scanLocalStorage(path, source, errors) {
  const masked = maskComments(source);
  const storageRoot = String.raw`(?:chrome|browser)\s*(?:\.\s*storage|\[\s*['"]storage['"]\s*\])`;
  const localMember = String.raw`(?:\?\s*\.\s*local|\.\s*local|\[\s*['"]local['"]\s*\])`;
  const changeMember = String.raw`(?:\?\s*\.\s*onChanged|\.\s*onChanged|\[\s*['"]onChanged['"]\s*\])`;
  const directPatterns = [
    {
      regex: new RegExp(`\\b${storageRoot}\\s*${localMember}`, 'g'),
      message: 'direct storage.local access is forbidden in injected or dual-loaded code'
    },
    {
      regex: new RegExp(`\\b${storageRoot}\\s*${changeMember}`, 'g'),
      message: 'storage.onChanged listener is forbidden in injected or dual-loaded code'
    }
  ];

  for (const { regex, message } of directPatterns) {
    let match;
    while ((match = regex.exec(masked)) !== null) {
      errors.push(diagnostic(path, source, match.index, message));
    }
  }

  const storageAliases = new Map();
  const localAliases = new Map();
  const rootAssignment = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${storageRoot}`,
    'g'
  );
  let match;
  while ((match = rootAssignment.exec(masked)) !== null) storageAliases.set(match[1], match.index);

  const localFromRootDestructure = new RegExp(
    `\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${storageRoot}`,
    'g'
  );
  while ((match = localFromRootDestructure.exec(masked)) !== null) {
    for (const part of match[1].split(',')) {
      const binding = /^\s*local\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (binding) localAliases.set(binding[1] || 'local', match.index);
    }
  }

  const rootDestructure = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:chrome|browser)\b/g;
  while ((match = rootDestructure.exec(masked)) !== null) {
    for (const part of match[1].split(',')) {
      const binding = /^\s*storage\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (binding) storageAliases.set(binding[1] || 'storage', match.index);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [alias] of [...storageAliases]) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasAssignment = new RegExp(
        `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escaped}\\b`,
        'g'
      );
      while ((match = aliasAssignment.exec(masked)) !== null) {
        if (!storageAliases.has(match[1])) {
          storageAliases.set(match[1], match.index);
          changed = true;
        }
      }

      const localAssignment = new RegExp(
        `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escaped}\\s*${localMember}`,
        'g'
      );
      while ((match = localAssignment.exec(masked)) !== null) {
        if (!localAliases.has(match[1])) {
          localAliases.set(match[1], match.index);
          changed = true;
        }
      }

      const localDestructure = new RegExp(
        `\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${escaped}\\b`,
        'g'
      );
      while ((match = localDestructure.exec(masked)) !== null) {
        for (const part of match[1].split(',')) {
          const binding = /^\s*local\s*(?::\s*([A-Za-z_$][\w$]*))?\s*$/.exec(part);
          if (binding && !localAliases.has(binding[1] || 'local')) {
            localAliases.set(binding[1] || 'local', match.index);
            changed = true;
          }
        }
      }
    }
  }

  for (const [alias] of storageAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const localUse = new RegExp(`\\b${escaped}\\s*${localMember}`, 'g');
    while ((match = localUse.exec(masked)) !== null) {
      errors.push(diagnostic(path, source, match.index, 'aliased storage.local access is forbidden in injected or dual-loaded code'));
    }
    const changeUse = new RegExp(`\\b${escaped}\\s*${changeMember}`, 'g');
    while ((match = changeUse.exec(masked)) !== null) {
      errors.push(diagnostic(path, source, match.index, 'aliased storage.onChanged access is forbidden in injected or dual-loaded code'));
    }
  }

  for (const [alias, declarationOffset] of localAliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const operation = new RegExp(
      `\\b${escaped}\\s*(?:\\.\\s*(?:get|set|remove|clear|getBytesInUse|setAccessLevel)\\b|\\[\\s*['"](?:get|set|remove|clear|getBytesInUse|setAccessLevel)['"]\\s*\\])`,
      'g'
    );
    let found = false;
    while ((match = operation.exec(masked)) !== null) {
      found = true;
      errors.push(diagnostic(path, source, match.index, 'aliased local-storage operation is forbidden in injected or dual-loaded code'));
    }
    if (!found) {
      errors.push(diagnostic(path, source, declarationOffset, 'captured local-storage alias is forbidden in injected or dual-loaded code'));
    }
  }
}

function extractCaptchaAction(source) {
  const start = source.search(/\bsolveCaptcha\s*:\s*async\b/);
  if (start < 0) return null;
  const nextAction = source.slice(start + 1).search(/\n\s{2}[A-Za-z_$][\w$]*\s*:\s*(?:async\s*)?\(/);
  return nextAction < 0 ? source.slice(start) : source.slice(start, start + 1 + nextAction);
}

function scanCaptchaBoundary(path, source, errors) {
  const action = extractCaptchaAction(source);
  if (!action) {
    errors.push(`${path}:1: solveCaptcha action could not be resolved; failing closed`);
    return;
  }
  for (const forbidden of ['captchaApiKey', 'apiKey', 'pageUrl']) {
    const match = new RegExp(`\\b${forbidden}\\b`).exec(maskComments(action));
    if (match) {
      const absoluteOffset = source.indexOf(action) + match.index;
      errors.push(diagnostic(
        path,
        source,
        absoluteOffset,
        `solveCaptcha content path must not read or send ${forbidden}`
      ));
    }
  }
}

function scanInjectedSecrets(path, source, errors) {
  const masked = maskComments(source);
  const secretSetting = /\bcaptchaApiKey\b/g;
  let match;
  while ((match = secretSetting.exec(masked)) !== null) {
    errors.push(diagnostic(path, source, match.index, 'CAPTCHA secret setting names are forbidden in injected code'));
  }
}

function scanGenericProxy(path, source, errors) {
  const masked = maskComments(source);
  const actionLiteral = /(?:case\s+|action\s*:\s*)(['"])([^'"]+)\1/gi;
  let match;
  while ((match = actionLiteral.exec(masked)) !== null) {
    const normalized = match[2].toLowerCase().replace(/[^a-z]/g, '');
    const hasArea = normalized.includes('storage') || normalized.includes('local');
    const hasOperation = ['get', 'set', 'remove', 'clear', 'read', 'write'].some((operation) =>
      normalized.includes(operation));
    if (hasArea && hasOperation) {
      errors.push(diagnostic(path, source, match.index, `generic storage proxy action is forbidden (${match[2]})`));
    }
  }

  const unrestrictedShape = /\brequest\s*\.\s*(?:key|keys|value|operation|storageArea)\b[\s\S]{0,320}?\bstorage\s*(?:\.\s*local|\[\s*['"]local['"]\s*\])/g;
  while ((match = unrestrictedShape.exec(masked)) !== null) {
    errors.push(diagnostic(path, source, match.index, 'generic key/value storage bridge is forbidden'));
  }

  const operationProxy = /\baction\s*:\s*(['"])(?:storage|local)\1[\s\S]{0,240}?\boperation\s*:\s*(['"])(?:get|set|remove|clear|read|write)\2/gi;
  while ((match = operationProxy.exec(masked)) !== null) {
    errors.push(diagnostic(path, source, match.index, 'generic operation-based storage bridge is forbidden'));
  }

  const requestOperationProxy = /\b(?:request|message)\s*\.\s*action\s*===?\s*(['"])(?:storage|local)\1[\s\S]{0,320}?\b(?:request|message)\s*\.\s*(?:operation|key|keys|value)\b/gi;
  while ((match = requestOperationProxy.exec(masked)) !== null) {
    errors.push(diagnostic(path, source, match.index, 'generic request-field storage bridge is forbidden'));
  }
}

function requireBackgroundBoundary(backgroundSource, errors) {
  const masked = maskComments(backgroundSource);
  const requirements = [
    [/\bTRUSTED_CONTEXTS\b/, 'background must establish the exact TRUSTED_CONTEXTS access level'],
    [/\binitializeFsbTrustedLocalBoundary\b/, 'background trusted-local initializer is missing'],
    [/\bfsbTrustedLocalBootPromise\b/, 'background must retain and await one idempotent trusted-local boot promise'],
    [/importScripts\s*\(\s*['"]utils\/trusted-local-feature-store\.js['"]\s*\)/,
      'background must load the literal background-only trusted-local-feature-store.js'],
    [/\bFsbTrustedLocalFeatureStore\b/, 'background must bind fixed handlers to FsbTrustedLocalFeatureStore']
  ];
  for (const [pattern, message] of requirements) {
    const match = pattern.exec(masked);
    if (!match) errors.push(`${BACKGROUND_PATH}:1: ${message}`);
  }

  const startMarker = backgroundSource.indexOf('FSB_TRUSTED_LOCAL_BOUNDARY_START');
  const endMarker = backgroundSource.indexOf('FSB_TRUSTED_LOCAL_BOUNDARY_END');
  if (startMarker < 0 || endMarker < 0 || endMarker <= startMarker) {
    errors.push(`${BACKGROUND_PATH}:1: marked trusted-local boundary block is missing or malformed`);
  }

  const accessPattern = /chrome\s*\.\s*storage\s*\.\s*local\s*\.\s*setAccessLevel\s*\(\s*\{\s*accessLevel\s*:\s*['"]TRUSTED_CONTEXTS['"]\s*\}\s*\)/g;
  const accessCalls = [...masked.matchAll(accessPattern)];
  if (accessCalls.length !== 1) {
    errors.push(`${BACKGROUND_PATH}:1: background must make exactly one exact TRUSTED_CONTEXTS setAccessLevel call (found ${accessCalls.length})`);
  }

  const accessBinding = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*chrome\s*\.\s*storage\s*\.\s*local\s*\.\s*setAccessLevel\s*\(\s*\{\s*accessLevel\s*:\s*['"]TRUSTED_CONTEXTS['"]\s*\}\s*\)/.exec(masked);
  if (!accessBinding) {
    errors.push(`${BACKGROUND_PATH}:1: TRUSTED_CONTEXTS result must be captured for confirmable awaited boot`);
  } else {
    const tail = masked.slice(accessBinding.index + accessBinding[0].length);
    const escapedBinding = accessBinding[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const awaitMatch = new RegExp(`\\bawait\\s+${escapedBinding}\\b`).exec(tail);
    const thenableMatch = new RegExp(`\\btypeof\\s+${escapedBinding}\\.then\\s*!==?\\s*['"]function['"]`).exec(tail);
    if (!awaitMatch || !thenableMatch) {
      errors.push(`${BACKGROUND_PATH}:1: setAccessLevel result must be confirmed as a thenable and awaited before trusted boot`);
    }
  }

  const initializer = masked.indexOf('function initializeFsbTrustedLocalBoundary');
  const bootInvocation = masked.search(/fsbTrustedLocalBootPromise\s*=\s*initializeFsbTrustedLocalBoundary\s*\(\s*\)/);
  const trustedImportMatch = /importScripts\s*\(\s*['"]utils\/trusted-local-feature-store\.js['"]\s*\)/.exec(masked);
  const trustedImport = trustedImportMatch ? trustedImportMatch.index : -1;
  const storeCreate = masked.search(/FsbTrustedLocalFeatureStore\s*\.\s*create\s*\(/);
  const accessIndex = accessCalls.length === 1 ? accessCalls[0].index : -1;
  if (initializer < 0 || bootInvocation < 0 || trustedImport < 0 ||
      initializer > bootInvocation || bootInvocation > trustedImport) {
    errors.push(`${BACKGROUND_PATH}:1: TRUSTED_CONTEXTS initializer must be invoked before trusted feature-store load`);
  }
  if (accessIndex < 0 || storeCreate < 0 || accessIndex > storeCreate) {
    errors.push(`${BACKGROUND_PATH}:1: trusted feature store must be created only after TRUSTED_CONTEXTS setup begins`);
  }
  if (startMarker >= 0 && endMarker > startMarker && accessIndex >= 0 &&
      (accessIndex < startMarker || accessIndex > endMarker)) {
    errors.push(`${BACKGROUND_PATH}:1: exact TRUSTED_CONTEXTS call must remain inside the marked boot block`);
  }

  const corpusImportCandidates = [
    masked.indexOf("importScripts('utils/skopeo-corpus-store.js')"),
    masked.indexOf('FsbSkopeoCorpusStore')
  ].filter((index) => index >= 0);
  for (const corpusImport of corpusImportCandidates) {
    if (bootInvocation < 0 || bootInvocation > corpusImport) {
      errors.push(`${BACKGROUND_PATH}:1: TRUSTED_CONTEXTS initializer invocation must precede the Phase 54 corpus-store boot seam`);
    }
  }
}

function scanGraphRuntime(path, source, errors) {
  const masked = maskComments(source);
  const forbidden = [
    [/\b(?:chrome|browser)\s*(?:\.\s*storage|\[\s*['"]storage['"]\s*\])/g,
      'graph modules must receive the private storage area and never access generic browser storage'],
    [/\b(?:eval\s*\(|new\s+Function\s*\(|import\s*\()/g,
      'dynamic code loading or evaluation is forbidden in graph modules'],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/g,
      'graph modules may not create a remote runtime or host connection'],
    [/\b(?:indexedDB|IDBDatabase|child_process|Deno|Bun\.spawn)\b/g,
      'database, Python, or process runtimes are forbidden in graph modules'],
    [/\b(?:JMESPath|jmespath|Cypher|Gremlin|SPARQL|jsonpath)\b/g,
      'dynamic or arbitrary graph query languages are forbidden'],
    [/\b(?:embedding|embeddings|vectorStore|vectorDatabase)\b/gi,
      'embedding and vector runtimes are outside the local lexical graph boundary'],
    [/\b(?:registerMcp\w*|registerTool\w*|createServer|listen\s*\(|daemon)\b/gi,
      'MCP, tool, server, and daemon registration is forbidden in graph modules'],
    [/\bgraphify\b|Graphify-Labs/gi,
      'Graphify is conceptual provenance only and cannot be a runtime dependency'],
    [/\b(?:python|python3|\.py\b)\b/gi,
      'Python runtime dependencies are forbidden in graph modules']
  ];
  for (const [pattern, message] of forbidden) {
    let match;
    while ((match = pattern.exec(masked)) !== null) {
      errors.push(diagnostic(path, source, match.index, message));
    }
  }
}

function scanTruthRuntime(path, source, errors) {
  const masked = maskComments(source);
  const forbidden = [
    [/\b(?:chrome|browser)\s*(?:\.\s*storage|\[\s*['"]storage['"]\s*\])/g,
      'truth modules must receive narrow private dependencies and never access generic browser storage'],
    [/\b(?:eval\s*\(|new\s+Function\s*\(|import\s*\()/g,
      'dynamic code loading or evaluation is forbidden in truth modules'],
    [/\bDate\s*\.\s*parse\s*\(|\bnew\s+Date\s*\(\s*(?!\s*\))/g,
      'implicit or string-based host date parsing is forbidden in truth modules'],
    [/\b(?:toLocaleDateString|toLocaleString|Intl\s*\.\s*DateTimeFormat)\s*\(/g,
      'locale-derived date or timezone behavior is forbidden in truth modules'],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/g,
      'truth modules may use only the injected configured-provider boundary'],
    [/\b(?:indexedDB|IDBDatabase|child_process|Deno|Bun\.spawn)\b/g,
      'database, Python, or process runtimes are forbidden in truth modules'],
    [/\b(?:JMESPath|jmespath|Cypher|Gremlin|SPARQL|jsonpath)\b/g,
      'generic expressions and query languages are forbidden in truth modules'],
    [/\b(?:embedding|embeddings|vectorStore|vectorDatabase|RAG)\b/gi,
      'embedding, vector, and RAG runtimes are outside the exact-set truth boundary'],
    [/\b(?:registerMcp\w*|registerTool\w*|createServer|listen\s*\(|daemon)\b/gi,
      'MCP, tool, server, and daemon registration is forbidden in truth modules'],
    [/\bchrome\s*\.\s*(?:alarms|notifications)\b/g,
      'truth modules may not schedule alarms or notifications'],
    [/\b(?:createSchedule|scheduleNotification|sendNotification|alertLedger)\s*\(/gi,
      'scheduling, delivery, and alert-ledger effects are forbidden in truth modules']
  ];
  for (const [pattern, message] of forbidden) {
    let match;
    while ((match = pattern.exec(masked)) !== null) {
      errors.push(diagnostic(path, source, match.index, message));
    }
  }

  if (path !== 'extension/utils/skopeo-truth-store.js') {
    const storage = /\bstorageArea\b|\bstorage\s*\.\s*(?:get|set|remove|clear)\s*\(/g;
    let match;
    while ((match = storage.exec(masked)) !== null) {
      errors.push(diagnostic(
        path,
        source,
        match.index,
        'direct durable storage is reserved to skopeo-truth-store.js'
      ));
    }
  }

  if (path !== 'extension/utils/skopeo-truth-extractor.js') {
    const provider = /\b(?:buildRequest|sendRequest|parseResponse)\s*\(/g;
    let match;
    while ((match = provider.exec(masked)) !== null) {
      errors.push(diagnostic(
        path,
        source,
        match.index,
        'raw provider access is reserved to skopeo-truth-extractor.js'
      ));
    }
  }

  if (path === 'extension/utils/skopeo-truth-engine.js') {
    const graphInternals = /\b(?:graphStore|graphQuery)\b|\.searchLexical\s*\(|\.neighbors\s*\(/g;
    let match;
    while ((match = graphInternals.exec(masked)) !== null) {
      errors.push(diagnostic(
        path,
        source,
        match.index,
        'truth engine may consume only the frozen exact-set graph facade'
      ));
    }
  }
}

function scanAlertRuntime(path, source, errors) {
  const masked = maskComments(source);
  const forbidden = [
    [/\b(?:eval\s*\(|new\s+Function\s*\(|import\s*\()/g,
      'dynamic code loading or evaluation is forbidden in alert modules'],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/g,
      'alert modules may not add a network delivery path'],
    [/\b(?:registerMcp\w*|registerTool\w*|createServer|listen\s*\(|daemon)\b/gi,
      'MCP, tool, server, and daemon registration is forbidden in alert modules'],
    [/\b(?:UniversalProvider|sendRequest|buildPrompt|providerFactory)\b/g,
      'model/provider authority is forbidden in alert modules'],
    [/\b(?:content|skopeo-shell|skopeo-runtime|telemetry)\b/gi,
      'alert modules may not expose content, shell, or telemetry authority']
  ];
  for (const [pattern, message] of forbidden) {
    let match;
    while ((match = pattern.exec(masked)) !== null) {
      errors.push(diagnostic(path, source, match.index, message));
    }
  }
  if (path !== 'extension/utils/skopeo-alert-store.js' && /\bstorageArea\b/.test(masked)) {
    errors.push(`${path}:1: only the alert store may receive trusted storage`);
  }
  if (/\b(?:chrome|browser)\s*(?:\.\s*storage|\[\s*['"]storage['"]\s*\])/.test(masked)) {
    errors.push(`${path}:1: alert modules must receive narrow injected storage and never access generic browser storage`);
  }
}

function requireTruthBoundary(
  backgroundSource,
  manifestSource,
  closure,
  root,
  sourceOverrides,
  errors
) {
  const masked = maskComments(backgroundSource);
  const graphTail = masked.indexOf("importScripts('utils/skopeo-graph-engine.js')");
  let prior = graphTail;
  if (graphTail < 0) {
    errors.push(`${BACKGROUND_PATH}:1: truth dependency order requires the Phase 55 graph engine import`);
  }
  for (const importPath of TRUTH_IMPORT_PATHS) {
    const needle = `importScripts('${importPath}')`;
    const first = masked.indexOf(needle);
    const second = first < 0 ? -1 : masked.indexOf(needle, first + needle.length);
    if (first < 0 || first <= prior || second >= 0) {
      errors.push(`${BACKGROUND_PATH}:1: ${importPath} must load exactly once after the graph chain in truth dependency order`);
    }
    if (first >= 0) prior = first;
  }

  for (const path of TRUTH_MODULE_PATHS) {
    const source = readWithOverrides(root, path, sourceOverrides);
    if (source === null) {
      errors.push(`${path}:1: private truth module is missing`);
      continue;
    }
    scanTruthRuntime(path, source, errors);
    if (closure.has(path) ||
        manifestSource.includes(path.slice('extension/'.length))) {
      errors.push(`${path}:1: private truth module must remain background-only`);
    }
  }

  const start = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_START */');
  const end = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_END */');
  if (start < 0 || end <= start) {
    errors.push(`${BACKGROUND_PATH}:1: truth-aware corpus boundary markers are missing`);
    return;
  }
  const boundary = maskComments(backgroundSource.slice(start, end));
  const requirements = [
    [/FsbSkopeoTruthStore\s*\.\s*create\s*\(/,
      'truth store must be constructed inside trusted boot'],
    [/FsbSkopeoTruthExtractor\s*\.\s*create\s*\(/,
      'truth extractor must be constructed inside trusted boot'],
    [/FsbSkopeoLineageAdjudicator\s*\.\s*create\s*\(/,
      'lineage adjudicator must be constructed inside trusted boot'],
    [/graphStore\.registerTruthInvalidator\s*\(\s*truthStore\.graphInvalidator\s*\)/,
      'truth invalidator must register with graph storage'],
    [/participantName\s*===\s*['"]citations['"][\s\S]{0,100}?truthStore\.getPurgeParticipant\s*\(\s*participantName\s*\)/,
      'citations must bind to the real truth owner'],
    [/emptyReserved\s*=\s*participantName\s*===\s*['"]counts['"]/,
      'counts must remain the sole empty reserved owner'],
    [/participantName\s*===\s*['"]alerts['"][\s\S]{0,100}?alertStore\.getPurgeParticipant\s*\(\s*participantName\s*\)/,
      'alerts must bind to the real Phase 59 owner'],
    [/truthStore\.recover\s*\(\s*truthRecoveryGuard\s*\)/,
      'truth durable-only recovery is required'],
    [/fsbSkopeoTruthEngineFacade\s*=\s*globalThis\.FsbSkopeoTruthEngine\.create\s*\(/,
      'one frozen private truth facade must be created after truth recovery']
  ];
  for (const [pattern, message] of requirements) {
    if (!pattern.test(boundary)) {
      errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: ${message}`);
    }
  }
  if (/globalThis\s*\.\s*fsbSkopeoTruthEngineFacade\s*=/.test(boundary)) {
    errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: truth facade must never be published as a global capability`);
  }

  const truthStore = boundary.indexOf('globalThis.FsbSkopeoTruthStore.create');
  const invalidator = boundary.indexOf('graphStore.registerTruthInvalidator');
  const participants = boundary.indexOf('store.registerAuthorizedPurgeParticipant');
  const corpusRecovery = boundary.indexOf('store.recover({}, recoveryGuard)');
  const graphRecovery = boundary.indexOf('graphStore.recover(graphRecoveryGuard)');
  const graphFacade = boundary.indexOf(
    'fsbSkopeoGraphEngineFacade = globalThis.FsbSkopeoGraphEngine.create');
  const truthRecovery = boundary.indexOf('truthStore.recover(truthRecoveryGuard)');
  const truthFacade = boundary.indexOf(
    'fsbSkopeoTruthEngineFacade = globalThis.FsbSkopeoTruthEngine.create');
  if (truthStore < 0 || invalidator <= truthStore || participants <= invalidator ||
      corpusRecovery <= participants || graphRecovery <= corpusRecovery ||
      graphFacade <= graphRecovery || truthRecovery <= graphFacade ||
      truthFacade <= truthRecovery) {
    errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: truth construction, invalidation, participants, corpus/graph recovery, graph facade, truth recovery, and truth facade must remain strictly ordered`);
  }

  const bootStart = boundary.indexOf('function initializeFsbSkopeoCorpusBoundary');
  const bootSource = bootStart >= 0 ? boundary.slice(bootStart) : boundary;
  const bootHydration =
    /\b(?:readActiveFamily|readActiveFamilyMetadata|snapshotExactSet|sendRequest)\s*\(/.exec(
      bootSource.slice(0, truthFacade >= bootStart ? truthFacade - bootStart : undefined)
    );
  if (bootHydration) {
    errors.push(diagnostic(
      BACKGROUND_PATH,
      backgroundSource,
      start + bootStart + bootHydration.index,
      'trusted truth boot must not hydrate graph/truth state or contact a provider'
    ));
  }

  const outsideBoundary = masked.slice(0, start) + masked.slice(end);
  const exposed = /\bfsbSkopeoTruthEngineFacade\b/.exec(outsideBoundary);
  if (exposed) {
    errors.push(diagnostic(
      BACKGROUND_PATH,
      backgroundSource,
      exposed.index,
      'truth facade must not be referenced by a generic message, content, MCP, or UI surface'
    ));
  }
}

function requireAlertBoundary(backgroundSource, manifestSource, closure, root, sourceOverrides, errors) {
  const masked = maskComments(backgroundSource);
  const priorImport = masked.indexOf("importScripts('utils/skopeo-decision-policy.js')");
  let prior = priorImport;
  if (priorImport < 0) {
    errors.push(`${BACKGROUND_PATH}:1: alert dependency order requires the decision-policy import`);
  }
  for (const importPath of ALERT_IMPORT_PATHS) {
    const needle = `importScripts('${importPath}')`;
    const first = masked.indexOf(needle);
    const second = first < 0 ? -1 : masked.indexOf(needle, first + needle.length);
    if (first < 0 || first <= prior || second >= 0) {
      errors.push(`${BACKGROUND_PATH}:1: ${importPath} must load exactly once in alert dependency order`);
    }
    if (first >= 0) prior = first;
  }
  for (const path of ALERT_MODULE_PATHS) {
    const source = readWithOverrides(root, path, sourceOverrides);
    if (source === null) {
      errors.push(`${path}:1: private alert module is missing`);
      continue;
    }
    scanAlertRuntime(path, source, errors);
    scanLocalStorage(path, source, errors);
    scanInjectedSecrets(path, source, errors);
    if (closure.has(path) || manifestSource.includes(path.slice('extension/'.length))) {
      errors.push(`${path}:1: private alert module must remain background-only`);
    }
  }
  const start = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_START */');
  const end = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_END */');
  if (start < 0 || end <= start) {
    errors.push(`${BACKGROUND_PATH}:1: alert-aware corpus boundary markers are missing`);
    return;
  }
  const boundary = maskComments(backgroundSource.slice(start, end));
  const requirements = [
    [/FsbSkopeoAlertStore\s*\.\s*create\s*\(/,
      'alert store must be constructed inside trusted boot'],
    [/FsbSkopeoAlertEngine\s*\.\s*create\s*\(/,
      'alert engine must be constructed inside trusted boot'],
    [/participantName\s*===\s*['"]alerts['"][\s\S]{0,100}?alertStore\.getPurgeParticipant/,
      'the reserved alerts participant must use the real alert store binder'],
    [/alertStore\.recover\s*\(\s*\)/,
      'alert durable recovery is required before corpus recovery'],
    [/fsbSkopeoAlertStoreFacade\s*=\s*alertStore/,
      'one private alert store facade must be retained'],
    [/fsbSkopeoAlertEngineFacade\s*=\s*alertEngine/,
      'one private alert engine facade must be retained']
  ];
  for (const [pattern, message] of requirements) {
    if (!pattern.test(boundary)) {
      errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: ${message}`);
    }
  }
  const alertStore = boundary.indexOf('globalThis.FsbSkopeoAlertStore.create');
  const participants = boundary.indexOf('store.registerAuthorizedPurgeParticipant');
  const alertRecovery = boundary.indexOf('alertStore.recover()');
  const corpusRecovery = boundary.indexOf('store.recover({}, recoveryGuard)');
  if (alertStore < 0 || participants <= alertStore || alertRecovery <= participants ||
      corpusRecovery <= alertRecovery) {
    errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: alert store, participant registration, alert recovery, and corpus recovery must remain strictly ordered`);
  }
  if (/globalThis\s*\.\s*fsbSkopeoAlert(?:Store|Engine)Facade\s*=/.test(boundary)) {
    errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: alert facades must never be published as global capabilities`);
  }
}

function requireGraphBoundary(backgroundSource, manifestSource, closure, root, sourceOverrides, errors) {
  const masked = maskComments(backgroundSource);
  const corpusTail = masked.indexOf("importScripts('utils/skopeo-drive-reconciler.js')");
  let prior = corpusTail;
  if (corpusTail < 0) {
    errors.push(`${BACKGROUND_PATH}:1: graph dependency order requires the Phase 54 reconciler import`);
  }
  for (const importPath of GRAPH_IMPORT_PATHS) {
    const needle = `importScripts('${importPath}')`;
    const first = masked.indexOf(needle);
    const second = first < 0 ? -1 : masked.indexOf(needle, first + needle.length);
    if (first < 0 || first <= prior || second >= 0) {
      errors.push(`${BACKGROUND_PATH}:1: ${importPath} must load exactly once after the Phase 54 chain in graph dependency order`);
    }
    if (first >= 0) prior = first;
  }

  for (const path of GRAPH_MODULE_PATHS) {
    const source = readWithOverrides(root, path, sourceOverrides);
    if (source === null) {
      errors.push(`${path}:1: private graph module is missing`);
      continue;
    }
    scanGraphRuntime(path, source, errors);
    if (closure.has(path) || manifestSource.includes(path.slice('extension/'.length))) {
      errors.push(`${path}:1: private graph module must remain background-only`);
    }
  }

  const start = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_START */');
  const end = backgroundSource.indexOf('/* FSB_SKOPEO_CORPUS_BOUNDARY_END */');
  if (start < 0 || end <= start) {
    errors.push(`${BACKGROUND_PATH}:1: graph-aware corpus boundary markers are missing`);
    return;
  }
  const boundary = maskComments(backgroundSource.slice(start, end));
  const participantList = /participantNames\s*=\s*\[\s*['"]fragments['"]\s*,\s*['"]indexes['"]\s*,\s*['"]citations['"]\s*,\s*['"]counts['"]\s*,\s*['"]relationships['"]\s*,\s*['"]result-cache['"]\s*,\s*['"]alerts['"]\s*\]/.exec(boundary);
  if (!participantList) {
    errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: graph purge participants must be the exact seven-name closed set`);
  }
  const requirements = [
    [/FsbSkopeoGraphStore\s*\.\s*create\s*\(/,
      'graph store must be constructed inside trusted boot'],
    [/FsbSkopeoGraphQuery\s*\.\s*create\s*\(/,
      'graph query owner must be constructed inside trusted boot'],
    [/FsbSkopeoGraphExtractor\s*\.\s*create\s*\(/,
      'graph extractor must be constructed inside trusted boot'],
    [/registerCacheOwner\s*\(\s*graphQuery\.cacheOwner\s*\)/,
      'graph query cache owner must register without hydration'],
    [/registerAuthorizedPurgeParticipant\s*\(/,
      'all graph and reserved participants must use the corpus authorization verifier'],
    [/getPurgeParticipant\s*\(\s*participantName\s*\)/,
      'the four graph-owned participant binders must come from graph storage'],
    [/fsbAuthorizedEmptyPurgeParticipant\s*\(\s*\)/,
      'only the three reserved participants may use the exact empty binder'],
    [/store\.recover\s*\(\s*\{\}\s*,\s*recoveryGuard\s*\)/,
      'corpus durable recovery is required'],
    [/graphStore\.recover\s*\(\s*graphRecoveryGuard\s*\)/,
      'graph durable-only recovery is required'],
    [/fsbSkopeoGraphEngineFacade\s*=\s*globalThis\.FsbSkopeoGraphEngine\.create\s*\(/,
      'one frozen background graph facade must be created after recovery']
  ];
  for (const [pattern, message] of requirements) {
    if (!pattern.test(boundary)) {
      errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: ${message}`);
    }
  }
  if (/\bregisterPurgeParticipant\s*\(/.test(boundary)) {
    errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: legacy purge registration is forbidden in graph-aware boot`);
  }
  const cacheOwner = boundary.indexOf('registerCacheOwner');
  const participantRegistration = boundary.indexOf('registerAuthorizedPurgeParticipant');
  const corpusRecovery = boundary.indexOf('store.recover({}, recoveryGuard)');
  const graphRecovery = boundary.indexOf('graphStore.recover(graphRecoveryGuard)');
  const facade = boundary.indexOf('fsbSkopeoGraphEngineFacade = globalThis.FsbSkopeoGraphEngine.create');
  if (cacheOwner < 0 || participantRegistration <= cacheOwner || corpusRecovery <= participantRegistration ||
      graphRecovery <= corpusRecovery || facade <= graphRecovery) {
    errors.push(`${BACKGROUND_PATH}:${sourceLine(backgroundSource, start)}: graph cache, participants, corpus recovery, graph recovery, and facade must remain strictly ordered`);
  }
  const bootHydration = /\b(?:readCurrentFragment|readActiveShards|createScope|ensureScopeCache|deriveFragmentGenerationId)\s*\(/.exec(boundary);
  if (bootHydration) {
    errors.push(diagnostic(BACKGROUND_PATH, backgroundSource, start + bootHydration.index,
      'trusted boot must not hydrate current graph generations, shards, or query caches'));
  }

  const outsideBoundary = masked.slice(0, start) + masked.slice(end);
  const exposed = /\bfsbSkopeoGraphEngineFacade\b/.exec(outsideBoundary);
  if (exposed) {
    errors.push(diagnostic(BACKGROUND_PATH, backgroundSource, exposed.index,
      'graph facade must not be referenced by a generic message, content, MCP, or UI surface'));
  }
}

export function verifyStorageBoundary(options = {}) {
  const root = resolve(options.root || DEFAULT_ROOT);
  const sourceOverrides = options.sourceOverrides || Object.create(null);
  const errors = [];
  const absoluteRoot = `${root}${sep}`;
  if (!resolve(root, BACKGROUND_PATH).startsWith(absoluteRoot)) {
    return { ok: false, errors: ['repository root containment check failed'], injectedFiles: [] };
  }

  const backgroundSource = readWithOverrides(root, BACKGROUND_PATH, sourceOverrides);
  const manifestSource = readWithOverrides(root, MANIFEST_PATH, sourceOverrides);
  if (backgroundSource === null) errors.push(`${BACKGROUND_PATH}:1: background source is missing`);
  if (manifestSource === null) errors.push(`${MANIFEST_PATH}:1: manifest source is missing`);
  if (errors.length) return { ok: false, errors, injectedFiles: [] };

  let manifest;
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    errors.push(`${MANIFEST_PATH}:1: manifest parse failed closed: ${error.message}`);
    return { ok: false, errors, injectedFiles: [] };
  }

  const manifestContentFiles = [];
  if (!Array.isArray(manifest.content_scripts)) {
    errors.push(`${MANIFEST_PATH}:1: content_scripts must be a resolvable array`);
  } else {
    for (const entry of manifest.content_scripts) {
      if (!entry || !Array.isArray(entry.js) || entry.js.some((path) => typeof path !== 'string')) {
        errors.push(`${MANIFEST_PATH}:1: every manifest content-script entry must have literal js paths`);
        continue;
      }
      for (const path of entry.js) manifestContentFiles.push(`${EXTENSION_ROOT}/${path}`);
    }
  }

  const contentFiles = parseLiteralArray(backgroundSource, 'CONTENT_SCRIPT_FILES', errors);
  const skopeoFiles = parseLiteralArray(backgroundSource, 'SKOPEO_INJECTION_FILES', errors);
  const roots = new Set([...manifestContentFiles, ...contentFiles, ...skopeoFiles]);
  const closure = new Set();
  const pending = [...roots];
  while (pending.length) {
    const path = pending.shift();
    if (closure.has(path)) continue;
    closure.add(path);
    const source = readWithOverrides(root, path, sourceOverrides);
    if (source === null) {
      errors.push(`${path}:1: injected dependency is missing; failing closed`);
      continue;
    }
    for (const dependency of literalDependencies(path, source)) {
      if (!closure.has(dependency)) pending.push(dependency);
    }
  }

  for (const path of closure) {
    const source = readWithOverrides(root, path, sourceOverrides);
    if (source !== null) {
      scanLocalStorage(path, source, errors);
      scanInjectedSecrets(path, source, errors);
    }
  }
  for (const path of PINNED_STORAGE_FREE_FILES) {
    const source = readWithOverrides(root, path, sourceOverrides);
    if (source === null) errors.push(`${path}:1: pinned storage-free source is missing`);
    else {
      scanLocalStorage(path, source, errors);
      scanInjectedSecrets(path, source, errors);
    }
  }

  if (closure.has(TRUSTED_STORE_PATH) || roots.has(TRUSTED_STORE_PATH) || manifestSource.includes('trusted-local-feature-store.js')) {
    errors.push(`${TRUSTED_STORE_PATH}:1: trusted feature store must be background-only and absent from manifest/injection dependency closure`);
  }
  if (readWithOverrides(root, TRUSTED_STORE_PATH, sourceOverrides) === null) {
    errors.push(`${TRUSTED_STORE_PATH}:1: background-only trusted feature store is missing`);
  }

  const actionsSource = readWithOverrides(root, 'extension/content/actions.js', sourceOverrides);
  if (actionsSource !== null) scanCaptchaBoundary('extension/content/actions.js', actionsSource, errors);
  requireBackgroundBoundary(backgroundSource, errors);
  requireGraphBoundary(
    backgroundSource,
    manifestSource,
    closure,
    root,
    sourceOverrides,
    errors
  );
  requireTruthBoundary(
    backgroundSource,
    manifestSource,
    closure,
    root,
    sourceOverrides,
    errors
  );
  requireAlertBoundary(
    backgroundSource,
    manifestSource,
    closure,
    root,
    sourceOverrides,
    errors
  );
  scanGenericProxy(BACKGROUND_PATH, backgroundSource, errors);
  for (const path of closure) {
    const source = readWithOverrides(root, path, sourceOverrides);
    if (source !== null) scanGenericProxy(path, source, errors);
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)].sort(),
    injectedFiles: [...closure].sort()
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyStorageBoundary();
  if (!result.ok) {
    console.error(`verify-skopeo-storage-boundary: ${result.errors.length} failure(s)`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`verify-skopeo-storage-boundary: PASS (${result.injectedFiles.length} injected/dependency files checked)`);
}
