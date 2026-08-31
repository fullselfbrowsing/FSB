import { execFile } from 'node:child_process';
import type { WebSocketBridge } from './bridge.js';
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
  platform: NodeJS.Platform;
  platforms: PlatformRegistry;
  resolvePlatformTarget: (platformKey: string) => PlatformTarget;
  now: () => number;
};

const INVENTORY_PROVIDER_ROSTER = Object.freeze(['claude-code', 'opencode', 'codex'] as const);

const DEFAULT_DEPENDENCIES: ClientInventoryDependencies = {
  execFile: execFile as unknown as ExecFileDependency,
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
/** Test-only dependency injection/reset hook. Pass null to restore production dependencies. */
export function __configureClientInventoryForTests(
  overrides: Partial<ClientInventoryDependencies> | null,
): void {
  dependencies = overrides === null
    ? { ...DEFAULT_DEPENDENCIES }
    : {
        ...DEFAULT_DEPENDENCIES,
        execFile: TEST_ONLY_EXEC_FILE,
        ...overrides,
      };
  inventoryPromise = null;
}

function claudeVersionCandidates(platform: NodeJS.Platform): string[] {
  return platform === 'win32'
    ? ['claude.cmd', 'claude.exe', 'claude']
    : ['claude'];
}

function codexVersionCandidates(platform: NodeJS.Platform): string[] {
  return platform === 'win32'
    ? ['codex.cmd', 'codex.exe', 'codex']
    : ['codex'];
}

function openCodeVersionCandidates(platform: NodeJS.Platform): string[] {
  return platform === 'win32'
    ? ['opencode.cmd', 'opencode.exe', 'opencode']
    : ['opencode'];
}

function runVersionProbe(candidate: string): Promise<boolean> {
  return new Promise((resolve) => {
    dependencies.execFile(
      candidate,
      ['--version'],
      { timeout: 3000, windowsHide: true, maxBuffer: 65536 },
      (error) => {
        resolve(!error);
      },
    );
  });
}

async function detectClaudeCode(checkedAt: number): Promise<McpClientInventoryRecord> {
  for (const candidate of claudeVersionCandidates(dependencies.platform)) {
    if (!await runVersionProbe(candidate)) continue;

    return {
      detected: true,
      checkedAt,
    };
  }

  return { detected: false, checkedAt };
}

async function detectOpenCode(checkedAt: number): Promise<McpClientInventoryRecord> {
  for (const candidate of openCodeVersionCandidates(dependencies.platform)) {
    if (!await runVersionProbe(candidate)) continue;
    return Object.freeze({ detected: true, checkedAt });
  }
  return Object.freeze({ detected: false, checkedAt });
}

async function detectCodex(checkedAt: number): Promise<McpClientInventoryRecord> {
  for (const candidate of codexVersionCandidates(dependencies.platform)) {
    if (!await runVersionProbe(candidate)) continue;
    return Object.freeze({ detected: true, checkedAt });
  }
  return Object.freeze({ detected: false, checkedAt });
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
