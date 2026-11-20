/**
 * Phase 66 run identity and preflight (D-18, D-19).
 *
 * Identity is canonical and hashable: canonical JSON, SHA-256 digests, the
 * git SHA with a dirty flag, and a tools/list digest. It records ids,
 * versions, model and provider names, and digests only.
 *
 * evaluatePreflight refuses a run that would measure the wrong thing: the
 * Web Store extension, a build without the Phase 66 measurement marker, an
 * autopilot arm on anything but the api-kind xAI provider pinned to grok-4.3,
 * a Claude run without an explicit model, a 7225 hub the runner's own server
 * does not own, an empty tool list, or a dirty tree for a campaign. Refusal
 * details may name model and provider strings and never echo any other
 * config value.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const WEB_STORE_EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';
export const PINNED_AUTOPILOT_MODEL = 'grok-4.3';
export const SERVED_MODEL_PATTERN = /^grok-4\.3/;

export const PREFLIGHT_REFUSAL_CODES = Object.freeze([
  'config_unavailable',
  'measurement_marker_missing',
  'webstore_extension_loaded',
  'extension_id_mismatch',
  'provider_kind_not_api',
  'provider_not_xai',
  'model_not_pinned',
  'claude_model_required',
  'hub_not_owned',
  'dirty_tree',
  'tool_list_empty',
]);

const MAX_GIT_OUTPUT = 16 * 1024 * 1024;
const MAX_NAMED_LENGTH = 80;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function codeUnitCompare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// Sorted keys at every depth, undefined and function values dropped, array
// order kept, TypeError on a cycle (shared, non-cyclic references are fine).
// Same semantics as stableJson in extension/utils/mcp-lattice-journal.js.
export function canonicalJson(value) {
  const seen = new Set();
  const normalize = (node) => {
    if (node === null || typeof node !== 'object') return node;
    if (seen.has(node)) throw new TypeError('Circular value cannot be canonicalized');
    seen.add(node);
    let out;
    if (Array.isArray(node)) {
      out = node.map(normalize);
    } else {
      out = {};
      for (const key of Object.keys(node).sort()) {
        const child = node[key];
        if (child !== undefined && typeof child !== 'function') out[key] = normalize(child);
      }
    }
    seen.delete(node);
    return out;
  };
  return JSON.stringify(normalize(value === undefined ? null : value));
}

export function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

// Digest of an MCP tools/list payload: each tool projected to
// { name, description, inputSchema }, sorted by name, canonical JSON, SHA-256.
export function toolsListDigest(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const projected = list
    .map((tool) => ({
      name: tool && tool.name,
      description: tool && tool.description,
      inputSchema: tool && tool.inputSchema,
    }))
    .map((entry) => ({ entry, key: String(entry.name), json: canonicalJson(entry) }))
    .sort((a, b) => codeUnitCompare(a.key, b.key) || codeUnitCompare(a.json, b.json))
    .map(({ entry }) => entry);
  return { count: list.length, sha256: sha256Hex(canonicalJson(projected)) };
}

function runGit(repoRoot, args, label) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: MAX_GIT_OUTPUT,
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) throw new Error(`${label} failed`);
  return Buffer.from(result.stdout).toString('utf8');
}

// { sha, dirty, dirtyPaths } for the checkout at repoRoot. Only tracked
// changes count; untracked files never make a tree dirty.
export function gitIdentity(repoRoot) {
  const sha = runGit(repoRoot, ['rev-parse', 'HEAD'], 'git rev-parse HEAD').trim();
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(sha)) throw new Error('git rev-parse HEAD returned an invalid sha');
  const status = runGit(repoRoot, ['status', '--porcelain', '-z', '--untracked-files=no'], 'git status');
  const parts = status.split('\0');
  const dirtyPaths = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    dirtyPaths.push(entry.slice(3));
    // Renames and copies carry their original path as the next NUL field.
    if (entry[0] === 'R' || entry[0] === 'C') i += 1;
  }
  return { sha, dirty: dirtyPaths.length > 0, dirtyPaths };
}

// True when the model string the provider returned is a grok-4.3 variant.
export function servedModelMatches(model) {
  return typeof model === 'string' && SERVED_MODEL_PATTERN.test(model);
}

function named(value) {
  if (typeof value !== 'string') return 'unset';
  const bounded = value.length > MAX_NAMED_LENGTH ? `${value.slice(0, MAX_NAMED_LENGTH)}...` : value;
  return JSON.stringify(bounded);
}

function isPid(value) {
  return Number.isInteger(value) && value > 0;
}

// Returns { ok, refusals: [{ code, detail }] }. Input:
// { mode: 'preflight'|'smoke'|'campaign', arms: ['autopilot'|'claude'|...],
//   configPayload: the parsed fsb://config resource, hub: { listenerPid, serverPid },
//   claudeModel, expectExtensionId, git: { dirty }, allowDirty, toolsList: { count } }
export function evaluatePreflight(input) {
  const {
    mode, arms, configPayload, hub, claudeModel, expectExtensionId, git, allowDirty, toolsList,
  } = isPlainObject(input) ? input : {};
  const armList = Array.isArray(arms) ? arms : [];
  const refusals = [];
  const refuse = (code, detail) => refusals.push({ code, detail });

  const config = isPlainObject(configPayload) && configPayload.success !== false && isPlainObject(configPayload.config)
    ? configPayload.config
    : null;
  if (!config) {
    refuse('config_unavailable', 'fsb://config returned no config object; is the extension connected to the runner\'s hub?');
  } else {
    const extension = isPlainObject(configPayload.extension) ? configPayload.extension : {};
    const measurement = isPlainObject(extension.measurement) ? extension.measurement : {};
    if (measurement.callTiming !== 1 || measurement.sessionDetailJournal !== 1) {
      refuse('measurement_marker_missing', 'the loaded extension has no Phase 66 measurement marker; load or reload the worktree build');
    }
    if (extension.id === WEB_STORE_EXTENSION_ID) {
      refuse('webstore_extension_loaded', 'the Web Store extension is loaded; benchmark runs need the unpacked worktree build');
    }
    if (typeof expectExtensionId === 'string' && expectExtensionId && extension.id !== expectExtensionId) {
      refuse('extension_id_mismatch', 'the loaded extension id does not match the expected extension id');
    }
    if (armList.includes('autopilot')) {
      if (config.providerKind !== 'api') {
        refuse('provider_kind_not_api', `providerKind is ${named(config.providerKind)}; the autopilot arm needs "api"`);
      }
      if (config.modelProvider !== 'xai') {
        refuse('provider_not_xai', `modelProvider is ${named(config.modelProvider)}; the autopilot arm needs "xai"`);
      }
      if (config.modelName !== PINNED_AUTOPILOT_MODEL) {
        refuse('model_not_pinned', `modelName is ${named(config.modelName)}; the autopilot arm is pinned to "${PINNED_AUTOPILOT_MODEL}"`);
      }
    }
  }

  if (armList.includes('claude') && (mode === 'smoke' || mode === 'campaign')
    && !(typeof claudeModel === 'string' && claudeModel.trim())) {
    refuse('claude_model_required', '--claude-model is required for Claude smoke and campaign runs');
  }

  const listenerPid = isPlainObject(hub) ? hub.listenerPid : undefined;
  const serverPid = isPlainObject(hub) ? hub.serverPid : undefined;
  if (!isPid(listenerPid) || !isPid(serverPid)) {
    refuse('hub_not_owned', 'the 7225 listener or the runner server pid is unknown; the runner must own the hub');
  } else if (listenerPid !== serverPid) {
    refuse('hub_not_owned', `7225 is held by pid ${listenerPid}, not the runner's server (pid ${serverPid})`);
  }

  if (mode === 'campaign' && allowDirty !== true && !(isPlainObject(git) && git.dirty === false)) {
    refuse('dirty_tree', 'campaigns need a clean tracked tree (or an explicit allowDirty)');
  }

  if (!isPlainObject(toolsList) || !Number.isInteger(toolsList.count) || toolsList.count <= 0) {
    refuse('tool_list_empty', 'tools/list returned no tools');
  }

  return { ok: refusals.length === 0, refusals };
}
