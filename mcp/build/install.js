import { PLATFORMS, resolvePlatformTarget, getEntryForPlatform, CLINE_TIMEOUT_SECONDS } from './platforms.js';
import { installToConfig, isFsbConfiguredAnywhere, removeFromConfig, serializeByFormat, } from './config-writer.js';
import { FSB_MCP_VERSION, FSB_SERVER_NAME } from './version.js';
import { execSync, spawn } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { isNativeHostExtensionId, } from './native-host/constants.js';
import { compareNativeHostVersions, installNativeHost, uninstallNativeHost, } from './native-host-install/index.js';
import { NATIVE_HOST_BROWSERS, isNativeHostBrowser } from './native-host-install/browser.js';
import { DELEGATION_LOG_FILENAME, DELEGATION_LOG_ROTATED_FILENAME, } from './agent-providers/delegation-log.js';
import { resolveNativeHostPlatformLayout } from './native-host-install/platform.js';
const STDIO_COMMAND = 'npx -y fsb-mcp-server@latest';
const WINDOWS_STDIO_COMMAND = 'cmd /c npx -y fsb-mcp-server@latest';
const NATIVE_HOST_INSTALL_USAGE = 'Usage: fsb-mcp-server install --native-host [--browser <chrome|edge|brave|chromium>] [--extension-id <32 lowercase a-p chars>]';
const NATIVE_HOST_UNINSTALL_USAGE = 'Usage: fsb-mcp-server uninstall --native-host [--browser <chrome|edge|brave|chromium>]';
const NATIVE_HOST_REFUSAL_REASONS = new Set([
    'boundary-changed',
    'daemon-busy',
    'daemon-unidentified',
    'foreign-state',
    'install-failed',
    'invalid-materialized-package',
    'invalid-pack-receipt',
    'invalid-request',
    'invalid-source-package',
    'invalid-state',
    'lock-lost',
    'locked',
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
    'runtime-not-exact',
    'runtime-remove-failed',
    'split-state',
    'stable-root-not-absent',
    'stage-failed',
    'stop-request-failed',
    'swap-failed',
    'tarball-integrity-mismatch',
    'unavailable',
    'unsupported-architecture',
    'version-mismatch',
    'wake-in-progress',
    'wake-lock-failed',
]);
const HELPER_LABEL = "FSB's local helper (native messaging host)";
const DOCTOR_HINT = 'Run npx -y fsb-mcp-server@latest doctor for details.';
const NATIVE_HOST_BROWSER_LABELS = Object.freeze({
    chrome: 'Chrome',
    edge: 'Edge',
    brave: 'Brave',
    chromium: 'Chromium',
});
const BOUNDED_VERSION_PATTERN = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z.-]{1,64})?$/u;
const BOUNDED_REASON_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const PROVIDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
// Client install flags that leave a run "bare": with only these, install sets
// up the helper and then prints the usage.
const BARE_INSTALL_FLAGS = new Set(['dry-run', 'no-native-host', 'extension-id']);
function defaultNativeHostLayout() {
    if (!['darwin', 'linux', 'win32'].includes(process.platform))
        return null;
    try {
        return resolveNativeHostPlatformLayout({
            platform: process.platform,
            homeDirectory: homedir(),
            ...(process.platform === 'win32'
                ? { localAppData: process.env.LOCALAPPDATA }
                : {}),
        });
    }
    catch {
        return null;
    }
}
function expectedNativeHostLocation() {
    return defaultNativeHostLayout()?.manifestPath ?? 'Unavailable';
}
/** Where the helper's own files live, shared by every browser registration. */
function expectedNativeHostRoot() {
    return defaultNativeHostLayout()?.stableRoot ?? 'Unavailable';
}
// Compositions that only know the single-browser transactions answer the
// ensure and uninstall-all operations as unavailable and keep no opt-out.
const unavailableEnsureOperations = Object.freeze({
    ensure: async () => Object.freeze({
        outcome: 'unavailable',
        reason: 'unavailable',
        browsers: [],
        addedBrowsers: [],
        stableRoot: '',
    }),
    uninstallAll: async () => Object.freeze({
        outcome: 'unavailable',
        reason: 'unavailable',
        removedBrowsers: [],
    }),
    readOptOut: () => null,
    writeOptOut: () => undefined,
    clearOptOut: () => undefined,
});
const unavailableNativeHostCliOperations = Object.freeze({
    ...unavailableEnsureOperations,
    install: async () => Object.freeze({
        status: 'refused',
        reason: 'unavailable',
        location: expectedNativeHostLocation(),
        origin: null,
        packageVersion: null,
    }),
    uninstall: async () => Object.freeze({
        status: 'refused',
        reason: 'unavailable',
        location: expectedNativeHostLocation(),
        origin: null,
        packageVersion: null,
    }),
});
export function createNativeHostCliOperations(dependencies) {
    return Object.freeze({
        ...unavailableEnsureOperations,
        install: (request) => installNativeHost(request, dependencies),
        uninstall: (request = {}) => {
            const browser = request.browser ?? 'chrome';
            if (browser !== dependencies.platform.layout.browser) {
                return Promise.resolve(Object.freeze({
                    status: 'refused',
                    reason: 'invalid-request',
                    location: dependencies.platform.layout.manifestPath,
                    origin: null,
                    packageVersion: null,
                }));
            }
            return uninstallNativeHost(dependencies);
        },
    });
}
function nativeHostTargetRequested(flags) {
    return Boolean(flags && typeof flags === 'object' && Object.hasOwn(flags, 'native-host'));
}
function exactNativeFlags(flags, allowedKeys) {
    try {
        if (!flags || typeof flags !== 'object' || Array.isArray(flags))
            return null;
        if (Object.getPrototypeOf(flags) !== Object.prototype)
            return null;
        const keys = Reflect.ownKeys(flags);
        if (keys.length < 1
            || keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key))) {
            return null;
        }
        const values = Object.create(null);
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(flags, key);
            if (typeof key !== 'string'
                || !descriptor
                || !descriptor.enumerable
                || !Object.hasOwn(descriptor, 'value')) {
                return null;
            }
            values[key] = descriptor.value;
        }
        return values;
    }
    catch {
        return null;
    }
}
function nativeInstallRequest(flags) {
    const values = exactNativeFlags(flags, ['native-host', 'browser', 'extension-id']);
    if (!values || values['native-host'] !== true)
        return null;
    const browser = Object.hasOwn(values, 'browser') ? values.browser : undefined;
    const extensionId = Object.hasOwn(values, 'extension-id') ? values['extension-id'] : undefined;
    if (browser !== undefined
        && !isNativeHostBrowser(browser))
        return null;
    if (extensionId !== undefined
        && (typeof extensionId !== 'string' || !isNativeHostExtensionId(extensionId)))
        return null;
    return Object.freeze({
        ...(browser !== undefined ? { browser: browser } : {}),
        ...(extensionId !== undefined ? { extensionId } : {}),
    });
}
function nativeUninstallRequest(flags) {
    const values = exactNativeFlags(flags, ['native-host', 'browser']);
    if (!values || values['native-host'] !== true)
        return null;
    if (!Object.hasOwn(values, 'browser'))
        return Object.freeze({});
    const browser = values.browser;
    if (!isNativeHostBrowser(browser))
        return null;
    return Object.freeze({ browser: browser });
}
// `install --native-host --ensure [--quiet]` is the refresh a stdio server
// starts in the background. It takes no other flag.
function nativeEnsureFlags(flags) {
    const values = exactNativeFlags(flags, ['native-host', 'ensure', 'quiet']);
    if (!values || values['native-host'] !== true || values.ensure !== true)
        return null;
    if (Object.hasOwn(values, 'quiet') && values.quiet !== true)
        return null;
    return Object.freeze({ quiet: values.quiet === true });
}
function rejectNativeUsage(usage) {
    console.error(usage);
    process.exitCode = 1;
}
function boundedNativeLocation(value) {
    return typeof value === 'string'
        && value.length > 0
        && Buffer.byteLength(value, 'utf8') <= 4096
        && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
        ? value
        : 'Unavailable';
}
function exactNativeOrigin(value) {
    if (typeof value !== 'string'
        || !value.startsWith('chrome-extension://')
        || !value.endsWith('/')) {
        return null;
    }
    const extensionId = value.slice('chrome-extension://'.length, -1);
    return isNativeHostExtensionId(extensionId) ? value : null;
}
function stableNativeRefusalReason(value) {
    return typeof value === 'string' && NATIVE_HOST_REFUSAL_REASONS.has(value)
        ? value
        : 'unavailable';
}
function printNativeHostRefusal(reasonValue, locationValue) {
    console.error(`Native messaging host was not changed: ${stableNativeRefusalReason(reasonValue)}`);
    console.error(`Expected location: ${boundedNativeLocation(locationValue)}`);
    console.error('Run npx -y fsb-mcp-server@latest doctor for repair details.');
    process.exitCode = 1;
}
function exactNativeReceipt(value) {
    const expectedKeys = ['location', 'origin', 'packageVersion', 'reason', 'status'];
    try {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return null;
        if (Object.getPrototypeOf(value) !== Object.prototype)
            return null;
        const keys = Reflect.ownKeys(value);
        if (keys.length !== expectedKeys.length
            || keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))) {
            return null;
        }
        const fields = Object.create(null);
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (typeof key !== 'string'
                || !descriptor
                || !descriptor.enumerable
                || !Object.hasOwn(descriptor, 'value')) {
                return null;
            }
            fields[key] = descriptor.value;
        }
        return fields;
    }
    catch {
        return null;
    }
}
function boundedVersion(value) {
    return typeof value === 'string' && BOUNDED_VERSION_PATTERN.test(value) ? value : null;
}
function printNativeInstallResult(result, updatedFrom = null) {
    const receipt = exactNativeReceipt(result);
    if (!receipt) {
        printNativeHostRefusal('unavailable', 'Unavailable');
        return;
    }
    const location = boundedNativeLocation(receipt.location);
    const origin = exactNativeOrigin(receipt.origin);
    if (receipt.status === 'refused') {
        printNativeHostRefusal(receipt.reason, receipt.location);
        return;
    }
    if (location === 'Unavailable'
        || !origin
        || (receipt.status !== 'installed' && receipt.status !== 'already-installed')) {
        printNativeHostRefusal('unavailable', location);
        return;
    }
    const version = boundedVersion(receipt.packageVersion);
    if (updatedFrom && version) {
        console.log(`Native messaging host updated from ${updatedFrom} to ${version}.`);
    }
    else {
        console.log(receipt.status === 'installed'
            ? 'Native messaging host installed.'
            : 'Native messaging host is already installed.');
    }
    console.log(`Expected location: ${location}`);
    console.log(`Allowed origin: ${origin}`);
}
function printNativeUninstallResult(result, browser) {
    const receipt = exactNativeReceipt(result);
    if (!receipt) {
        printNativeHostRefusal('unavailable', 'Unavailable');
        return;
    }
    const location = boundedNativeLocation(receipt.location);
    if (receipt.status === 'refused') {
        printNativeHostRefusal(receipt.reason, receipt.location);
        return;
    }
    if (location === 'Unavailable'
        || (receipt.status !== 'removed' && receipt.status !== 'not-installed')) {
        printNativeHostRefusal('unavailable', location);
        return;
    }
    if (receipt.status === 'removed') {
        console.log('Native messaging host removed.');
        console.log('Removed: 1');
    }
    else {
        console.log('Native messaging host is not installed.');
        console.log('Removed: 0');
    }
    console.log(`Expected location: ${location}`);
    // One browser's registration can go while the helper stays for the others.
    const label = browser ? NATIVE_HOST_BROWSER_LABELS[browser] : 'This browser';
    if (receipt.status === 'removed' && receipt.reason === 'registration-removed') {
        console.log(`Only the ${label} registration was removed; ${HELPER_LABEL} stays installed for the other browsers.`);
    }
    else if (receipt.status === 'not-installed' && typeof receipt.origin === 'string') {
        console.log(`${label} has no registration; ${HELPER_LABEL} is still installed for other browsers.`);
    }
}
function plainRecord(value) {
    try {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return null;
        if (Object.getPrototypeOf(value) !== Object.prototype)
            return null;
        const fields = Object.create(null);
        for (const key of Reflect.ownKeys(value)) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value'))
                return null;
            fields[key] = descriptor.value;
        }
        return fields;
    }
    catch {
        return null;
    }
}
function boundedReason(value) {
    return typeof value === 'string' && BOUNDED_REASON_PATTERN.test(value) ? value : 'unavailable';
}
function browserNames(value) {
    if (!Array.isArray(value))
        return null;
    const names = NATIVE_HOST_BROWSERS
        .filter((browser) => value.includes(browser))
        .map((browser) => NATIVE_HOST_BROWSER_LABELS[browser]);
    return names.length > 0 ? names.join(', ') : null;
}
function forBrowsers(value) {
    const names = browserNames(value);
    return names ? ' for ' + names : '';
}
/**
 * A browser the run meant to register beside the others but could not. The
 * helper works for the rest, so this is a warning; the same install command
 * plans the missing browser again.
 */
function printFailedRegistrations(result) {
    const names = browserNames(result.failedBrowsers);
    if (!names)
        return;
    console.error('\u26A0 ' + HELPER_LABEL + ' was not registered for ' + names + ': '
        + boundedReason(result.failedReason) + '. Run the same install command again.');
}
/**
 * One line for an ensure result. Successes go to stdout; anything that left
 * the helper missing or stale goes to stderr as a warning. Neither changes
 * the exit code.
 */
function printHelperEnsureResult(value) {
    const result = plainRecord(value);
    const reason = boundedReason(result?.reason);
    switch (result?.outcome) {
        case 'installed':
            console.log('\u2713 Installed ' + HELPER_LABEL + forBrowsers(result.browsers));
            printFailedRegistrations(result);
            return;
        case 'refreshed': {
            const version = boundedVersion(result.version);
            console.log('\u2713 Updated ' + HELPER_LABEL + (version ? ' to ' + version : '') + forBrowsers(result.browsers));
            printFailedRegistrations(result);
            return;
        }
        case 'registered':
            console.log('\u2713 Registered ' + HELPER_LABEL + forBrowsers(result.addedBrowsers));
            printFailedRegistrations(result);
            return;
        case 'current':
            console.log('\u25CB ' + HELPER_LABEL + ' is already installed' + forBrowsers(result.browsers)
                + (result.reason === 'installed-newer' ? ' (a newer version than this package)' : ''));
            printFailedRegistrations(result);
            return;
        case 'skipped-absent':
        case 'skipped-opt-out':
            console.log('\u25CB ' + HELPER_LABEL + ' was not changed: ' + reason);
            return;
        case 'deferred':
            // `install --native-host` would record the helper as explicit and drop
            // the extension ID and browser set this install chose, so the retry is
            // this same command, or for an installed helper the next server start.
            console.error('\u26A0 ' + HELPER_LABEL + ' was not updated: ' + reason + '. '
                + (boundedVersion(result.version)
                    ? 'FSB retries this the next time an MCP client starts it, or run the same install command again'
                        + (reason === 'daemon-busy' ? ' once no delegated run is active.' : ' later.')
                    : 'Run the same install command again.'));
            return;
        default:
            console.error('\u26A0 ' + HELPER_LABEL + ' was not changed: ' + reason + '. ' + DOCTOR_HINT);
    }
}
function printNativeUninstallAllResult(value) {
    const result = plainRecord(value);
    if (result?.outcome === 'removed') {
        console.log('Native messaging host removed.');
        console.log('Removed registrations: ' + (browserNames(result.removedBrowsers) ?? 'none'));
        console.log(`Expected location: ${boundedNativeLocation(expectedNativeHostRoot())}`);
        return;
    }
    if (result?.outcome === 'absent') {
        console.log('Native messaging host is not installed.');
        console.log('Removed registrations: none');
        console.log(`Expected location: ${boundedNativeLocation(expectedNativeHostRoot())}`);
        return;
    }
    printNativeHostRefusal(result?.reason, expectedNativeHostRoot());
}
/** The background refresh: one quiet pass that never installs. */
async function runNativeEnsure(quiet, operations) {
    let result = null;
    try {
        result = await operations.ensure(Object.freeze({
            mode: 'refresh-only',
            browsers: 'auto',
            provenance: 'auto',
        }));
    }
    catch {
        result = null;
    }
    if (!quiet)
        printHelperEnsureResult(result);
}
/**
 * `install --native-host`: the explicit install and repair path. It withdraws
 * an earlier opt-out, and when this package owns an older helper it refreshes
 * that helper in place instead of refusing. A newer helper is never replaced.
 */
async function runExplicitNativeInstall(request, operations) {
    try {
        operations.clearOptOut();
    }
    catch {
        // The install transaction withdraws the opt-out again under its lock.
    }
    let first;
    try {
        first = await operations.install(request);
    }
    catch {
        printNativeHostRefusal('unavailable', expectedNativeHostLocation());
        return;
    }
    const receipt = exactNativeReceipt(first);
    const installedVersion = receipt?.status === 'refused' && receipt.reason === 'version-mismatch'
        ? boundedVersion(receipt.packageVersion)
        : null;
    const order = installedVersion ? compareNativeHostVersions(installedVersion, FSB_MCP_VERSION) : null;
    if (!receipt || !installedVersion || order === null || order >= 0) {
        printNativeInstallResult(first);
        return;
    }
    const ensureRequest = Object.freeze({
        mode: 'install',
        browsers: Object.freeze([request.browser ?? 'chrome']),
        ...(request.extensionId ? { extensionId: request.extensionId } : {}),
        provenance: 'explicit',
    });
    let ensured = null;
    try {
        ensured = plainRecord(await operations.ensure(ensureRequest));
    }
    catch {
        ensured = null;
    }
    const outcome = ensured?.outcome;
    if (outcome !== 'refreshed' && outcome !== 'registered' && outcome !== 'current') {
        printNativeHostRefusal(ensured?.reason, receipt.location);
        return;
    }
    let second;
    try {
        second = await operations.install(request);
    }
    catch {
        printNativeHostRefusal('unavailable', receipt.location);
        return;
    }
    printNativeInstallResult(second, outcome === 'refreshed' ? installedVersion : null);
}
/** The helper step every client install ends with. */
async function runInstallHelperStep(flags, operations) {
    if (flags['dry-run'] === true) {
        console.log('[DRY RUN] ' + HELPER_LABEL);
        if (flags['no-native-host'] === true) {
            console.log('  Would skip it and pause its automatic refresh (--no-native-host)');
            return;
        }
        console.log('  Would install or refresh it for each browser with FSB installed (Chrome when none is found)');
        console.log('  Files: ' + boundedNativeLocation(expectedNativeHostRoot()));
        return;
    }
    if (flags['no-native-host'] === true) {
        try {
            operations.writeOptOut('install-no-native-host');
        }
        catch {
            // A refresh still only updates a helper that is already installed.
        }
        console.log('\u25CB Skipped ' + HELPER_LABEL
            + ': --no-native-host was given. It is not set up or refreshed until you run install without that flag.');
        return;
    }
    const extensionId = flags['extension-id'];
    if (extensionId !== undefined
        && (typeof extensionId !== 'string' || !isNativeHostExtensionId(extensionId))) {
        console.error('\u26A0 ' + HELPER_LABEL + ' was not set up: --extension-id must be the 32 lowercase'
            + ' a-p characters shown on the browser\'s extensions page.');
        return;
    }
    try {
        operations.clearOptOut();
    }
    catch {
        // The ensure transaction withdraws the opt-out again under its lock.
    }
    let result = null;
    try {
        result = await operations.ensure(Object.freeze({
            mode: 'install',
            browsers: 'auto',
            ...(typeof extensionId === 'string' ? { extensionId } : {}),
            provenance: 'auto',
        }));
    }
    catch {
        result = null;
    }
    printHelperEnsureResult(result);
}
function describeFindings(findings) {
    const labels = [];
    for (const finding of findings) {
        const label = finding.state === 'unreadable'
            ? finding.label + ' (config could not be read)'
            : finding.label;
        if (!labels.includes(label))
            labels.push(label);
    }
    return labels.join(', ');
}
// The log rotates at about 1 MiB; anything far past that is not the log.
const DELEGATION_LOG_SCAN_MAX_BYTES = 8 * 1024 * 1024;
/**
 * The agent providers that have started a delegated run through the local
 * agent service, read from its delegation log and the one rotated copy. The
 * extension reaches that service only through the helper, so any such run
 * means the extension still needs it. A connection test or sign-in writes no
 * `run_started` entry and so never counts.
 */
async function delegatedAgentsInLog(homeDirectory) {
    const root = join(homeDirectory, '.fsb', 'agent-runtime');
    const agents = new Set();
    let unreadable = false;
    for (const name of [DELEGATION_LOG_FILENAME, DELEGATION_LOG_ROTATED_FILENAME]) {
        let text;
        try {
            const fact = await lstat(join(root, name));
            if (!fact.isFile() || fact.size > DELEGATION_LOG_SCAN_MAX_BYTES) {
                unreadable = true;
                continue;
            }
            text = await readFile(join(root, name), 'utf8');
        }
        catch (err) {
            const code = err?.code;
            if (code !== 'ENOENT' && code !== 'ENOTDIR')
                unreadable = true;
            continue;
        }
        for (const line of text.split('\n')) {
            if (!line.includes('run_started'))
                continue;
            try {
                const record = JSON.parse(line);
                if (record?.event !== 'run_started')
                    continue;
                agents.add(typeof record.adapterId === 'string' && PROVIDER_NAME_PATTERN.test(record.adapterId)
                    ? record.adapterId
                    : 'an agent');
            }
            catch {
                // A torn line is skipped; the other lines still count.
            }
        }
    }
    if (agents.size === 0 && unreadable)
        return null;
    return [...agents].sort();
}
async function nativeHostDirectoryPresent() {
    const root = defaultNativeHostLayout()?.stableRoot;
    if (!root)
        return true;
    try {
        await lstat(root);
        return true;
    }
    catch (err) {
        const code = err?.code;
        return code !== 'ENOENT' && code !== 'ENOTDIR';
    }
}
const productionUninstallChecks = Object.freeze({
    scanClients: () => isFsbConfiguredAnywhere(),
    delegatedAgents: () => delegatedAgentsInLog(homedir()),
    helperPresent: () => nativeHostDirectoryPresent(),
});
/**
 * The helper step client uninstall ends with. The helper goes only when no
 * client config still names FSB (skipped for --all), the extension has never
 * run a delegated agent through it, and `install` rather than
 * `install --native-host` set it up. `--all` also pauses the automatic
 * refresh, whatever happens to the helper.
 */
async function runUninstallHelperStep(flags, isAll, operations, checks) {
    if (flags['dry-run'] === true) {
        console.log('[DRY RUN] ' + HELPER_LABEL);
        console.log(isAll
            ? '  Would remove it if install set it up and the extension has not run a delegated agent through it, and pause its automatic refresh'
            : '  Would remove it if install set it up, no other client uses FSB, and the extension has not run a delegated agent through it');
        return;
    }
    if (isAll) {
        try {
            operations.writeOptOut('uninstall-all');
        }
        catch {
            // A refresh still only updates a helper that is already installed.
        }
    }
    const reasons = [];
    let unchecked = [];
    if (!isAll) {
        let scan = null;
        try {
            scan = await checks.scanClients();
        }
        catch {
            scan = null;
        }
        if (!scan) {
            reasons.push('the other client configs could not be checked');
        }
        else {
            unchecked = Array.isArray(scan.unchecked) ? scan.unchecked : [];
            if (scan.configured) {
                reasons.push('FSB is still configured in ' + (describeFindings(scan.findings ?? []) || 'another client'));
            }
        }
    }
    let agents = null;
    try {
        agents = await checks.delegatedAgents();
    }
    catch {
        agents = null;
    }
    if (agents === null) {
        reasons.push('the delegation log in ~/.fsb/agent-runtime could not be read');
    }
    else if (agents.length > 0) {
        const names = agents.filter((name) => PROVIDER_NAME_PATTERN.test(name));
        reasons.push('the browser extension has run delegated agents through it'
            + (names.length > 0 ? ' (' + names.join(', ') + ')' : ''));
    }
    if (reasons.length > 0) {
        let present = true;
        try {
            present = await checks.helperPresent();
        }
        catch {
            present = true;
        }
        // Nothing to keep: say nothing, as when no reason applies and no helper exists.
        if (!present)
            return;
        console.log('\u25CB ' + HELPER_LABEL + ' was not removed: ' + reasons.join('; ')
            + '. To remove it anyway, run npx -y fsb-mcp-server@latest uninstall --native-host');
        return;
    }
    let result = null;
    try {
        result = plainRecord(await operations.uninstallAll(Object.freeze({ onlyProvenance: 'auto' })));
    }
    catch {
        result = null;
    }
    switch (result?.outcome) {
        case 'removed': {
            const names = browserNames(result.removedBrowsers);
            console.log('\u2713 Removed ' + HELPER_LABEL + (names ? ' from ' + names : ''));
            if (unchecked.length > 0) {
                console.log('  Not checked, because they are set up by hand: ' + unchecked.join(', '));
            }
            return;
        }
        case 'absent':
            return;
        case 'kept':
            console.log('\u25CB Kept ' + HELPER_LABEL + ': install --native-host set it up. Remove it with'
                + ' npx -y fsb-mcp-server@latest uninstall --native-host');
            return;
        default:
            console.error('\u26A0 ' + HELPER_LABEL + ' was not removed: ' + boundedReason(result?.reason) + '. ' + DOCTOR_HINT);
    }
}
/**
 * True when the package root (the directory above build/) sits inside a
 * node_modules directory, as it does for npx, global and project installs.
 * A source checkout, or the helper's own staged copy, is never under one.
 */
function runsFromInstalledPackage(entryPath) {
    if (typeof entryPath !== 'string' || !isAbsolute(entryPath))
        return false;
    return dirname(dirname(entryPath)).split(/[\\/]+/u).includes('node_modules');
}
/**
 * Starts `install --native-host --ensure --quiet` in a detached process that
 * outlives the client, writes nothing to this server's stdio, and only
 * refreshes a helper that is already installed. Skipped when
 * FSB_NATIVE_HOST_AUTO=0 or when the server runs from a source checkout, so a
 * development build never replaces the real helper.
 * @returns True when the refresh process was started
 */
export function startNativeHostAutoRefresh(options) {
    const environment = options.environment ?? process.env;
    if (environment.FSB_NATIVE_HOST_AUTO === '0')
        return false;
    if (!runsFromInstalledPackage(options.entryPath))
        return false;
    try {
        const child = (options.spawnChild ?? spawn)(options.execPath ?? process.execPath, [options.entryPath, 'install', '--native-host', '--ensure', '--quiet'], { detached: true, stdio: 'ignore', windowsHide: true });
        // A spawn failure must never reach the server as an unhandled error.
        child.on('error', () => undefined);
        child.unref();
        return true;
    }
    catch {
        return false;
    }
}
export function getClaudeCodeInstallCommand() {
    return 'claude mcp add --scope user ' + FSB_SERVER_NAME + ' -- ' + STDIO_COMMAND;
}
export function getInstallNextStep(platformKey, variant = null) {
    switch (platformKey) {
        case 'claude-code':
            return 'Already active after add. If tools do not appear, run doctor and status --watch before retrying.';
        case 'claude-desktop':
            return 'Restart Claude Desktop after editing the MCP config.';
        case 'cursor':
            return 'Restart Cursor after editing ~/.cursor/mcp.json.';
        case 'vscode':
            return 'Open the MCP view in VS Code, trust/start the server if prompted, then reload VS Code if it does not start automatically.';
        case 'antigravity':
            return variant === 'legacy'
                ? 'In Antigravity, open Manage MCP Servers and press refresh after editing ~/.gemini/antigravity/mcp_config.json. If fsb does not appear, View raw config shows which file your release reads; current releases read ~/.gemini/config/mcp_config.json.'
                : 'In Antigravity, open Manage MCP Servers and press refresh after editing ~/.gemini/config/mcp_config.json. View raw config there shows which file Antigravity reads.';
        case 'codex':
            return 'Restart Codex or reload the MCP server list after editing ~/.codex/config.toml.';
        case 'cline':
            return variant === 'legacy-vscode'
                ? 'Reload VS Code/Cline after editing the MCP settings file. Current Cline releases read ~/.cline/data/settings/cline_mcp_settings.json instead; update Cline and rerun this install if fsb does not appear.'
                : 'Cline reloads ~/.cline/data/settings/cline_mcp_settings.json on its own. If fsb does not appear, restart it under MCP Servers in Cline, or start a new Cline CLI session.';
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
function printPlatformInstructions(platformKey) {
    switch (platformKey) {
        case 'jetbrains':
            console.log('');
            console.log('JetBrains (AI Assistant / Junie):');
            console.log('  1. Open Settings > Tools > AI Assistant > MCP Servers');
            console.log('  2. Click "+" to add a new server');
            console.log('  3. Set the command to: npx');
            console.log('  4. Set the arguments to: -y fsb-mcp-server@latest');
            console.log('  5. Name it: fsb');
            console.log('  Supported IDEs: IntelliJ, WebStorm, PyCharm, GoLand, Android Studio, etc.');
            break;
        case 'chatgpt':
            console.log('');
            console.log('ChatGPT (Streamable HTTP -- remote only):');
            console.log('  1. Start the FSB HTTP server:');
            console.log('     npx -y fsb-mcp-server@latest serve');
            console.log('  2. In ChatGPT, go to Settings > Connections > MCP');
            console.log('  3. Add a new MCP server with URL:');
            console.log('     http://127.0.0.1:7226/mcp');
            console.log('  Note: The server must be running while you use ChatGPT.');
            break;
        case 'claude-ai':
            console.log('');
            console.log('Claude.ai (Streamable HTTP -- remote only):');
            console.log('  1. Start the FSB HTTP server:');
            console.log('     npx -y fsb-mcp-server@latest serve');
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
            console.log('  3. Set the command to: npx -y fsb-mcp-server@latest');
            console.log('  4. Name it: fsb');
            break;
        default:
            console.log('No setup instructions available for: ' + platformKey);
    }
}
export function getSetupSections(httpEndpoint, cursorDeeplink) {
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
                '  npx -y fsb-mcp-server@latest serve',
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
                '  args = ["-y", "fsb-mcp-server@latest"]',
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
            title: 'Antigravity',
            lines: [
                'Supported config paths:',
                '  ~/.gemini/config/mcp_config.json',
                '  ~/.gemini/antigravity/mcp_config.json (older releases)',
                'Use the standard stdio entry:',
                '  {',
                '    "mcpServers": {',
                '      "fsb": {',
                '        "command": "npx",',
                '        "args": ["-y", "fsb-mcp-server@latest"]',
                '      }',
                '    }',
                '  }',
                'Next step:',
                '  Open Manage MCP Servers in Antigravity and press refresh after editing the matching config file.',
            ],
        },
        {
            title: 'Cline (VS Code, JetBrains, CLI)',
            lines: [
                'Config: ~/.cline/data/settings/cline_mcp_settings.json',
                '  (CLINE_MCP_SETTINGS_PATH, CLINE_DATA_DIR, or CLINE_DIR move it, as in Cline)',
                'Add:',
                '  {',
                '    "mcpServers": {',
                '      "fsb": {',
                '        "command": "npx",',
                '        "args": ["-y", "fsb-mcp-server@latest"],',
                '        "timeout": ' + CLINE_TIMEOUT_SECONDS,
                '      }',
                '    }',
                '  }',
                'timeout is in seconds. Cline\'s 60-second default cuts off long run_task calls.',
                'Next step:',
                '  ' + getInstallNextStep('cline'),
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
                '        - fsb-mcp-server@latest',
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
                '        "args": ["-y", "fsb-mcp-server@latest"]',
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
                '        "command": ["npx", "-y", "fsb-mcp-server@latest"]',
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
                '  Arguments: -y fsb-mcp-server@latest',
                '  Name: fsb',
                'Supported IDEs: IntelliJ, WebStorm, PyCharm, GoLand, Android Studio, etc.',
                'Next step:',
                '  ' + getInstallNextStep('jetbrains'),
            ],
        },
        {
            title: 'ChatGPT (Streamable HTTP)',
            lines: [
                '1. Start the server: npx -y fsb-mcp-server@latest serve',
                '2. In ChatGPT Settings > Connections > MCP, add:',
                '   ' + httpEndpoint,
                'Next step:',
                '  ' + getInstallNextStep('chatgpt'),
            ],
        },
        {
            title: 'Claude.ai (Streamable HTTP)',
            lines: [
                '1. Start the server: npx -y fsb-mcp-server@latest serve',
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
                'Add server with command: npx -y fsb-mcp-server@latest',
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
                '1. npx -y fsb-mcp-server@latest doctor',
                '2. npx -y fsb-mcp-server@latest status --watch',
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
function getMatchedPlatforms(flags) {
    const matched = [];
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
function getMatchedInstructionsPlatforms(flags) {
    const matched = [];
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
function printResult(result) {
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
function buildPlatformList() {
    const lines = [];
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
function printPlatformListDetailed() {
    console.log('FSB MCP Server ' + FSB_MCP_VERSION);
    console.log('');
    console.log('Supported platforms (' + Object.keys(PLATFORMS).length + ' total):');
    // Group by install mode
    const fileBasedPlatforms = [];
    const cliPlatforms = [];
    const instructionsPlatforms = [];
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
function printInstallUsage() {
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
    console.log('  --no-native-host    Write only the client config; skip FSB\'s local helper');
    console.log('  --extension-id <id> Extension ID the local helper allows (unpacked builds)');
}
/**
 * Print usage help for the uninstall subcommand when no platform flags are provided.
 */
function printUninstallUsage() {
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
function printDryRunPreview(target, entry) {
    console.log('[DRY RUN] ' + target.targetLabel);
    if (target.configPath) {
        console.log('  Config: ' + target.configPath);
    }
    // Wrap the single entry in the platform's root key structure for realistic preview
    const wrapper = {};
    const platform = target.platform;
    if (platform.mergeStrategy === 'named-array') {
        wrapper[platform.serverMapKey] = [{ name: FSB_SERVER_NAME, ...entry }];
    }
    else {
        wrapper[platform.serverMapKey] = { [FSB_SERVER_NAME]: entry };
    }
    const preview = serializeByFormat(wrapper, platform.format === 'jsonc' ? 'json' : platform.format);
    console.log('  Entry:');
    for (const line of preview.split('\n')) {
        if (line.trim())
            console.log('    ' + line);
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
function handleClaudeCodeInstall(dryRun) {
    const cmd = getClaudeCodeInstallCommand();
    if (dryRun) {
        console.log('[DRY RUN] Claude Code');
        console.log('  Command: ' + cmd);
        return { installed: false, skipped: false };
    }
    try {
        execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
        console.log('\u2713 Added to Claude Code');
        return { installed: true, skipped: false };
    }
    catch (err) {
        const execErr = err;
        if (execErr.stdout?.includes('already exists') || execErr.stderr?.includes('already exists')) {
            console.log('\u25CB Claude Code already configured');
            return { installed: false, skipped: true };
        }
        console.log('\u25CB Claude CLI not found \u2014 run manually: ' + getClaudeCodeInstallCommand());
        return { installed: false, skipped: false };
    }
}
function getTargetPlatform(target) {
    if (target.targetLabel === target.platform.displayName) {
        return target.platform;
    }
    return { ...target.platform, displayName: target.targetLabel };
}
/**
 * Install FSB into one or more platform config files.
 * Iterates matched platforms, resolves config paths, and calls installToConfig.
 * Platform-specific entry shapes are handled by getEntryForPlatform().
 * Every run that writes a client config, and a bare `install`, then sets up
 * or refreshes FSB's local helper once (skipped with --no-native-host).
 *
 * @param flags - Parsed CLI flags (platform keys mapped to boolean)
 */
export async function runInstall(flags, nativeHostOperations = unavailableNativeHostCliOperations) {
    if (nativeHostTargetRequested(flags)) {
        if (flags && typeof flags === 'object' && Object.hasOwn(flags, 'ensure')) {
            const ensureFlags = nativeEnsureFlags(flags);
            if (!ensureFlags) {
                rejectNativeUsage(NATIVE_HOST_INSTALL_USAGE);
                return;
            }
            await runNativeEnsure(ensureFlags.quiet, nativeHostOperations);
            return;
        }
        const request = nativeInstallRequest(flags);
        if (!request) {
            rejectNativeUsage(NATIVE_HOST_INSTALL_USAGE);
            return;
        }
        await runExplicitNativeInstall(request, nativeHostOperations);
        return;
    }
    // Handle --list before anything else
    if (flags['list'] === true) {
        printPlatformListDetailed();
        return;
    }
    // Capture --all before expansion (Pitfall 4)
    const isAll = flags['all'] === true;
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
        const ccResult = handleClaudeCodeInstall(flags['dry-run'] === true);
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
    const matched = getMatchedPlatforms(flags);
    if (matched.length === 0 && !flags['claude-code'] && instructionsPlatforms.length === 0) {
        // A bare install sets up the helper, then shows how to add a client. A
        // mistyped or retired client flag only shows the usage.
        if (Object.keys(flags).every((key) => BARE_INSTALL_FLAGS.has(key))) {
            await runInstallHelperStep(flags, nativeHostOperations);
            console.log('');
        }
        printInstallUsage();
        return;
    }
    for (const { key, platform } of matched) {
        const target = resolvePlatformTarget(key);
        if (target.configPath === null) {
            if (isAll) {
                console.log('\u25CB Skipped ' + target.targetLabel + ' (not installed)');
            }
            else {
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
        const result = await installToConfig(target.configPath, getTargetPlatform(target), FSB_SERVER_NAME, entry);
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
        const verb = flags['dry-run'] === true ? 'Would install to' : 'Installed to';
        console.log('');
        console.log(verb + ' ' + successCount + ' of ' + Object.keys(PLATFORMS).length + ' platforms');
    }
    // Runs that only print setup steps write no config, so they leave the helper alone.
    if (matched.length > 0 || flags['claude-code'] === true) {
        await runInstallHelperStep(flags, nativeHostOperations);
    }
}
/**
 * Uninstall FSB from one or more platform config files.
 * Claude Code uses CLI delegation via execSync (UNINST-05).
 * File-based platforms use removeFromConfig.
 * Instructions-only platforms print manual removal guidance.
 * Afterwards FSB's local helper is removed when nothing needs it any more.
 *
 * @param flags - Parsed CLI flags (platform keys mapped to boolean)
 */
export async function runUninstall(flags, nativeHostOperations = unavailableNativeHostCliOperations, uninstallChecks = productionUninstallChecks) {
    if (nativeHostTargetRequested(flags)) {
        const request = nativeUninstallRequest(flags);
        if (!request) {
            rejectNativeUsage(NATIVE_HOST_UNINSTALL_USAGE);
            return;
        }
        if (request.browser) {
            // One browser's registration; the helper's files go with the last one.
            try {
                printNativeUninstallResult(await nativeHostOperations.uninstall(request), request.browser);
            }
            catch {
                printNativeHostRefusal('unavailable', expectedNativeHostLocation());
            }
            return;
        }
        // Every registration and the helper's files, however they were installed.
        // The opt-out is written first, so no automatic refresh races the removal.
        try {
            nativeHostOperations.writeOptOut('uninstall-native-host');
        }
        catch {
            // A refresh never recreates a helper that is gone.
        }
        try {
            printNativeUninstallAllResult(await nativeHostOperations.uninstallAll(Object.freeze({})));
        }
        catch {
            printNativeHostRefusal('unavailable', expectedNativeHostRoot());
        }
        return;
    }
    // Capture --all before expansion (Pitfall 4)
    const isAll = flags['all'] === true;
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
        }
        else {
            try {
                execSync('claude mcp remove ' + FSB_SERVER_NAME, { stdio: 'pipe', encoding: 'utf-8' });
                console.log('\u2713 Removed FSB from Claude Code');
                totalCount++;
                successCount++;
            }
            catch {
                if (isAll) {
                    console.log('\u25CB Skipped Claude Code (CLI not found)');
                }
                else {
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
    const matched = getMatchedPlatforms(flags);
    if (matched.length === 0 && !flags['claude-code'] && instructionsPlatforms.length === 0) {
        printUninstallUsage();
        return;
    }
    for (const { key, platform } of matched) {
        const target = resolvePlatformTarget(key);
        if (target.configPath === null) {
            if (isAll) {
                console.log('\u25CB Skipped ' + target.targetLabel + ' (not installed)');
            }
            else {
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
        const result = await removeFromConfig(target.configPath, getTargetPlatform(target), FSB_SERVER_NAME);
        printResult(result);
        totalCount++;
        if (result.status === 'removed') {
            successCount++;
        }
    }
    if (isAll) {
        const verb = flags['dry-run'] === true ? 'Would remove from' : 'Removed from';
        console.log('');
        console.log(verb + ' ' + successCount + ' of ' + Object.keys(PLATFORMS).length + ' platforms');
    }
    if (matched.length > 0 || flags['claude-code'] === true) {
        await runUninstallHelperStep(flags, isAll, nativeHostOperations, uninstallChecks);
    }
}
//# sourceMappingURL=install.js.map