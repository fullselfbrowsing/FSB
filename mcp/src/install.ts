import { PLATFORMS, resolvePlatformTarget, getEntryForPlatform } from './platforms.js';
import type { PlatformConfig, PlatformTarget } from './platforms.js';
import { installToConfig, removeFromConfig, serializeByFormat } from './config-writer.js';
import type { ConfigResult } from './config-writer.js';
import { FSB_MCP_VERSION, FSB_SERVER_NAME } from './version.js';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import {
  isNativeHostExtensionId,
} from './native-host/constants.js';
import {
  installNativeHost,
  uninstallNativeHost,
} from './native-host-install/index.js';
import { resolveNativeHostPlatformLayout } from './native-host-install/platform.js';
import type {
  NativeHostInstallRequest,
  NativeHostInstallResult,
  NativeHostInstallTransactionDependencies,
  NativeHostUninstallResult,
} from './native-host-install/types.js';

/** CLI flags parsed from argv */
export type InstallFlags = Record<string, boolean | string>;

export interface NativeHostCliOperations {
  install(request: NativeHostInstallRequest): Promise<NativeHostInstallResult>;
  uninstall(): Promise<NativeHostUninstallResult>;
}

/** Matched platform for file-based install/uninstall */
interface MatchedPlatform {
  key: string;
  platform: PlatformConfig;
}

/** Result of Claude Code CLI delegation */
interface ClaudeCodeResult {
  installed: boolean;
  skipped: boolean;
}

export interface SetupSection {
  title: string;
  lines: string[];
}

const STDIO_COMMAND = 'npx -y fsb-mcp-server';
const WINDOWS_STDIO_COMMAND = 'cmd /c npx -y fsb-mcp-server';
const NATIVE_HOST_INSTALL_USAGE =
  'Usage: fsb-mcp-server install --native-host [--extension-id <32 lowercase a-p chars>]';
const NATIVE_HOST_UNINSTALL_USAGE =
  'Usage: fsb-mcp-server uninstall --native-host';
const NATIVE_HOST_REFUSAL_REASONS = new Set([
  'boundary-changed',
  'foreign-state',
  'install-failed',
  'invalid-materialized-package',
  'invalid-pack-receipt',
  'invalid-request',
  'invalid-source-package',
  'invalid-state',
  'network-attempted',
  'ownership-mismatch',
  'pack-failed',
  'process-output-exceeded',
  'publication-failed',
  'registration-publish-failed',
  'registration-remove-failed',
  'registry-key-cleanup-failed',
  'registry-key-not-exact',
  'registry-shadow',
  'runtime-remove-failed',
  'split-state',
  'stable-root-not-absent',
  'stage-failed',
  'tarball-integrity-mismatch',
  'unavailable',
  'unsupported-architecture',
  'version-mismatch',
]);

function expectedNativeHostLocation(): string {
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) return 'Unavailable';
  try {
    return resolveNativeHostPlatformLayout({
      platform: process.platform as 'darwin' | 'linux' | 'win32',
      homeDirectory: homedir(),
      ...(process.platform === 'win32'
        ? { localAppData: process.env.LOCALAPPDATA }
        : {}),
    }).manifestPath;
  } catch {
    return 'Unavailable';
  }
}

const unavailableNativeHostCliOperations: NativeHostCliOperations = Object.freeze({
  install: async (): Promise<NativeHostInstallResult> => Object.freeze({
    status: 'refused',
    reason: 'unavailable',
    location: expectedNativeHostLocation(),
    origin: null,
    packageVersion: null,
  }),
  uninstall: async (): Promise<NativeHostUninstallResult> => Object.freeze({
    status: 'refused',
    reason: 'unavailable',
    location: expectedNativeHostLocation(),
    origin: null,
    packageVersion: null,
  }),
});

export function createNativeHostCliOperations(
  dependencies: NativeHostInstallTransactionDependencies,
): NativeHostCliOperations {
  return Object.freeze({
    install: (request: NativeHostInstallRequest) => installNativeHost(request, dependencies),
    uninstall: () => uninstallNativeHost(dependencies),
  });
}

function nativeHostTargetRequested(flags: InstallFlags): boolean {
  return Boolean(flags && typeof flags === 'object' && Object.hasOwn(flags, 'native-host'));
}

function exactNativeFlags(
  flags: InstallFlags,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  try {
    if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return null;
    if (Object.getPrototypeOf(flags) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(flags);
    if (
      keys.length < 1
      || keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key))
    ) {
      return null;
    }
    const values: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(flags, key);
      if (
        typeof key !== 'string'
        || !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')
      ) {
        return null;
      }
      values[key] = descriptor.value;
    }
    return values;
  } catch {
    return null;
  }
}

function nativeInstallRequest(flags: InstallFlags): NativeHostInstallRequest | null {
  const values = exactNativeFlags(flags, ['native-host', 'extension-id']);
  if (!values || values['native-host'] !== true) return null;
  if (!Object.hasOwn(values, 'extension-id')) return Object.freeze({});
  const extensionId = values['extension-id'];
  if (typeof extensionId !== 'string' || !isNativeHostExtensionId(extensionId)) return null;
  return Object.freeze({ extensionId });
}

function validNativeUninstallFlags(flags: InstallFlags): boolean {
  const values = exactNativeFlags(flags, ['native-host']);
  return Boolean(
    values
    && Reflect.ownKeys(values).length === 1
    && values['native-host'] === true,
  );
}

function rejectNativeUsage(usage: string): void {
  console.error(usage);
  process.exitCode = 1;
}

function boundedNativeLocation(value: unknown): string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 4096
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
    ? value
    : 'Unavailable';
}

function exactNativeOrigin(value: unknown): string | null {
  if (
    typeof value !== 'string'
    || !value.startsWith('chrome-extension://')
    || !value.endsWith('/')
  ) {
    return null;
  }
  const extensionId = value.slice('chrome-extension://'.length, -1);
  return isNativeHostExtensionId(extensionId) ? value : null;
}

function stableNativeRefusalReason(value: unknown): string {
  return typeof value === 'string' && NATIVE_HOST_REFUSAL_REASONS.has(value)
    ? value
    : 'unavailable';
}

function printNativeHostRefusal(reasonValue: unknown, locationValue: unknown): void {
  console.error(`Native messaging host was not changed: ${stableNativeRefusalReason(reasonValue)}`);
  console.error(`Expected location: ${boundedNativeLocation(locationValue)}`);
  console.error('Run fsb-mcp-server doctor for repair details.');
  process.exitCode = 1;
}

function printNativeInstallResult(result: NativeHostInstallResult): void {
  const location = boundedNativeLocation(result?.location);
  const origin = exactNativeOrigin(result?.origin);
  if (result?.status === 'refused') {
    printNativeHostRefusal(result.reason, result.location);
    return;
  }
  if (
    location === 'Unavailable'
    || !origin
    || (result.status !== 'installed' && result.status !== 'already-installed')
  ) {
    printNativeHostRefusal('unavailable', location);
    return;
  }
  console.log(result.status === 'installed'
    ? 'Native messaging host installed.'
    : 'Native messaging host is already installed.');
  console.log(`Expected location: ${location}`);
  console.log(`Allowed origin: ${origin}`);
}

function printNativeUninstallResult(result: NativeHostUninstallResult): void {
  const location = boundedNativeLocation(result?.location);
  if (result?.status === 'refused') {
    printNativeHostRefusal(result.reason, result.location);
    return;
  }
  if (
    location === 'Unavailable'
    || (result.status !== 'removed' && result.status !== 'not-installed')
  ) {
    printNativeHostRefusal('unavailable', location);
    return;
  }
  if (result.status === 'removed') {
    console.log('Native messaging host removed.');
    console.log('Removed: 1');
  } else {
    console.log('Native messaging host is not installed.');
    console.log('Removed: 0');
  }
  console.log(`Expected location: ${location}`);
}

export function getClaudeCodeInstallCommand(): string {
  return 'claude mcp add --scope user ' + FSB_SERVER_NAME + ' -- ' + STDIO_COMMAND;
}

export function getInstallNextStep(platformKey: string, variant: string | null = null): string | null {
  switch (platformKey) {
    case 'claude-code':
      return 'Already active after add. If tools do not appear, run doctor and status --watch before retrying.';
    case 'claude-desktop':
      return 'Restart Claude Desktop after editing the MCP config.';
    case 'cursor':
      return 'Restart Cursor after editing ~/.cursor/mcp.json.';
    case 'vscode':
      return 'Open the MCP view in VS Code, trust/start the server if prompted, then reload VS Code if it does not start automatically.';
    case 'windsurf':
      return variant === 'plugin'
        ? 'In Windsurf or the JetBrains/Cascade plugin, refresh the MCP integration or reload the client after editing ~/.codeium/mcp_config.json.'
        : 'In Windsurf, refresh the MCP integration or reload the app after editing ~/.codeium/windsurf/mcp_config.json.';
    case 'codex':
      return 'Restart Codex or reload the MCP server list after editing ~/.codex/config.toml.';
    case 'cline':
      return 'Reload VS Code/Cline after editing the MCP settings file.';
    case 'zed':
      return 'Reload Zed after editing settings.json.';
    case 'gemini':
      return 'Restart Gemini CLI after editing settings.json if the new server does not appear immediately.';
    case 'continue':
      return 'Restart Continue or reload the host IDE after editing config.yaml.';
    // New platforms
    case 'roo-code':
      return 'Reload VS Code/Roo Code after editing the MCP settings file.';
    case 'kilo-code':
      return 'Reload VS Code/Kilo Code after editing the MCP settings file.';
    case 'goose':
      return 'Restart Goose after editing ~/.config/goose/config.yaml.';
    case 'amazon-q':
      return 'Restart Amazon Q CLI or IDE after editing ~/.aws/amazonq/mcp.json.';
    case 'amp':
      return 'Restart Amp after editing ~/.amp/settings.json.';
    case 'boltai':
      return 'Restart BoltAI after editing the MCP config.';
    case 'opencode':
      return 'Restart OpenCode after editing ~/.config/opencode/opencode.json.';
    case 'jetbrains':
      return 'Restart the JetBrains IDE after adding the MCP server in settings.';
    case 'chatgpt':
      return 'Keep the server running while using ChatGPT.';
    case 'claude-ai':
      return 'Keep the server running while using Claude.ai.';
    case 'warp':
      return 'The server should appear in Warp after adding it in the MCP management UI.';
    default:
      return null;
  }
}

/**
 * Print setup instructions for an instructions-only platform.
 * These platforms cannot be auto-installed; we print human-readable guidance.
 */
function printPlatformInstructions(platformKey: string): void {
  switch (platformKey) {
    case 'jetbrains':
      console.log('');
      console.log('JetBrains (AI Assistant / Junie):');
      console.log('  1. Open Settings > Tools > AI Assistant > MCP Servers');
      console.log('  2. Click "+" to add a new server');
      console.log('  3. Set the command to: npx');
      console.log('  4. Set the arguments to: -y fsb-mcp-server');
      console.log('  5. Name it: fsb');
      console.log('  Supported IDEs: IntelliJ, WebStorm, PyCharm, GoLand, Android Studio, etc.');
      break;
    case 'chatgpt':
      console.log('');
      console.log('ChatGPT (Streamable HTTP -- remote only):');
      console.log('  1. Start the FSB HTTP server:');
      console.log('     npx -y fsb-mcp-server serve');
      console.log('  2. In ChatGPT, go to Settings > Connections > MCP');
      console.log('  3. Add a new MCP server with URL:');
      console.log('     http://127.0.0.1:7226/mcp');
      console.log('  Note: The server must be running while you use ChatGPT.');
      break;
    case 'claude-ai':
      console.log('');
      console.log('Claude.ai (Streamable HTTP -- remote only):');
      console.log('  1. Start the FSB HTTP server:');
      console.log('     npx -y fsb-mcp-server serve');
      console.log('  2. In Claude.ai, open the integrations UI');
      console.log('  3. Add a new MCP server with URL:');
      console.log('     http://127.0.0.1:7226/mcp');
      console.log('  Note: The server must be running while you use Claude.ai.');
      break;
    case 'warp':
      console.log('');
      console.log('Warp Terminal:');
      console.log('  1. Open Warp and go to the MCP management UI');
      console.log('  2. Add a new MCP server');
      console.log('  3. Set the command to: npx -y fsb-mcp-server');
      console.log('  4. Name it: fsb');
      break;
    default:
      console.log('No setup instructions available for: ' + platformKey);
  }
}

export function getSetupSections(httpEndpoint: string, cursorDeeplink: string): SetupSection[] {
  return [
    {
      title: 'Stdio command',
      lines: [
        'macOS / Linux:',
        '  ' + STDIO_COMMAND,
        'Windows:',
        '  ' + WINDOWS_STDIO_COMMAND,
      ],
    },
    {
      title: 'Local HTTP endpoint',
      lines: [
        '1. Start the server:',
        '  npx -y fsb-mcp-server serve',
        '2. Use this endpoint in any Streamable HTTP-capable client:',
        '  ' + httpEndpoint,
      ],
    },
    {
      title: 'Claude Code',
      lines: [
        'User-scoped install:',
        '  ' + getClaudeCodeInstallCommand(),
        'Next step:',
        '  ' + getInstallNextStep('claude-code'),
      ],
    },
    {
      title: 'Claude Desktop',
      lines: [
        'Config: claude_desktop_config.json',
        'Add:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('claude-desktop'),
      ],
    },
    {
      title: 'Codex CLI / Codex IDE',
      lines: [
        'Config: ~/.codex/config.toml',
        'Add:',
        '  [mcp_servers.fsb]',
        '  command = "npx"',
        '  args = ["-y", "fsb-mcp-server"]',
        'Next step:',
        '  ' + getInstallNextStep('codex'),
      ],
    },
    {
      title: 'VS Code',
      lines: [
        'Config: mcp.json',
        'Add:',
        '  {',
        '    "servers": {',
        '      "fsb": {',
        '        "type": "stdio",',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('vscode'),
      ],
    },
    {
      title: 'Cursor',
      lines: [
        'Config: ~/.cursor/mcp.json',
        'Add:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Install deeplink:',
        '  ' + cursorDeeplink,
        'Next step:',
        '  ' + getInstallNextStep('cursor'),
      ],
    },
    {
      title: 'Windsurf',
      lines: [
        'Supported config paths:',
        '  ~/.codeium/windsurf/mcp_config.json',
        '  ~/.codeium/mcp_config.json',
        'Use the standard stdio entry:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  Press refresh in Windsurf or reload the client after editing the matching config file.',
      ],
    },
    // New platforms
    {
      title: 'Roo Code',
      lines: [
        'Config: VS Code globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json',
        'Add:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('roo-code'),
      ],
    },
    {
      title: 'Kilo Code',
      lines: [
        'Config: VS Code globalStorage/kilocode.kilo-code/settings/mcp_settings.json',
        'Add:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('kilo-code'),
      ],
    },
    {
      title: 'Goose (Block)',
      lines: [
        'Config: ~/.config/goose/config.yaml',
        'Add to the extensions array:',
        '  extensions:',
        '    - name: fsb',
        '      type: stdio',
        '      cmd: npx',
        '      args:',
        '        - "-y"',
        '        - fsb-mcp-server',
        'Next step:',
        '  ' + getInstallNextStep('goose'),
      ],
    },
    {
      title: 'Amazon Q',
      lines: [
        'Config: ~/.aws/amazonq/mcp.json',
        'Add:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('amazon-q'),
      ],
    },
    {
      title: 'Amp (Sourcegraph)',
      lines: [
        'Config: ~/.amp/settings.json',
        'Add:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('amp'),
      ],
    },
    {
      title: 'BoltAI (macOS only)',
      lines: [
        'Config: ~/Library/Application Support/BoltAI/mcp.json',
        'Add:',
        '  {',
        '    "mcpServers": {',
        '      "fsb": {',
        '        "command": "npx",',
        '        "args": ["-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('boltai'),
      ],
    },
    {
      title: 'OpenCode',
      lines: [
        'Config: ~/.config/opencode/opencode.json',
        'Add under the "mcp" object:',
        '  {',
        '    "mcp": {',
        '      "fsb": {',
        '        "type": "local",',
        '        "command": ["npx", "-y", "fsb-mcp-server"]',
        '      }',
        '    }',
        '  }',
        'Next step:',
        '  ' + getInstallNextStep('opencode'),
      ],
    },
    {
      title: 'JetBrains (AI Assistant / Junie)',
      lines: [
        'Open Settings > Tools > AI Assistant > MCP Servers',
        'Add a new server with:',
        '  Command: npx',
        '  Arguments: -y fsb-mcp-server',
        '  Name: fsb',
        'Supported IDEs: IntelliJ, WebStorm, PyCharm, GoLand, Android Studio, etc.',
        'Next step:',
        '  ' + getInstallNextStep('jetbrains'),
      ],
    },
    {
      title: 'ChatGPT (Streamable HTTP)',
      lines: [
        '1. Start the server: npx -y fsb-mcp-server serve',
        '2. In ChatGPT Settings > Connections > MCP, add:',
        '   ' + httpEndpoint,
        'Next step:',
        '  ' + getInstallNextStep('chatgpt'),
      ],
    },
    {
      title: 'Claude.ai (Streamable HTTP)',
      lines: [
        '1. Start the server: npx -y fsb-mcp-server serve',
        '2. In Claude.ai integrations UI, add:',
        '   ' + httpEndpoint,
        'Next step:',
        '  ' + getInstallNextStep('claude-ai'),
      ],
    },
    {
      title: 'Warp Terminal',
      lines: [
        'Open the MCP management UI in Warp',
        'Add server with command: npx -y fsb-mcp-server',
        'Name: fsb',
        'Next step:',
        '  ' + getInstallNextStep('warp'),
      ],
    },
    {
      title: 'OpenClaw',
      lines: [
        'Canonical install: load the FSB skill from skills/fsb/ in this repo.',
        '  The skill runs the doctor flow, prints the OpenClaw stdio config block,',
        '  and offers consent-gated install for other detected MCP hosts.',
        'Status of the --openclaw install flag: still manual / unsupported.',
        'Why:',
        '  OpenClaw MCP config schema is unstable across builds; the skill prints',
        '  and asks the user to paste, never auto-writes the OpenClaw config.',
        'Manual stdio fallback (if you cannot use the skill):',
        '  ' + STDIO_COMMAND,
      ],
    },
    {
      title: 'Troubleshooting first',
      lines: [
        '1. npx -y fsb-mcp-server doctor',
        '2. npx -y fsb-mcp-server status --watch',
        'Use these before restarting or reinstalling any client.',
      ],
    },
  ];
}

/**
 * Collect platforms whose flags are set and whose format is file-based (not CLI or instructions).
 * CLI-format platforms (Claude Code) are handled separately via handleClaudeCodeInstall().
 * Instructions-only platforms are handled separately via printPlatformInstructions().
 * @param flags - Parsed CLI flags (key -> boolean)
 * @returns Array of matched platform entries
 */
function getMatchedPlatforms(flags: InstallFlags): MatchedPlatform[] {
  const matched: MatchedPlatform[] = [];
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    if (flags[key] === true && platform.installMode === 'file') {
      matched.push({ key, platform });
    }
  }
  return matched;
}

/**
 * Collect instructions-only platforms whose flags are set.
 * @param flags - Parsed CLI flags (key -> boolean)
 * @returns Array of matched platform keys
 */
function getMatchedInstructionsPlatforms(flags: InstallFlags): string[] {
  const matched: string[] = [];
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    if (flags[key] === true && platform.installMode === 'instructions') {
      matched.push(key);
    }
  }
  return matched;
}

/**
 * Print a single result line with status icon.
 * @param result - Config operation result
 */
function printResult(result: ConfigResult): void {
  switch (result.status) {
    case 'created':
    case 'updated':
    case 'removed':
      console.log('\u2713 ' + result.message);
      break;
    case 'skipped':
    case 'not-found':
      console.log('\u25CB ' + result.message);
      break;
    case 'error':
      console.error('\u2717 ' + result.message);
      break;
  }
}

/**
 * Build and print the platform list block used by both install and uninstall usage.
 * Lists all platforms from the registry with aligned display names and install mode.
 * @returns Formatted platform list
 */
function buildPlatformList(): string {
  const lines: string[] = [];
  for (const [, platform] of Object.entries(PLATFORMS)) {
    const modeTag = platform.installMode === 'instructions' ? ' (manual)' : '';
    lines.push('  --' + platform.flag.padEnd(18) + platform.displayName + modeTag);
  }
  return lines.join('\n');
}

/**
 * Print detailed platform list with detection status, grouped by install mode.
 * Used by the --list flag.
 */
function printPlatformListDetailed(): void {
  console.log('FSB MCP Server ' + FSB_MCP_VERSION);
  console.log('');
  console.log('Supported platforms (' + Object.keys(PLATFORMS).length + ' total):');

  // Group by install mode
  const fileBasedPlatforms: Array<[string, PlatformConfig]> = [];
  const cliPlatforms: Array<[string, PlatformConfig]> = [];
  const instructionsPlatforms: Array<[string, PlatformConfig]> = [];

  for (const [key, platform] of Object.entries(PLATFORMS)) {
    switch (platform.installMode) {
      case 'file':
        fileBasedPlatforms.push([key, platform]);
        break;
      case 'cli':
        cliPlatforms.push([key, platform]);
        break;
      case 'instructions':
        instructionsPlatforms.push([key, platform]);
        break;
    }
  }

  console.log('');
  console.log('File-based auto-install (' + fileBasedPlatforms.length + '):');
  for (const [key, platform] of fileBasedPlatforms) {
    const target = resolvePlatformTarget(key);
    const status = target.detected ? 'detected' : 'not detected';
    const osNote = platform.osRestriction ? ' (' + platform.osRestriction + ' only)' : '';
    console.log('  --' + platform.flag.padEnd(18) + platform.displayName.padEnd(20) + status + osNote);
  }

  if (cliPlatforms.length > 0) {
    console.log('');
    console.log('CLI-based (' + cliPlatforms.length + '):');
    for (const [, platform] of cliPlatforms) {
      console.log('  --' + platform.flag.padEnd(18) + platform.displayName);
    }
  }

  if (instructionsPlatforms.length > 0) {
    console.log('');
    console.log('Instructions-only (' + instructionsPlatforms.length + '):');
    for (const [, platform] of instructionsPlatforms) {
      console.log('  --' + platform.flag.padEnd(18) + platform.displayName);
    }
  }
}

/**
 * Print usage help for the install subcommand when no platform flags are provided.
 */
function printInstallUsage(): void {
  console.log('FSB MCP Server ' + FSB_MCP_VERSION);
  console.log('');
  console.log('Usage: fsb-mcp-server install --<platform>');
  console.log('');
  console.log('Platforms:');
  console.log(buildPlatformList());
  console.log('');
  console.log('Flags:');
  console.log('  --all               Install to all detected platforms');
  console.log('  --list              Show all platforms with detection status');
  console.log('  --dry-run           Preview changes without modifying files');
}

/**
 * Print usage help for the uninstall subcommand when no platform flags are provided.
 */
function printUninstallUsage(): void {
  console.log('FSB MCP Server ' + FSB_MCP_VERSION);
  console.log('');
  console.log('Usage: fsb-mcp-server uninstall --<platform>');
  console.log('');
  console.log('Platforms:');
  console.log(buildPlatformList());
  console.log('');
  console.log('Flags:');
  console.log('  --all               Remove from all configured platforms');
  console.log('  --dry-run           Preview changes without modifying files');
}

/**
 * Print a dry-run preview for a file-based platform showing what would be written.
 * @param target - Resolved platform target
 * @param entry - Server entry that would be installed
 */
function printDryRunPreview(target: PlatformTarget, entry: Record<string, unknown>): void {
  console.log('[DRY RUN] ' + target.targetLabel);
  if (target.configPath) {
    console.log('  Config: ' + target.configPath);
  }
  // Wrap the single entry in the platform's root key structure for realistic preview
  const wrapper: Record<string, unknown> = {};
  const platform = target.platform;
  if (platform.mergeStrategy === 'named-array') {
    wrapper[platform.serverMapKey!] = [{ name: FSB_SERVER_NAME, ...entry }];
  } else {
    wrapper[platform.serverMapKey!] = { [FSB_SERVER_NAME]: entry };
  }
  const preview: string = serializeByFormat(wrapper, platform.format === 'jsonc' ? 'json' : platform.format);
  console.log('  Entry:');
  for (const line of preview.split('\n')) {
    if (line.trim()) console.log('    ' + line);
  }
}

/**
 * Handle Claude Code install via CLI delegation.
 * Shells out to `claude mcp add` with --scope user (FSB is user-global).
 * Falls back to printing the manual command if the CLI is not found.
 *
 * @param dryRun - If true, only print the command without executing
 * @returns Result indicating whether install succeeded or was skipped
 */
function handleClaudeCodeInstall(dryRun: boolean): ClaudeCodeResult {
  const cmd: string = getClaudeCodeInstallCommand();
  if (dryRun) {
    console.log('[DRY RUN] Claude Code');
    console.log('  Command: ' + cmd);
    return { installed: false, skipped: false };
  }
  try {
    execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
    console.log('\u2713 Added to Claude Code');
    return { installed: true, skipped: false };
  } catch (err) {
    const execErr = err as { stdout?: string; stderr?: string };
    if (execErr.stdout?.includes('already exists') || execErr.stderr?.includes('already exists')) {
      console.log('\u25CB Claude Code already configured');
      return { installed: false, skipped: true };
    }
    console.log('\u25CB Claude CLI not found \u2014 run manually: ' + getClaudeCodeInstallCommand());
    return { installed: false, skipped: false };
  }
}

function getTargetPlatform(target: PlatformTarget): PlatformConfig {
  if (target.targetLabel === target.platform.displayName) {
    return target.platform;
  }
  return { ...target.platform, displayName: target.targetLabel };
}

/**
 * Install FSB into one or more platform config files.
 * Iterates matched platforms, resolves config paths, and calls installToConfig.
 * Platform-specific entry shapes are handled by getEntryForPlatform().
 *
 * @param flags - Parsed CLI flags (platform keys mapped to boolean)
 */
export async function runInstall(
  flags: InstallFlags,
  nativeHostOperations: NativeHostCliOperations = unavailableNativeHostCliOperations,
): Promise<void> {
  if (nativeHostTargetRequested(flags)) {
    const request = nativeInstallRequest(flags);
    if (!request) {
      rejectNativeUsage(NATIVE_HOST_INSTALL_USAGE);
      return;
    }
    try {
      printNativeInstallResult(await nativeHostOperations.install(request));
    } catch {
      printNativeHostRefusal('unavailable', expectedNativeHostLocation());
    }
    return;
  }

  // Handle --list before anything else
  if (flags['list'] === true) {
    printPlatformListDetailed();
    return;
  }

  // Capture --all before expansion (Pitfall 4)
  const isAll: boolean = flags['all'] === true;

  // --all expansion: set all platform keys EXCEPT instructions-only platforms
  if (isAll) {
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      if (platform.installMode !== 'instructions') {
        flags[key] = true;
      }
    }
  }
  let successCount = 0;
  let totalCount = 0;

  // Claude Code: CLI delegation (mirrors uninstall pattern)
  if (flags['claude-code'] === true) {
    const ccResult: ClaudeCodeResult = handleClaudeCodeInstall(flags['dry-run'] === true);
    totalCount++;
    if (ccResult.installed || flags['dry-run'] === true) {
      successCount++;
    }
    if (!isAll && flags['dry-run'] !== true && (ccResult.installed || ccResult.skipped)) {
      const nextStep = getInstallNextStep('claude-code');
      if (nextStep) {
        console.log('  Next step: ' + nextStep);
      }
    }
  }

  // Instructions-only platforms: print setup guidance
  const instructionsPlatforms = getMatchedInstructionsPlatforms(flags);
  for (const key of instructionsPlatforms) {
    printPlatformInstructions(key);
    totalCount++;
  }

  const matched: MatchedPlatform[] = getMatchedPlatforms(flags);

  if (matched.length === 0 && !flags['claude-code'] && instructionsPlatforms.length === 0) {
    printInstallUsage();
    return;
  }

  for (const { key, platform } of matched) {
    const target: PlatformTarget = resolvePlatformTarget(key);
    if (target.configPath === null) {
      if (isAll) {
        console.log('\u25CB Skipped ' + target.targetLabel + ' (not installed)');
      } else {
        console.log('\u25CB ' + target.targetLabel + ' is not supported on this OS');
      }
      totalCount++;
      continue;
    }

    if (isAll && flags['dry-run'] !== true && !target.detected) {
      console.log('\u25CB Skipped ' + target.targetLabel + ' (config path not detected)');
      totalCount++;
      continue;
    }

    // Build platform-specific entry shape
    const entry = getEntryForPlatform(key);

    if (flags['dry-run'] === true) {
      printDryRunPreview(target, entry);
      totalCount++;
      successCount++;
      continue;
    }

    const result: ConfigResult = await installToConfig(
      target.configPath,
      getTargetPlatform(target),
      FSB_SERVER_NAME,
      entry,
    );
    printResult(result);
    totalCount++;
    if (result.status === 'created' || result.status === 'updated') {
      successCount++;
    }
    if (!isAll && (result.status === 'created' || result.status === 'updated' || result.status === 'skipped')) {
      const nextStep = getInstallNextStep(key, target.variant);
      if (nextStep) {
        console.log('  Next step: ' + nextStep);
      }
    }
  }

  if (isAll) {
    const verb: string = flags['dry-run'] === true ? 'Would install to' : 'Installed to';
    console.log('');
    console.log(verb + ' ' + successCount + ' of ' + Object.keys(PLATFORMS).length + ' platforms');
  }
}

/**
 * Uninstall FSB from one or more platform config files.
 * Claude Code uses CLI delegation via execSync (UNINST-05).
 * File-based platforms use removeFromConfig.
 * Instructions-only platforms print manual removal guidance.
 *
 * @param flags - Parsed CLI flags (platform keys mapped to boolean)
 */
export async function runUninstall(
  flags: InstallFlags,
  nativeHostOperations: NativeHostCliOperations = unavailableNativeHostCliOperations,
): Promise<void> {
  if (nativeHostTargetRequested(flags)) {
    if (!validNativeUninstallFlags(flags)) {
      rejectNativeUsage(NATIVE_HOST_UNINSTALL_USAGE);
      return;
    }
    try {
      printNativeUninstallResult(await nativeHostOperations.uninstall());
    } catch {
      printNativeHostRefusal('unavailable', expectedNativeHostLocation());
    }
    return;
  }

  // Capture --all before expansion (Pitfall 4)
  const isAll: boolean = flags['all'] === true;

  // --all expansion: set all platform keys EXCEPT instructions-only platforms
  if (isAll) {
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      if (platform.installMode !== 'instructions') {
        flags[key] = true;
      }
    }
  }
  let successCount = 0;
  let totalCount = 0;

  // Special case: Claude Code uninstall via CLI delegation (UNINST-05)
  if (flags['claude-code'] === true) {
    if (flags['dry-run'] === true) {
      console.log('[DRY RUN] Claude Code');
      console.log('  Command: claude mcp remove ' + FSB_SERVER_NAME);
      totalCount++;
      successCount++;
    } else {
      try {
        execSync('claude mcp remove ' + FSB_SERVER_NAME, { stdio: 'pipe', encoding: 'utf-8' });
        console.log('\u2713 Removed FSB from Claude Code');
        totalCount++;
        successCount++;
      } catch {
        if (isAll) {
          console.log('\u25CB Skipped Claude Code (CLI not found)');
        } else {
          console.log('\u25CB Claude Code: run manually: claude mcp remove ' + FSB_SERVER_NAME);
        }
        totalCount++;
      }
    }
  }

  // Instructions-only platforms: print manual removal message
  const instructionsPlatforms = getMatchedInstructionsPlatforms(flags);
  for (const key of instructionsPlatforms) {
    const platform = PLATFORMS[key];
    console.log('\u25CB ' + platform.displayName + ': manual removal required (no config file to edit)');
    totalCount++;
  }

  const matched: MatchedPlatform[] = getMatchedPlatforms(flags);

  if (matched.length === 0 && !flags['claude-code'] && instructionsPlatforms.length === 0) {
    printUninstallUsage();
    return;
  }

  for (const { key, platform } of matched) {
    const target: PlatformTarget = resolvePlatformTarget(key);
    if (target.configPath === null) {
      if (isAll) {
        console.log('\u25CB Skipped ' + target.targetLabel + ' (not installed)');
      } else {
        console.log('\u25CB ' + target.targetLabel + ' is not supported on this OS');
      }
      totalCount++;
      continue;
    }

    if (isAll && flags['dry-run'] !== true && !target.detected) {
      console.log('\u25CB Skipped ' + target.targetLabel + ' (config path not detected)');
      totalCount++;
      continue;
    }

    if (flags['dry-run'] === true) {
      console.log('[DRY RUN] Would remove FSB from ' + target.targetLabel + ': ' + target.configPath);
      totalCount++;
      successCount++;
      continue;
    }

    const result: ConfigResult = await removeFromConfig(
      target.configPath,
      getTargetPlatform(target),
      FSB_SERVER_NAME,
    );
    printResult(result);
    totalCount++;
    if (result.status === 'removed') {
      successCount++;
    }
  }

  if (isAll) {
    const verb: string = flags['dry-run'] === true ? 'Would remove from' : 'Removed from';
    console.log('');
    console.log(verb + ' ' + successCount + ' of ' + Object.keys(PLATFORMS).length + ' platforms');
  }
}
