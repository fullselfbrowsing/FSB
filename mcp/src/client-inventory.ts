import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import type { WebSocketBridge } from './bridge.js';
import { createCodexDetector } from './agent-providers/codex-detect.js';
import { createOpenCodeDetector } from './agent-providers/opencode-detect.js';
import { PLATFORMS, resolvePlatformTarget } from './platforms.js';
import type { PlatformRegistry, PlatformTarget } from './platforms.js';

export type McpClientInventoryRecord = {
  detected: boolean;
  checkedAt: number;
};

export type McpClientInventory = Record<string, McpClientInventoryRecord>;

type ProbeError = Error & {
  code?: string | number;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
};

type ExecFileDependency = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number },
  callback: (error: ProbeError | null, stdout: string | Buffer, stderr: string | Buffer) => void,
) => unknown;

type ClientInventoryDependencies = {
  execFile: ExecFileDependency;
  detectOpenCode: () => Promise<unknown>;
  detectCodex: () => Promise<unknown>;
  platform: NodeJS.Platform;
  platforms: PlatformRegistry;
  resolvePlatformTarget: (platformKey: string) => PlatformTarget;
  now: () => number;
};

const INVENTORY_PROVIDER_ROSTER = Object.freeze(['claude-code', 'opencode', 'codex'] as const);
const MAX_RETAINED_PATH_BYTES = 4_096;
const MAX_RETAINED_PREFIX_ARGUMENTS = 8;
const MAX_RETAINED_PREFIX_BYTES = 32 * 1_024;
const MAX_RETAINED_VERSION_BYTES = 64;
const openCodeDetector = createOpenCodeDetector();
const codexDetector = createCodexDetector();

const DEFAULT_DEPENDENCIES: ClientInventoryDependencies = {
  execFile: execFile as unknown as ExecFileDependency,
  detectOpenCode: () => openCodeDetector.detect(),
  detectCodex: () => codexDetector.detect(),
  platform: process.platform,
  platforms: PLATFORMS,
  resolvePlatformTarget,
  now: () => Date.now(),
};

let dependencies: ClientInventoryDependencies = { ...DEFAULT_DEPENDENCIES };
let inventoryPromise: Promise<McpClientInventory> | null = null;

const TEST_ONLY_EXEC_FILE: ExecFileDependency = () => {
  throw new TypeError('Client inventory test exec dependency is not configured');
};
const TEST_ONLY_PROVIDER_DETECT = async (): Promise<unknown> => {
  throw new TypeError('Client inventory test provider detector is not configured');
};

/** Test-only dependency injection/reset hook. Pass null to restore production dependencies. */
export function __configureClientInventoryForTests(
  overrides: Partial<ClientInventoryDependencies> | null,
): void {
  dependencies = overrides === null
    ? { ...DEFAULT_DEPENDENCIES }
    : {
        ...DEFAULT_DEPENDENCIES,
        execFile: TEST_ONLY_EXEC_FILE,
        detectOpenCode: TEST_ONLY_PROVIDER_DETECT,
        detectCodex: TEST_ONLY_PROVIDER_DETECT,
        ...overrides,
      };
  inventoryPromise = null;
}

function versionCandidates(platform: NodeJS.Platform): string[] {
  return platform === 'win32'
    ? ['claude.cmd', 'claude.exe', 'claude']
    : ['claude'];
}

function runClaudeVersionProbe(candidate: string): Promise<string | null> {
  return new Promise((resolve) => {
    dependencies.execFile(
      candidate,
      ['--version'],
      { timeout: 3000, windowsHide: true, maxBuffer: 65536 },
      (error, stdout, stderr) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(`${String(stdout ?? '')}\n${String(stderr ?? '')}`.trim());
      },
    );
  });
}

async function detectClaudeCode(checkedAt: number): Promise<McpClientInventoryRecord> {
  for (const candidate of versionCandidates(dependencies.platform)) {
    const output = await runClaudeVersionProbe(candidate);
    if (output === null) continue;

    return {
      detected: true,
      checkedAt,
    };
  }

  return { detected: false, checkedAt };
}

function ownDataRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;

  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    record[key] = descriptor.value;
  }
  return record;
}

function safeRetainedPath(value: unknown): value is string {
  return typeof value === 'string'
    && isAbsolute(value)
    && value.length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && Buffer.byteLength(value, 'utf8') <= MAX_RETAINED_PATH_BYTES;
}

function safeRetainedPrefix(value: unknown): boolean {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (!Number.isSafeInteger(value.length) || value.length > MAX_RETAINED_PREFIX_ARGUMENTS) {
    return false;
  }

  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
    const argument = descriptor.value;
    if (typeof argument !== 'string' || argument.length === 0 || argument.includes('\0')) return false;
    bytes += Buffer.byteLength(argument, 'utf8');
    if (bytes > MAX_RETAINED_PREFIX_BYTES) return false;
  }
  return Reflect.ownKeys(value).length === value.length + 1;
}

function projectsRetainedProviderAvailability(value: unknown): boolean {
  const detection = ownDataRecord(value);
  if (!detection || typeof detection.installed !== 'boolean') return false;
  const version = detection.version;
  if (
    typeof version !== 'string'
    || version.length === 0
    || /[\u0000-\u001f\u007f]/u.test(version)
    || Buffer.byteLength(version, 'utf8') > MAX_RETAINED_VERSION_BYTES
  ) return false;

  const binary = ownDataRecord(detection.binary);
  if (!binary) return false;
  if (!safeRetainedPath(binary.command) || !safeRetainedPath(binary.realPath)) return false;
  if (binary.command !== binary.realPath || !safeRetainedPrefix(binary.argvPrefix)) return false;
  return true;
}

async function detectOpenCode(checkedAt: number): Promise<McpClientInventoryRecord> {
  let evidence: unknown = null;
  try {
    evidence = await dependencies.detectOpenCode();
  } catch {
    evidence = null;
  }
  return Object.freeze({
    detected: projectsRetainedProviderAvailability(evidence),
    checkedAt,
  });
}

async function detectCodex(checkedAt: number): Promise<McpClientInventoryRecord> {
  let evidence: unknown = null;
  try {
    evidence = await dependencies.detectCodex();
  } catch {
    evidence = null;
  }
  return Object.freeze({
    detected: projectsRetainedProviderAvailability(evidence),
    checkedAt,
  });
}

function hasExactInventoryProviderRoster(keys: readonly string[]): boolean {
  const providerKeys = keys.filter((key) => {
    const normalized = key.toLowerCase();
    return INVENTORY_PROVIDER_ROSTER.some((providerId) => providerId === normalized);
  });
  return providerKeys.length === INVENTORY_PROVIDER_ROSTER.length
    && INVENTORY_PROVIDER_ROSTER.every((providerId) => (
      providerKeys.filter((key) => key === providerId).length === 1
    ));
}

async function performInventorySweep(): Promise<McpClientInventory> {
  const checkedAt = dependencies.now();
  const inventory: McpClientInventory = {};
  const platformKeys = Object.keys(dependencies.platforms);
  if (!hasExactInventoryProviderRoster(platformKeys)) {
    throw new Error('Client inventory roster mismatch');
  }

  for (const platformKey of platformKeys) {
    if (platformKey === 'claude-code') {
      inventory[platformKey] = await detectClaudeCode(checkedAt);
      continue;
    }
    if (platformKey === 'opencode') {
      inventory[platformKey] = await detectOpenCode(checkedAt);
      continue;
    }
    if (platformKey === 'codex') {
      inventory[platformKey] = await detectCodex(checkedAt);
      continue;
    }

    const target = dependencies.resolvePlatformTarget(platformKey);
    inventory[platformKey] = {
      detected: target.detected,
      checkedAt,
    };
  }

  return inventory;
}

export function detectMcpClientInventory(): Promise<McpClientInventory> {
  if (!inventoryPromise) {
    inventoryPromise = performInventorySweep();
  }
  return inventoryPromise;
}

export async function pushMcpClientInventory(bridge: WebSocketBridge): Promise<void> {
  try {
    const platforms = await detectMcpClientInventory();
    await bridge.sendAndWait(
      { type: 'system:client-inventory', payload: { platforms } },
      { timeout: 3000 },
    );
  } catch {
    console.error('[FSB MCP] Client inventory push skipped (extension offline or incompatible)');
  }
}
