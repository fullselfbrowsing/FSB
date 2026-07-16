import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import {
  CLAUDE_CODE_ADAPTER_ID,
  freezeSpawnSpec,
  type AgentTask,
  type SpawnContext,
  type SpawnSpec,
} from './adapter.js';
import { getAdapterCompatibilityContract } from './compatibility.js';

function requireClaudeCompatibility() {
  const compatibility = getAdapterCompatibilityContract(CLAUDE_CODE_ADAPTER_ID);
  if (!compatibility) {
    throw new Error('Claude Code compatibility contract is unavailable');
  }
  return compatibility;
}

const CLAUDE_COMPATIBILITY = requireClaudeCompatibility();

export const CLAUDE_TASK_LIMIT_BYTES = 64 * 1024;

const DENIED_TOOLS = Object.freeze([
  'Bash',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
] as const);

interface ShippedFsbAgentPolicy {
  readonly name: 'fsb';
  readonly description: string;
  readonly prompt: string;
  readonly tools: readonly ['mcp__fsb'];
  readonly disallowedTools: typeof DENIED_TOOLS;
  readonly permissionMode: 'dontAsk';
  readonly maxTurns: 40;
}

const STATIC_AGENT_KEYS = Object.freeze([
  'description',
  'disallowedTools',
  'maxTurns',
  'name',
  'permissionMode',
  'prompt',
  'tools',
]);

function loadStaticAgentPolicy(): ShippedFsbAgentPolicy {
  const assetUrl = new URL('../../ai/agents/fsb.json', import.meta.url);
  const parsed = JSON.parse(readFileSync(assetUrl, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid shipped FSB agent policy');
  }
  const policy = parsed as Record<string, unknown>;
  const keys = Object.keys(policy).sort();
  if (JSON.stringify(keys) !== JSON.stringify(STATIC_AGENT_KEYS)) {
    throw new Error('Invalid shipped FSB agent policy keys');
  }
  if (
    policy.name !== 'fsb'
    || typeof policy.description !== 'string'
    || policy.description.length < 24
    || typeof policy.prompt !== 'string'
    || policy.prompt.length < 200
    || !Array.isArray(policy.tools)
    || policy.tools.length !== 1
    || policy.tools[0] !== 'mcp__fsb'
    || !Array.isArray(policy.disallowedTools)
    || JSON.stringify(policy.disallowedTools) !== JSON.stringify(DENIED_TOOLS)
    || policy.permissionMode !== 'dontAsk'
    || policy.maxTurns !== 40
  ) {
    throw new Error('Invalid shipped FSB agent policy values');
  }
  return Object.freeze({
    name: 'fsb',
    description: policy.description,
    prompt: policy.prompt,
    tools: Object.freeze(['mcp__fsb'] as const),
    disallowedTools: DENIED_TOOLS,
    permissionMode: 'dontAsk',
    maxTurns: 40,
  });
}

export const SHIPPED_FSB_AGENT_POLICY = loadStaticAgentPolicy();

function serializeStaticAgentPolicy(): string {
  const policy = SHIPPED_FSB_AGENT_POLICY;
  return JSON.stringify({
    [policy.name]: {
      description: policy.description,
      prompt: policy.prompt,
      tools: policy.tools,
      disallowedTools: policy.disallowedTools,
      permissionMode: policy.permissionMode,
      maxTurns: policy.maxTurns,
    },
  });
}

export const SERIALIZED_FSB_AGENTS = serializeStaticAgentPolicy();

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function validateTask(task: AgentTask): void {
  if (typeof task.text !== 'string' || task.text.length === 0 || !isWellFormedUtf16(task.text)) {
    throw new Error('Agent task must be non-empty UTF-8 text');
  }
  if (Buffer.byteLength(task.text, 'utf8') > CLAUDE_TASK_LIMIT_BYTES) {
    throw new Error('Agent task exceeds the safe byte limit');
  }
}

function validateContext(ctx: SpawnContext): void {
  if (ctx.adapterId !== CLAUDE_CODE_ADAPTER_ID) {
    throw new Error('Claude profile requires the canonical adapter id');
  }
  if (
    !ctx.detection.installed
    || !ctx.detection.binary
    || !ctx.detection.version
    || ctx.detection.profileVersion !== CLAUDE_COMPATIBILITY.profileVersion
  ) {
    throw new Error('Claude profile requires a supported retained detection');
  }
  if (
    !isAbsolute(ctx.cwd)
    || !isAbsolute(ctx.privateMcpConfigPath)
    || ctx.runtimeFiles.some((path) => !isAbsolute(path))
    || !ctx.runtimeFiles.includes(ctx.privateMcpConfigPath)
  ) {
    throw new Error('Claude profile requires daemon-owned absolute runtime paths');
  }
  if (
    !/^[A-Za-z0-9_-]{8,128}$/.test(ctx.delegationId)
    || !/^[A-Za-z0-9_-]{16,256}$/.test(ctx.runtimeFingerprint)
  ) {
    throw new Error('Claude profile requires daemon-minted runtime identity');
  }
}

function assertTaskAbsent(task: string, values: readonly string[]): void {
  const checkSubstring = Buffer.byteLength(task, 'utf8') >= 16;
  if (values.some((value) => value === task || (checkSubstring && value.includes(task)))) {
    throw new Error('Agent task crossed the stdin-only boundary');
  }
}

export function buildClaudeSpawnSpec(task: AgentTask, ctx: SpawnContext): SpawnSpec {
  validateTask(task);
  validateContext(ctx);

  const binary = ctx.detection.binary;
  if (!binary) throw new Error('Claude profile has no retained binary');

  const argv = [
    ...binary.argvPrefix,
    '-p',
    '--verbose',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--no-chrome',
    '--strict-mcp-config',
    '--mcp-config', ctx.privateMcpConfigPath,
    '--agents', SERIALIZED_FSB_AGENTS,
    '--agent', 'fsb',
    '--permission-mode', 'dontAsk',
    '--tools', '',
    '--allowedTools', 'mcp__fsb',
    '--disallowedTools', DENIED_TOOLS.join(','),
    '--max-turns', '40',
    '--no-session-persistence',
  ];
  const fixedEnv = {
    FSB_AGENT_ADAPTER: CLAUDE_CODE_ADAPTER_ID,
    FSB_AGENT_PROFILE: CLAUDE_COMPATIBILITY.profileVersion,
    FSB_DELEGATION_ID: ctx.delegationId,
    FSB_AGENT_FINGERPRINT: ctx.runtimeFingerprint,
  };
  const privateFiles = [...new Set(ctx.runtimeFiles)];
  const diagnostic = ctx.detection.diagnostic?.message ?? '';

  assertTaskAbsent(task.text, [
    binary.command,
    ...argv,
    ctx.cwd,
    ...privateFiles,
    ...Object.keys(fixedEnv),
    ...Object.values(fixedEnv),
    diagnostic,
  ]);

  return freezeSpawnSpec({
    adapterId: CLAUDE_CODE_ADAPTER_ID,
    profileVersion: CLAUDE_COMPATIBILITY.profileVersion,
    command: binary.command,
    argv,
    cwd: ctx.cwd,
    privateFiles,
    fixedEnv,
  });
}
