import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FSB_SERVER_NAME } from './version.js';

/** Supported config file formats */
export type ConfigFormat = 'json' | 'jsonc' | 'toml' | 'yaml' | 'cli';

/** How the installer writes entries into the config */
export type MergeStrategy = 'object-map' | 'named-array';

/** How the platform is installed */
export type InstallMode = 'file' | 'cli' | 'instructions';

/** Cross-OS path mapping */
export interface PlatformPaths {
  darwin: string;
  win32: string;
  linux: string;
}

/** Server entry for MCP config files */
export interface ServerEntry {
  command: string;
  args: string[];
  type?: string;  // VS Code requires type: "stdio"
}

/** Platform configuration in the registry */
export interface PlatformConfig {
  displayName: string;
  flag: string;
  format: ConfigFormat;
  serverMapKey: string | null;
  configPath: PlatformPaths | null;
  installMode: InstallMode;
  mergeStrategy: MergeStrategy;
  osRestriction?: 'darwin' | 'win32' | 'linux';
}

/** Structured target resolution returned to the installer */
export interface PlatformTarget {
  platformKey: string;
  platform: PlatformConfig;
  configPath: string | null;
  targetLabel: string;
  variant: string | null;
  detected: boolean;
}

/** The full platform registry type */
export type PlatformRegistry = Record<string, PlatformConfig>;

const home: string = homedir();

// Helper for VS Code extension globalStorage paths
function vsCodeGlobalStorage(publisherId: string, settingsFile: string): PlatformPaths {
  return {
    darwin: join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', publisherId, 'settings', settingsFile),
    win32: join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', publisherId, 'settings', settingsFile),
    linux: join(home, '.config', 'Code', 'User', 'globalStorage', publisherId, 'settings', settingsFile),
  };
}

/**
 * Platform registry mapping all MCP-capable platforms to their
 * config file metadata. Each entry contains:
 *   - displayName: Human-readable name
 *   - flag: CLI flag name (same as key)
 *   - format: 'json' | 'jsonc' | 'toml' | 'yaml' | 'cli'
 *   - serverMapKey: Root key in the config file (null for cli/instructions)
 *   - configPath: { darwin, win32, linux } resolved paths (null for cli/instructions)
 *   - installMode: 'file' | 'cli' | 'instructions'
 *   - mergeStrategy: 'object-map' | 'named-array'
 *   - osRestriction: optional OS restriction (e.g., 'darwin' for macOS-only)
 */
export const PLATFORMS: PlatformRegistry = {

  // ── Existing platforms (10) ───────���──────────────────────────────────

  'claude-desktop': {
    displayName: 'Claude Desktop',
    flag: 'claude-desktop',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      win32: join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
      linux: join(home, '.config', 'claude-desktop', 'claude_desktop_config.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'claude-code': {
    displayName: 'Claude Code',
    flag: 'claude-code',
    format: 'cli',
    serverMapKey: null,
    configPath: null,
    installMode: 'cli',
    mergeStrategy: 'object-map',
  },

  'cursor': {
    displayName: 'Cursor',
    flag: 'cursor',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, '.cursor', 'mcp.json'),
      win32: join(home, '.cursor', 'mcp.json'),
      linux: join(home, '.cursor', 'mcp.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'vscode': {
    displayName: 'VS Code',
    flag: 'vscode',
    format: 'jsonc',
    serverMapKey: 'servers',
    configPath: {
      darwin: join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'),
      win32: join(process.env.APPDATA || '', 'Code', 'User', 'mcp.json'),
      linux: join(home, '.config', 'Code', 'User', 'mcp.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'windsurf': {
    displayName: 'Windsurf',
    flag: 'windsurf',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      win32: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
      linux: join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'cline': {
    displayName: 'Cline',
    flag: 'cline',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: vsCodeGlobalStorage('saoudrizwan.claude-dev', 'cline_mcp_settings.json'),
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'zed': {
    displayName: 'Zed',
    flag: 'zed',
    format: 'jsonc',
    serverMapKey: 'context_servers',
    configPath: {
      darwin: join(home, '.zed', 'settings.json'),
      win32: join(process.env.LOCALAPPDATA || '', 'Zed', 'settings.json'),
      linux: join(home, '.config', 'zed', 'settings.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'codex': {
    displayName: 'Codex CLI',
    flag: 'codex',
    format: 'toml',
    serverMapKey: 'mcp_servers',
    configPath: {
      darwin: join(home, '.codex', 'config.toml'),
      win32: join(home, '.codex', 'config.toml'),
      linux: join(home, '.codex', 'config.toml'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'gemini': {
    displayName: 'Gemini CLI',
    flag: 'gemini',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, '.gemini', 'settings.json'),
      win32: join(home, '.gemini', 'settings.json'),
      linux: join(home, '.gemini', 'settings.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'continue': {
    displayName: 'Continue',
    flag: 'continue',
    format: 'yaml',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, '.continue', 'config.yaml'),
      win32: join(home, '.continue', 'config.yaml'),
      linux: join(home, '.continue', 'config.yaml'),
    },
    installMode: 'file',
    mergeStrategy: 'named-array',
  },

  // ── New file-based platforms (7) ────────────���────────────────────────

  'roo-code': {
    displayName: 'Roo Code',
    flag: 'roo-code',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: vsCodeGlobalStorage('rooveterinaryinc.roo-cline', 'mcp_settings.json'),
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'kilo-code': {
    displayName: 'Kilo Code',
    flag: 'kilo-code',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: vsCodeGlobalStorage('kilocode.kilo-code', 'mcp_settings.json'),
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'goose': {
    displayName: 'Goose',
    flag: 'goose',
    format: 'yaml',
    serverMapKey: 'extensions',
    configPath: {
      darwin: join(home, '.config', 'goose', 'config.yaml'),
      win32: join(home, '.config', 'goose', 'config.yaml'),
      linux: join(home, '.config', 'goose', 'config.yaml'),
    },
    installMode: 'file',
    mergeStrategy: 'named-array',
  },

  'amazon-q': {
    displayName: 'Amazon Q',
    flag: 'amazon-q',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, '.aws', 'amazonq', 'mcp.json'),
      win32: join(home, '.aws', 'amazonq', 'mcp.json'),
      linux: join(home, '.aws', 'amazonq', 'mcp.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'amp': {
    displayName: 'Amp',
    flag: 'amp',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, '.amp', 'settings.json'),
      win32: join(home, '.amp', 'settings.json'),
      linux: join(home, '.amp', 'settings.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  'boltai': {
    displayName: 'BoltAI',
    flag: 'boltai',
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: {
      darwin: join(home, 'Library', 'Application Support', 'BoltAI', 'mcp.json'),
      win32: '',
      linux: '',
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
    osRestriction: 'darwin',
  },

  'opencode': {
    displayName: 'OpenCode',
    flag: 'opencode',
    format: 'json',
    serverMapKey: 'mcp',
    configPath: {
      darwin: join(home, '.config', 'opencode', 'opencode.json'),
      win32: join(home, '.config', 'opencode', 'opencode.json'),
      linux: join(home, '.config', 'opencode', 'opencode.json'),
    },
    installMode: 'file',
    mergeStrategy: 'object-map',
  },

  // ── Instructions-only platforms (4) ─────────────��────────────────────

  'jetbrains': {
    displayName: 'JetBrains',
    flag: 'jetbrains',
    format: 'json',
    serverMapKey: null,
    configPath: null,
    installMode: 'instructions',
    mergeStrategy: 'object-map',
  },

  'chatgpt': {
    displayName: 'ChatGPT',
    flag: 'chatgpt',
    format: 'json',
    serverMapKey: null,
    configPath: null,
    installMode: 'instructions',
    mergeStrategy: 'object-map',
  },

  'claude-ai': {
    displayName: 'Claude.ai',
    flag: 'claude-ai',
    format: 'json',
    serverMapKey: null,
    configPath: null,
    installMode: 'instructions',
    mergeStrategy: 'object-map',
  },

  'warp': {
    displayName: 'Warp',
    flag: 'warp',
    format: 'json',
    serverMapKey: null,
    configPath: null,
    installMode: 'instructions',
    mergeStrategy: 'object-map',
  },
};

/**
 * Returns the FSB MCP server entry object for the current platform.
 * On Windows, wraps npx as `cmd /c npx` per INST-07.
 * On all other platforms, uses plain `npx`.
 */
export function getServerEntry(): ServerEntry {
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'npx', '-y', 'fsb-mcp-server@latest'] };
  }
  return { command: 'npx', args: ['-y', 'fsb-mcp-server@latest'] };
}

/**
 * Returns the platform-specific entry shape for a given platform.
 * Most platforms use the standard { command, args } shape. Some need
 * different field names or structures:
 *   - vscode: adds type: "stdio"
 *   - goose: uses { name, type, cmd, args } for its extensions array
 *   - opencode: uses { type: "local", command: [...] } with command as array
 */
export function getEntryForPlatform(platformKey: string): Record<string, unknown> {
  const base = getServerEntry();
  switch (platformKey) {
    case 'vscode':
      return { type: 'stdio', ...base };
    case 'goose':
      return { name: FSB_SERVER_NAME, type: 'stdio', cmd: base.command, args: base.args };
    case 'opencode':
      return { type: 'local', command: [base.command, ...base.args] };
    default:
      return { ...base };
  }
}

interface PlatformTargetCandidate {
  configPath: string;
  targetLabel: string;
  variant: string | null;
}

function getPlatformConfigPath(platform: PlatformConfig): string | null {
  if (!platform.configPath) return null;
  // Respect OS restriction (e.g., BoltAI is macOS only)
  if (platform.osRestriction && process.platform !== platform.osRestriction) return null;
  const osPlatform = process.platform as keyof PlatformPaths;
  const resolved = platform.configPath[osPlatform] || null;
  // Empty string means unsupported on this OS (e.g., BoltAI win32/linux)
  if (resolved === '') return null;
  return resolved;
}

function getPlatformTargetCandidates(platformKey: string, platform: PlatformConfig): PlatformTargetCandidate[] {
  const configPath = getPlatformConfigPath(platform);
  if (!configPath) return [];

  if (platformKey === 'windsurf') {
    const windsurfRoot = join(home, '.codeium');
    return [
      {
        configPath,
        targetLabel: platform.displayName,
        variant: 'app',
      },
      {
        configPath: join(windsurfRoot, 'mcp_config.json'),
        targetLabel: platform.displayName + ' (JetBrains/Cascade plugin)',
        variant: 'plugin',
      },
    ];
  }

  return [
    {
      configPath,
      targetLabel: platform.displayName,
      variant: null,
    },
  ];
}

/**
 * Resolve the best config target for a platform on the current OS.
 * Prefers an existing config file first, then an existing parent directory,
 * and finally falls back to the default documented path for dry-run/help output.
 *
 * @param platformKey - Platform key (e.g., 'cursor', 'windsurf')
 * @returns Structured target metadata for installer flows
 */
export function resolvePlatformTarget(platformKey: string): PlatformTarget {
  const platform: PlatformConfig | undefined = PLATFORMS[platformKey];
  if (!platform) {
    throw new Error('Unknown platform: ' + platformKey);
  }

  const candidates = getPlatformTargetCandidates(platformKey, platform);
  if (candidates.length === 0) {
    return {
      platformKey,
      platform,
      configPath: null,
      targetLabel: platform.displayName,
      variant: null,
      detected: false,
    };
  }

  for (const candidate of candidates) {
    if (existsSync(candidate.configPath)) {
      return {
        platformKey,
        platform,
        configPath: candidate.configPath,
        targetLabel: candidate.targetLabel,
        variant: candidate.variant,
        detected: true,
      };
    }
  }

  for (const candidate of candidates) {
    if (existsSync(dirname(candidate.configPath))) {
      return {
        platformKey,
        platform,
        configPath: candidate.configPath,
        targetLabel: candidate.targetLabel,
        variant: candidate.variant,
        detected: true,
      };
    }
  }

  const fallback = candidates[0];
  return {
    platformKey,
    platform,
    configPath: fallback.configPath,
    targetLabel: fallback.targetLabel,
    variant: fallback.variant,
    detected: false,
  };
}

/**
 * Resolves the config file path for a given platform on the current OS.
 * Returns null if the platform uses CLI format or the current OS is not mapped.
 *
 * @param platformKey - Platform key (e.g., 'cursor', 'claude-code')
 * @returns Absolute path to the config file, or null
 */
export function resolvePlatformConfig(platformKey: string): string | null {
  return resolvePlatformTarget(platformKey).configPath;
}

/**
 * Returns an array of all platform flag names (keys of PLATFORMS).
 * Useful for CLI help text and flag enumeration.
 *
 * @returns Array of platform flag names
 */
export function getPlatformFlags(): string[] {
  return Object.keys(PLATFORMS);
}
