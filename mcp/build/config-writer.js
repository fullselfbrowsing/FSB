import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import stripJsonComments from 'strip-json-comments';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getServerEntry } from './platforms.js';
/**
 * Parse raw file content into a JS object based on format.
 * @param raw - Raw file content
 * @param format - One of: 'json', 'jsonc', 'toml', 'yaml'
 * @returns Parsed data
 */
function parseByFormat(raw, format) {
    // Some clients create their config file empty (Antigravity's mcp_config.json).
    if (raw.trim() === '')
        return {};
    switch (format) {
        case 'json':
            return JSON.parse(raw);
        case 'jsonc':
            return JSON.parse(stripJsonComments(raw, { trailingCommas: true }));
        case 'toml':
            return parseToml(raw);
        case 'yaml':
            return parseYaml(raw) || {};
        default:
            throw new Error('Unsupported format: ' + format);
    }
}
/**
 * Serialize a JS object back to string based on format.
 * JSONC is written back as plain JSON (comments are lost; the .bak backup preserves the original).
 * @param data - Data to serialize
 * @param format - One of: 'json', 'jsonc', 'toml', 'yaml'
 * @returns Serialized content
 */
export function serializeByFormat(data, format) {
    switch (format) {
        case 'json':
        case 'jsonc':
            return JSON.stringify(data, null, 2) + '\n';
        case 'toml':
            return stringifyToml(data) + '\n';
        case 'yaml':
            return stringifyYaml(data);
        default:
            throw new Error('Unsupported format: ' + format);
    }
}
/**
 * Merge a server entry into the config data under the correct key.
 * Handles both object-map format (most platforms) and named-array format (Continue, Goose).
 * @param data - Config data object
 * @param serverMapKey - Root key (e.g., 'mcpServers', 'servers', 'extensions')
 * @param serverName - Server name (e.g., 'fsb')
 * @param entry - Server entry to merge (shape varies by platform)
 * @param mergeStrategy - How to merge: 'object-map' or 'named-array'
 */
function mergeServerEntry(data, serverMapKey, serverName, entry, mergeStrategy) {
    if (mergeStrategy === 'named-array') {
        // Array format: entries matched by 'name' field (Continue, Goose)
        if (!Array.isArray(data[serverMapKey])) {
            data[serverMapKey] = [{ name: serverName, ...entry }];
            return;
        }
        const arr = data[serverMapKey];
        const idx = arr.findIndex((item) => item.name === serverName);
        if (idx >= 0) {
            arr[idx] = { name: serverName, ...entry };
        }
        else {
            arr.push({ name: serverName, ...entry });
        }
    }
    else {
        // Object map format: config[serverMapKey][serverName] = entry
        if (!data[serverMapKey] || typeof data[serverMapKey] !== 'object' || Array.isArray(data[serverMapKey])) {
            data[serverMapKey] = {};
        }
        data[serverMapKey][serverName] = entry;
    }
}
/**
 * Find the current server entry, if any, under the platform's root key.
 * @param data - Current config data
 * @param serverMapKey - Root key
 * @param serverName - Server name
 * @param mergeStrategy - How entries are stored: 'object-map' or 'named-array'
 * @returns The existing entry, or undefined when there is none
 */
function findExistingEntry(data, serverMapKey, serverName, mergeStrategy) {
    const container = data[serverMapKey];
    if (mergeStrategy === 'named-array') {
        return Array.isArray(container)
            ? container.find((item) => item?.name === serverName)
            : undefined;
    }
    if (!container || typeof container !== 'object' || Array.isArray(container))
        return undefined;
    return container[serverName];
}
/**
 * Copy the platform's preserved keys from the existing entry onto the new one
 * so a reinstall keeps settings the user chose in the client.
 * @param entry - Server entry FSB would write
 * @param existing - Entry currently in the config, if any
 * @param keys - Keys the client owns on the entry
 * @returns The entry to write
 */
function carryOverPreservedKeys(entry, existing, keys) {
    if (!keys?.length || !existing || typeof existing !== 'object' || Array.isArray(existing)) {
        return entry;
    }
    const merged = { ...entry };
    for (const [key, value] of Object.entries(existing)) {
        if (keys.includes(key) && value !== undefined)
            merged[key] = value;
    }
    return merged;
}
/**
 * Check if FSB is already configured identically (idempotency check).
 * @param data - Current config data
 * @param serverMapKey - Root key
 * @param serverName - Server name
 * @param entry - Server entry to compare
 * @param mergeStrategy - How entries are stored: 'object-map' or 'named-array'
 * @returns True if already identically configured
 */
function checkIdempotent(data, serverMapKey, serverName, entry, mergeStrategy) {
    if (mergeStrategy === 'named-array') {
        if (!Array.isArray(data[serverMapKey]))
            return false;
        const arr = data[serverMapKey];
        const found = arr.find((item) => item.name === serverName);
        if (!found)
            return false;
        return isDeepStrictEqual({ name: serverName, ...entry }, found);
    }
    else {
        const map = data[serverMapKey];
        if (!map?.[serverName])
            return false;
        return isDeepStrictEqual(map[serverName], entry);
    }
}
/**
 * Check if the server entry already exists (for create vs update distinction).
 * @param data - Current config data
 * @param serverMapKey - Root key
 * @param serverName - Server name
 * @param mergeStrategy - How entries are stored: 'object-map' or 'named-array'
 * @returns True if an entry exists for the given server name
 */
function hasExistingEntry(data, serverMapKey, serverName, mergeStrategy) {
    if (mergeStrategy === 'named-array') {
        return Array.isArray(data[serverMapKey]) &&
            data[serverMapKey].some((item) => item.name === serverName);
    }
    const map = data[serverMapKey];
    return map?.[serverName] !== undefined;
}
/**
 * Install FSB server entry into a platform's config file.
 * Handles read-merge-write with backup, idempotency, and graceful error handling.
 *
 * @param configPath - Resolved absolute path to the config file
 * @param platform - Platform entry from PLATFORMS (has format, serverMapKey, mergeStrategy, displayName)
 * @param serverName - Server name key, always 'fsb'
 * @param entry - Optional server entry override; falls back to getServerEntry()
 * @returns Result with status, path, and message
 */
export async function installToConfig(configPath, platform, serverName, entry = null) {
    try {
        // 1. Check directory exists (INST-08, D-02) -- do NOT create it
        const dir = dirname(configPath);
        if (!existsSync(dir)) {
            return {
                status: 'error',
                path: configPath,
                message: 'Directory does not exist: ' + dir + ' -- is ' + platform.displayName + ' installed?',
            };
        }
        // 2. Build the server entry (use caller-provided entry or fall back to default)
        const baseEntry = entry || { ...getServerEntry() };
        const strategy = platform.mergeStrategy;
        // 3. Read existing file or start fresh, backup before any mutation
        let data = {};
        const fileExists = existsSync(configPath);
        if (fileExists) {
            // Backup (INST-03) -- create .bak before reading ensures recovery even on skip
            await copyFile(configPath, configPath + '.bak');
            const raw = await readFile(configPath, 'utf-8');
            data = parseByFormat(raw, platform.format);
        }
        // Keep client-owned settings from an existing entry (e.g. Cline's auto-approve list)
        const serverEntry = carryOverPreservedKeys(baseEntry, findExistingEntry(data, platform.serverMapKey, serverName, strategy), platform.preservedEntryKeys);
        // 4. Check idempotency (INST-04) -- skip if already identical
        if (checkIdempotent(data, platform.serverMapKey, serverName, serverEntry, strategy)) {
            return {
                status: 'skipped',
                path: configPath,
                message: platform.displayName + ' already configured',
            };
        }
        // 5. Determine if this is create or update
        const isUpdate = fileExists && hasExistingEntry(data, platform.serverMapKey, serverName, strategy);
        // 6. Merge
        mergeServerEntry(data, platform.serverMapKey, serverName, serverEntry, strategy);
        // 7. Serialize and write
        const output = serializeByFormat(data, platform.format);
        await writeFile(configPath, output, 'utf-8');
        // 8. Return result
        return {
            status: isUpdate ? 'updated' : 'created',
            path: configPath,
            message: (isUpdate ? 'Updated' : 'Installed to') + ' ' + platform.displayName + ': ' + configPath,
        };
    }
    catch (err) {
        return {
            status: 'error',
            path: configPath,
            message: 'Failed to configure ' + platform.displayName + ': ' + err.message,
        };
    }
}
/**
 * Remove FSB server entry from a platform's config file.
 *
 * @param configPath - Resolved absolute path to the config file
 * @param platform - Platform entry from PLATFORMS (has format, serverMapKey, mergeStrategy, displayName)
 * @param serverName - Server name key, always 'fsb'
 * @returns Result with status, path, and message
 */
export async function removeFromConfig(configPath, platform, serverName) {
    try {
        // 1. Check directory and file exist
        const dir = dirname(configPath);
        if (!existsSync(dir) || !existsSync(configPath)) {
            return {
                status: 'not-found',
                path: configPath,
                message: platform.displayName + ' config file not found: ' + configPath,
            };
        }
        // 2. Read and parse the file
        const raw = await readFile(configPath, 'utf-8');
        const data = parseByFormat(raw, platform.format);
        const strategy = platform.mergeStrategy;
        // 3. Check if entry exists and remove
        if (strategy === 'named-array') {
            // Named array format (Continue, Goose)
            if (!Array.isArray(data[platform.serverMapKey])) {
                return {
                    status: 'not-found',
                    path: configPath,
                    message: 'FSB not configured in ' + platform.displayName,
                };
            }
            const arr = data[platform.serverMapKey];
            const idx = arr.findIndex((item) => item.name === serverName);
            if (idx < 0) {
                return {
                    status: 'not-found',
                    path: configPath,
                    message: 'FSB not configured in ' + platform.displayName,
                };
            }
            arr.splice(idx, 1);
        }
        else {
            // Object map format
            const map = data[platform.serverMapKey];
            if (!map?.[serverName]) {
                return {
                    status: 'not-found',
                    path: configPath,
                    message: 'FSB not configured in ' + platform.displayName,
                };
            }
            delete map[serverName];
        }
        // 4. Backup the file
        await copyFile(configPath, configPath + '.bak');
        // 5. Serialize and write
        const output = serializeByFormat(data, platform.format);
        await writeFile(configPath, output, 'utf-8');
        // 6. Return result
        return {
            status: 'removed',
            path: configPath,
            message: 'Removed from ' + platform.displayName + ': ' + configPath,
        };
    }
    catch (err) {
        return {
            status: 'error',
            path: configPath,
            message: 'Failed to remove from ' + platform.displayName + ': ' + err.message,
        };
    }
}
//# sourceMappingURL=config-writer.js.map