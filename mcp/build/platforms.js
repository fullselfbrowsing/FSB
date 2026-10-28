import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { FSB_SERVER_NAME } from './version.js';
const home = homedir();
// Helper for VS Code extension globalStorage paths
function vsCodeGlobalStorage(publisherId, settingsFile) {
    return {
        darwin: join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', publisherId, 'settings', settingsFile),
        win32: join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', publisherId, 'settings', settingsFile),
        linux: join(home, '.config', 'Code', 'User', 'globalStorage', publisherId, 'settings', settingsFile),
    };
}
const CLINE_MCP_SETTINGS_FILE = 'cline_mcp_settings.json';
/**
 * Cline's VS Code extension, JetBrains plugin, and CLI all read one MCP
 * settings file under ~/.cline. Resolve it with the same environment
 * overrides Cline honors, in the same precedence order.
 */
function clineMcpSettingsPaths() {
    const explicitPath = process.env.CLINE_MCP_SETTINGS_PATH?.trim();
    const dataDir = process.env.CLINE_DATA_DIR?.trim()
        || join(process.env.CLINE_DIR?.trim() || join(home, '.cline'), 'data');
    const settingsPath = explicitPath || join(dataDir, 'settings', CLINE_MCP_SETTINGS_FILE);
    return { darwin: settingsPath, win32: settingsPath, linux: settingsPath };
}
/**
 * Older Cline builds kept MCP settings in VS Code's extension storage. Current
 * builds import that file once on upgrade and then ignore it, so it is only a
 * fallback for machines that have no shared Cline settings directory.
 */
const CLINE_LEGACY_VSCODE_PATHS = vsCodeGlobalStorage('saoudrizwan.claude-dev', CLINE_MCP_SETTINGS_FILE);
/**
 * Cline gives every MCP request one fixed timeout, 60 seconds unless the
 * server entry sets `timeout`, and does not extend it on progress
 * notifications. `run_task` can block for up to 600 seconds, so the entry
 * asks for 1800: the smallest preset in Cline's timeout picker above that.
 */
export const CLINE_TIMEOUT_SECONDS = 1800;
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
export const PLATFORMS = {
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
    'antigravity': {
        displayName: 'Antigravity',
        flag: 'antigravity',
        format: 'json',
        serverMapKey: 'mcpServers',
        configPath: {
            darwin: join(home, '.gemini', 'config', 'mcp_config.json'),
            win32: join(home, '.gemini', 'config', 'mcp_config.json'),
            linux: join(home, '.gemini', 'config', 'mcp_config.json'),
        },
        installMode: 'file',
        mergeStrategy: 'object-map',
    },
    'cline': {
        displayName: 'Cline',
        flag: 'cline',
        format: 'json',
        serverMapKey: 'mcpServers',
        configPath: clineMcpSettingsPaths(),
        installMode: 'file',
        mergeStrategy: 'object-map',
        // Cline's MCP panel writes these onto the entry: the server toggle,
        // per-tool auto-approval, and the timeout picker.
        preservedEntryKeys: ['timeout', 'disabled', 'autoApprove'],
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
export function getServerEntry() {
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
 *   - cline: adds a request timeout in seconds (see CLINE_TIMEOUT_SECONDS)
 *   - goose: uses { name, type, cmd, args } for its extensions array
 *   - opencode: uses { type: "local", command: [...] } with command as array
 */
export function getEntryForPlatform(platformKey) {
    const base = getServerEntry();
    switch (platformKey) {
        case 'vscode':
            return { type: 'stdio', ...base };
        case 'cline':
            return { ...base, timeout: CLINE_TIMEOUT_SECONDS };
        case 'goose':
            return { name: FSB_SERVER_NAME, type: 'stdio', cmd: base.command, args: base.args };
        case 'opencode':
            return { type: 'local', command: [base.command, ...base.args] };
        default:
            return { ...base };
    }
}
function getPlatformConfigPath(platform) {
    if (!platform.configPath)
        return null;
    // Respect OS restriction (e.g., BoltAI is macOS only)
    if (platform.osRestriction && process.platform !== platform.osRestriction)
        return null;
    const osPlatform = process.platform;
    const resolved = platform.configPath[osPlatform] || null;
    // Empty string means unsupported on this OS (e.g., BoltAI win32/linux)
    if (resolved === '')
        return null;
    return resolved;
}
function getPlatformTargetCandidates(platformKey, platform) {
    const configPath = getPlatformConfigPath(platform);
    if (!configPath)
        return [];
    if (platformKey === 'antigravity') {
        return [
            {
                configPath,
                targetLabel: platform.displayName,
                variant: null,
            },
            {
                configPath: join(home, '.gemini', 'antigravity', 'mcp_config.json'),
                targetLabel: platform.displayName + ' (older release)',
                variant: 'legacy',
                // Older releases read ~/.gemini/antigravity/mcp_config.json. Use it only
                // when ~/.gemini/config does not exist, so an upgraded install is not
                // pinned to a file the app no longer reads.
                fallback: true,
            },
        ];
    }
    if (platformKey === 'cline') {
        return [
            {
                configPath,
                targetLabel: platform.displayName,
                variant: null,
            },
            {
                configPath: CLINE_LEGACY_VSCODE_PATHS[process.platform],
                targetLabel: platform.displayName + ' (legacy VS Code settings)',
                variant: 'legacy-vscode',
                // Upgraded installs keep this file after importing it, so it must not
                // outrank a shared settings directory that exists without a file yet.
                fallback: true,
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
function findDetectedCandidate(candidates) {
    return candidates.find((candidate) => existsSync(candidate.configPath))
        ?? candidates.find((candidate) => existsSync(dirname(candidate.configPath)));
}
/**
 * Resolve the best config target for a platform on the current OS.
 * Prefers an existing config file first, then an existing parent directory,
 * consulting fallback candidates only when no other candidate is detected,
 * and finally falls back to the default documented path for dry-run/help output.
 *
 * @param platformKey - Platform key (e.g., 'cursor', 'antigravity')
 * @returns Structured target metadata for installer flows
 */
export function resolvePlatformTarget(platformKey) {
    const platform = PLATFORMS[platformKey];
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
    const detected = findDetectedCandidate(candidates.filter((candidate) => !candidate.fallback))
        ?? findDetectedCandidate(candidates.filter((candidate) => candidate.fallback));
    const target = detected ?? candidates[0];
    return {
        platformKey,
        platform,
        configPath: target.configPath,
        targetLabel: target.targetLabel,
        variant: target.variant,
        detected: detected !== undefined,
    };
}
/**
 * Resolves the config file path for a given platform on the current OS.
 * Returns null if the platform uses CLI format or the current OS is not mapped.
 *
 * @param platformKey - Platform key (e.g., 'cursor', 'claude-code')
 * @returns Absolute path to the config file, or null
 */
export function resolvePlatformConfig(platformKey) {
    return resolvePlatformTarget(platformKey).configPath;
}
/**
 * Returns an array of all platform flag names (keys of PLATFORMS).
 * Useful for CLI help text and flag enumeration.
 *
 * @returns Array of platform flag names
 */
export function getPlatformFlags() {
    return Object.keys(PLATFORMS);
}
//# sourceMappingURL=platforms.js.map