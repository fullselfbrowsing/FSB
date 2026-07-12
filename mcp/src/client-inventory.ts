import { execFile } from 'node:child_process';
import type { WebSocketBridge } from './bridge.js';
import { PLATFORMS, resolvePlatformTarget } from './platforms.js';
import type { PlatformRegistry, PlatformTarget } from './platforms.js';

export type McpClientInventoryRecord = {
  detected: boolean;
  configPath: string | null;
  checkedAt: number;
  version?: string;
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

const DEFAULT_DEPENDENCIES: ClientInventoryDependencies = {
  execFile: execFile as unknown as ExecFileDependency,
  platform: process.platform,
  platforms: PLATFORMS,
  resolvePlatformTarget,
  now: () => Date.now(),
};

let dependencies: ClientInventoryDependencies = { ...DEFAULT_DEPENDENCIES };
let inventoryPromise: Promise<McpClientInventory> | null = null;

/** Test-only dependency injection/reset hook. Pass null to restore production dependencies. */
export function __configureClientInventoryForTests(
  overrides: Partial<ClientInventoryDependencies> | null,
): void {
  dependencies = overrides === null
    ? { ...DEFAULT_DEPENDENCIES }
    : { ...DEFAULT_DEPENDENCIES, ...overrides };
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

    const version = output.match(/\b\d+\.\d+\.\d+\b/)?.[0];
    return {
      detected: true,
      configPath: null,
      checkedAt,
      ...(version ? { version } : {}),
    };
  }

  return { detected: false, configPath: null, checkedAt };
}

async function performInventorySweep(): Promise<McpClientInventory> {
  const checkedAt = dependencies.now();
  const inventory: McpClientInventory = {};

  for (const platformKey of Object.keys(dependencies.platforms)) {
    if (platformKey === 'claude-code') {
      inventory[platformKey] = await detectClaudeCode(checkedAt);
      continue;
    }

    const target = dependencies.resolvePlatformTarget(platformKey);
    inventory[platformKey] = {
      detected: target.detected,
      configPath: target.configPath,
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
