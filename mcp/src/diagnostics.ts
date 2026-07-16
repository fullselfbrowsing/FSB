import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { WebSocketBridge } from './bridge.js';
import { WebSocketBridge as Bridge } from './bridge.js';
import { readBridgeAuthState as readPrivateBridgeAuthState } from './bridge-auth.js';
import type { AdapterDetection } from './agent-providers/adapter.js';
import {
  ADAPTER_COMPATIBILITY_MATRIX,
  classifyAdapterCompatibility,
  getAdapterCompatibilityContract,
  type AdapterCompatibilityMatrix,
  type CompatibilityReason,
  type CompatibilityStatus,
} from './agent-providers/compatibility.js';
import {
  createProductionAdapterRegistry,
  type AgentProviderRegistry,
} from './agent-providers/registry.js';
import type { BridgeTopologyState } from './types.js';
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  FSB_EXTENSION_BRIDGE_URL,
  FSB_MCP_VERSION,
} from './version.js';

const CONTENT_SCRIPT_STALE_MS = 10_000;
const MAX_DOCTOR_ADAPTERS = 16;
const MAX_DOCTOR_FIELD_LENGTH = 64;
const MAX_DOCTOR_PATH_LENGTH = 4096;
const VERSION_FILES = {
  packageJson: new URL('../package.json', import.meta.url),
  serverJson: new URL('../server.json', import.meta.url),
};

export type BridgeDiagnosticLayer =
  | 'package'
  | 'config'
  | 'bridge'
  | 'extension'
  | 'content_script'
  | 'tool_routing'
  | 'healthy';

export type BridgeDiagnosticNote = {
  scope: 'package' | 'connect' | 'config' | 'tabs' | 'diagnostics';
  status: 'error';
  message: string;
  errorCode?: string | null;
};

export type BridgeActiveTabDiagnostics = {
  id: number | null;
  url: string;
  title: string;
  windowId: number | null;
  restricted: boolean;
  pageType: string;
};

export type ContentScriptDiagnostics = {
  ready: boolean;
  portConnected: boolean;
  lastHeartbeatAgeMs: number | null;
  lastReadyAt: number | null;
  lastReadyUrl: string | null;
  readinessSource: string | null;
};

export type AdapterDoctorRow = Readonly<{
  adapterId: string;
  displayLabel: string;
  binaryPath: string | null;
  detectedVersion: string | null;
  compatibilityStatus: CompatibilityStatus;
  compatibilityReason: CompatibilityReason;
  authState: 'unknown';
  profileVersion: string;
}>;

export type BridgeAuthDoctorMetadata = Readonly<{
  sharedSecretPresent: boolean;
  secretRotatedAt: number | null;
  secretRotationAgeMs: number | null;
}>;

export type BridgeDiagnostics = {
  checkedAt: string;
  bridgeUrl: string;
  bridgeMode: 'hub' | 'relay' | 'disconnected';
  extensionConnected: boolean;
  bridgeTopology: BridgeTopologyState;
  hubConnected: boolean;
  relayCount: number;
  activeHubInstanceId: string | null;
  lastExtensionHeartbeatAt: number | null;
  lastDisconnectReason: string | null;
  packageVersion: string | null;
  serverJsonVersion: string | null;
  versionParityOk: boolean;
  activeTab: BridgeActiveTabDiagnostics;
  contentScript: ContentScriptDiagnostics;
  compatibilityMatrix: AdapterCompatibilityMatrix;
  adapterDiagnostics: readonly AdapterDoctorRow[];
  bridgeAuthMetadata: BridgeAuthDoctorMetadata;
  bridgeClient?: Record<string, unknown> | null;
  extensionConfig?: Record<string, unknown> | null;
  tabsSummary?: { totalTabs: number; activeTabId: number | null };
  probeNotes?: BridgeDiagnosticNote[];
  diagnosticLayer: BridgeDiagnosticLayer;
  diagnosticWhy: string;
  nextAction: string;
  error?: string;
};

type DiagnosticsBridge = Pick<
  WebSocketBridge,
  'topology' | 'isConnected' | 'connect' | 'disconnect' | 'sendAndWait'
>;

export interface BridgeDiagnosticsDependencies {
  readonly bridgeFactory?: () => DiagnosticsBridge;
  readonly adapterRegistry?: AgentProviderRegistry;
  readonly readBridgeAuthState?: () => unknown;
  readonly now?: () => number;
}

export const DIAGNOSTIC_LAYER_LABELS: Record<BridgeDiagnosticLayer, string> = {
  package: 'Package / version parity',
  config: 'Configuration',
  bridge: 'Bridge ownership',
  extension: 'Extension attachment',
  content_script: 'Content script availability',
  tool_routing: 'Tool routing',
  healthy: 'Healthy',
};

type ProbeScope = Exclude<BridgeDiagnosticNote['scope'], 'package' | 'connect'>;

function ownDataRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;

  const record: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    record[key] = descriptor.value;
  }
  return record;
}

function denseStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  if (!Number.isSafeInteger(value.length) || value.length > MAX_DOCTOR_ADAPTERS) return null;

  const values: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    if (!boundedDoctorString(descriptor.value, MAX_DOCTOR_FIELD_LENGTH)) return null;
    values.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) return null;
  return new Set(values).size === values.length ? Object.freeze(values) : null;
}

function boundedDoctorString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function readOwnCallable(
  value: unknown,
  name: string,
): ((...args: unknown[]) => unknown) | null {
  const record = ownDataRecord(value);
  const candidate = record?.[name];
  return typeof candidate === 'function'
    ? candidate as (...args: unknown[]) => unknown
    : null;
}

function readNowMs(now: () => number): number {
  try {
    const value = now();
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function defaultDoctorAdapterRegistry(): AgentProviderRegistry {
  return createProductionAdapterRegistry({
    kill: async () => {
      throw new Error('Doctor registry has no process-termination authority');
    },
  });
}

function unavailableAdapterRow(
  adapterId: string,
  displayLabel: string,
  profileVersion: string,
): AdapterDoctorRow {
  const compatibility = classifyAdapterCompatibility(adapterId, {
    binaryFound: false,
    version: null,
  });
  return Object.freeze({
    adapterId,
    displayLabel,
    binaryPath: null,
    detectedVersion: null,
    compatibilityStatus: compatibility.status,
    compatibilityReason: compatibility.reason,
    authState: 'unknown',
    profileVersion,
  });
}

function normalizeAdapterDetection(
  value: unknown,
): { binaryPath: string | null; version: string | null; evidenceVersion: string | null } | null {
  const detection = ownDataRecord(value);
  if (!detection) return null;

  const binary = detection.binary === null ? null : ownDataRecord(detection.binary);
  const realPath = binary?.realPath;
  const binaryPath = boundedDoctorString(realPath, MAX_DOCTOR_PATH_LENGTH)
    && isAbsolute(realPath)
    ? realPath
    : null;
  const evidenceVersion = typeof detection.version === 'string' ? detection.version : null;
  const version = boundedDoctorString(evidenceVersion, MAX_DOCTOR_FIELD_LENGTH)
    ? evidenceVersion
    : null;

  return Object.freeze({ binaryPath, version, evidenceVersion });
}

async function collectAdapterDoctorRows(
  registry: AgentProviderRegistry,
): Promise<readonly AdapterDoctorRow[]> {
  const idsMethod = readOwnCallable(registry, 'ids');
  const requireMethod = readOwnCallable(registry, 'require');
  let registryIds: readonly string[] | null = null;
  if (idsMethod) {
    try {
      registryIds = denseStringArray(idsMethod.call(registry));
    } catch {
      registryIds = null;
    }
  }

  const rows: AdapterDoctorRow[] = [];
  if (!registryIds || !requireMethod) return Object.freeze(rows);
  for (const adapterId of registryIds) {
    const contract = getAdapterCompatibilityContract(adapterId);
    if (!contract) continue;

    let detection: AdapterDetection | null = null;
    try {
      const adapter = requireMethod.call(registry, adapterId);
      const detectMethod = readOwnCallable(adapter, 'detect');
      if (detectMethod) {
        detection = await detectMethod.call(adapter) as AdapterDetection;
      }
    } catch {
      detection = null;
    }

    const normalized = normalizeAdapterDetection(detection);
    if (!normalized) {
      rows.push(unavailableAdapterRow(
        contract.adapterId,
        contract.displayLabel,
        contract.profileVersion,
      ));
      continue;
    }

    const compatibility = classifyAdapterCompatibility(contract.adapterId, {
      binaryFound: normalized.binaryPath !== null,
      version: normalized.evidenceVersion,
    });
    rows.push(Object.freeze({
      adapterId: contract.adapterId,
      displayLabel: contract.displayLabel,
      binaryPath: normalized.binaryPath,
      detectedVersion: compatibility.reason === 'version_malformed'
        || compatibility.reason === 'version_missing'
        ? null
        : normalized.version,
      compatibilityStatus: compatibility.status,
      compatibilityReason: compatibility.reason,
      authState: 'unknown',
      profileVersion: contract.profileVersion,
    }));
  }
  return Object.freeze(rows);
}

function projectBridgeAuthMetadata(
  reader: () => unknown,
  nowMs: number,
): BridgeAuthDoctorMetadata {
  let auth: Readonly<Record<string, unknown>> | null = null;
  try {
    auth = ownDataRecord(reader());
  } catch {
    auth = null;
  }

  const sharedSecretPresent = boundedDoctorString(
    auth?.sessionSecret,
    MAX_DOCTOR_PATH_LENGTH,
  );
  const rotatedAt = auth?.rotatedAt;
  const validRotatedAt = typeof rotatedAt === 'number'
    && Number.isSafeInteger(rotatedAt)
    && rotatedAt >= 0
    && rotatedAt <= nowMs;
  return Object.freeze({
    sharedSecretPresent,
    secretRotatedAt: validRotatedAt ? rotatedAt : null,
    secretRotationAgeMs: validRotatedAt ? nowMs - rotatedAt : null,
  });
}

function emptyActiveTab(): BridgeActiveTabDiagnostics {
  return {
    id: null,
    url: '',
    title: '',
    windowId: null,
    restricted: true,
    pageType: 'No active tab',
  };
}

function emptyContentScript(): ContentScriptDiagnostics {
  return {
    ready: false,
    portConnected: false,
    lastHeartbeatAgeMs: null,
    lastReadyAt: null,
    lastReadyUrl: null,
    readinessSource: null,
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeActiveTab(value: unknown): BridgeActiveTabDiagnostics {
  const tab = toRecord(value);
  if (!tab) return emptyActiveTab();

  return {
    id: readFiniteNumber(tab.id),
    url: readString(tab.url) ?? '',
    title: readString(tab.title) ?? '',
    windowId: readFiniteNumber(tab.windowId),
    restricted: tab.restricted === true,
    pageType: readString(tab.pageType) ?? (tab.restricted === true ? 'Restricted page' : 'Web page'),
  };
}

function normalizeContentScript(value: unknown): ContentScriptDiagnostics {
  const diagnostics = toRecord(value);
  if (!diagnostics) return emptyContentScript();

  return {
    ready: diagnostics.ready === true,
    portConnected: diagnostics.portConnected === true,
    lastHeartbeatAgeMs: readFiniteNumber(diagnostics.lastHeartbeatAgeMs),
    lastReadyAt: readFiniteNumber(diagnostics.lastReadyAt),
    lastReadyUrl: readString(diagnostics.lastReadyUrl),
    readinessSource: readString(diagnostics.readinessSource),
  };
}

function normalizeConfig(value: unknown): Record<string, unknown> | null {
  const config = toRecord(value);
  if (!config) return null;

  const modelProvider = readString(config.modelProvider) ?? readString(config.selectedProvider);
  const modelName = readString(config.modelName)
    ?? readString(config.selectedModel)
    ?? readString(config.defaultModel);

  return {
    ...config,
    ...(modelProvider ? { modelProvider } : {}),
    ...(modelName ? { modelName } : {}),
  };
}

function hasConfiguredModel(config: Record<string, unknown> | null | undefined): boolean {
  if (!config) return false;
  return Boolean(readString(config.modelProvider) && readString(config.modelName));
}

function createProbeNote(
  scope: BridgeDiagnosticNote['scope'],
  message: string,
  errorCode: string | null = null,
): BridgeDiagnosticNote {
  return {
    scope,
    status: 'error',
    message,
    ...(errorCode ? { errorCode } : {}),
  };
}

function extractProbeFailure(
  scope: ProbeScope,
  response: Record<string, unknown>,
): BridgeDiagnosticNote | null {
  if (response.success === false || typeof response.error === 'string') {
    return createProbeNote(
      scope,
      readString(response.error) ?? `${scope} probe failed`,
      readString(response.errorCode),
    );
  }
  return null;
}

async function runBridgeProbe(
  bridge: DiagnosticsBridge,
  scope: ProbeScope,
  type: string,
  timeout: number,
): Promise<{ payload: Record<string, unknown> | null; note: BridgeDiagnosticNote | null }> {
  try {
    const payload = await bridge.sendAndWait(
      { type: type as never, payload: {} },
      { timeout },
    );
    return {
      payload,
      note: extractProbeFailure(scope, payload),
    };
  } catch (err) {
    return {
      payload: null,
      note: createProbeNote(
        scope,
        err instanceof Error ? err.message : String(err),
      ),
    };
  }
}

async function readVersionMetadata(): Promise<{
  packageVersion: string | null;
  serverJsonVersion: string | null;
  versionParityOk: boolean;
  notes: BridgeDiagnosticNote[];
}> {
  const notes: BridgeDiagnosticNote[] = [];
  let packageVersion: string | null = null;
  let serverJsonVersion: string | null = null;
  let serverJsonPackageVersion: string | null = null;

  try {
    const packageJson = JSON.parse(await readFile(VERSION_FILES.packageJson, 'utf8')) as Record<string, unknown>;
    packageVersion = readString(packageJson.version);
  } catch (err) {
    notes.push(createProbeNote('package', `Unable to read package.json version: ${err instanceof Error ? err.message : String(err)}`));
  }

  try {
    const serverJson = JSON.parse(await readFile(VERSION_FILES.serverJson, 'utf8')) as Record<string, unknown>;
    serverJsonVersion = readString(serverJson.version);
    const packages = Array.isArray(serverJson.packages) ? serverJson.packages : [];
    const firstPackage = toRecord(packages[0]);
    serverJsonPackageVersion = readString(firstPackage?.version);
  } catch (err) {
    notes.push(createProbeNote('package', `Unable to read server.json version: ${err instanceof Error ? err.message : String(err)}`));
  }

  const versions = [packageVersion, serverJsonVersion, serverJsonPackageVersion];
  const versionParityOk = versions.every((value) => value === FSB_MCP_VERSION);
  if (!versionParityOk) {
    notes.push(createProbeNote(
      'package',
      `Version mismatch: runtime=${FSB_MCP_VERSION}, package.json=${packageVersion ?? 'missing'}, server.json=${serverJsonVersion ?? 'missing'}, server package=${serverJsonPackageVersion ?? 'missing'}`,
    ));
  }

  return {
    packageVersion,
    serverJsonVersion,
    versionParityOk,
    notes,
  };
}

function withTopology(diagnostics: BridgeDiagnostics, topology: BridgeTopologyState): BridgeDiagnostics {
  return {
    ...diagnostics,
    bridgeMode: topology.mode,
    extensionConnected: topology.extensionConnected,
    bridgeTopology: topology,
    hubConnected: topology.hubConnected,
    relayCount: topology.relayCount,
    activeHubInstanceId: topology.activeHubInstanceId,
    lastExtensionHeartbeatAt: topology.lastExtensionHeartbeatAt,
    lastDisconnectReason: topology.lastDisconnectReason,
  };
}

function uniqueNotes(notes: BridgeDiagnosticNote[]): BridgeDiagnosticNote[] {
  const seen = new Set<string>();
  const output: BridgeDiagnosticNote[] = [];
  for (const note of notes) {
    const key = `${note.scope}|${note.errorCode ?? ''}|${note.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(note);
  }
  return output;
}

function isContentScriptStale(contentScript: ContentScriptDiagnostics): boolean {
  return contentScript.lastHeartbeatAgeMs !== null && contentScript.lastHeartbeatAgeMs > CONTENT_SCRIPT_STALE_MS;
}

function getGuidanceForLayer(
  layer: BridgeDiagnosticLayer,
  snapshot: BridgeDiagnostics,
): { why: string; nextAction: string } {
  const firstConfigNote = snapshot.probeNotes?.find((note) => note.scope === 'config');
  const firstDiagnosticsNote = snapshot.probeNotes?.find((note) => note.scope === 'diagnostics');

  switch (layer) {
    case 'package':
      return {
        why: `Local MCP version metadata does not agree on ${FSB_MCP_VERSION}.`,
        nextAction: 'Reinstall or rebuild fsb-mcp-server so package.json, server.json, and the runtime version all match.',
      };
    case 'config':
      return {
        why: firstConfigNote?.message ?? 'The extension is attached, but no model provider and model name are configured.',
        nextAction: 'Open the FSB extension settings, choose a provider and model, then rerun doctor.',
      };
    case 'bridge':
      return {
        why: snapshot.bridgeMode === 'relay'
          ? 'This process is in relay mode without an active hub connection.'
          : 'The local MCP bridge is disconnected.',
        nextAction: 'Keep one fsb-mcp-server instance running as the bridge owner, then rerun status --watch.',
      };
    case 'extension':
      return {
        why: 'The local bridge is healthy, but no browser extension is attached to it.',
        nextAction: 'Open Chrome, Edge, or Brave with the FSB extension enabled and wait for it to attach.',
      };
    case 'content_script':
      return {
        why: isContentScriptStale(snapshot.contentScript)
          ? `The active tab (${snapshot.activeTab.pageType}) has a stale content-script heartbeat.`
          : `The active tab (${snapshot.activeTab.pageType}) does not have a ready content script.`,
        nextAction: 'Refresh the page or navigate to a normal website tab, then rerun status --watch.',
      };
    case 'tool_routing':
      return {
        why: firstDiagnosticsNote?.message ?? 'A required MCP route is unavailable in the extension bridge.',
        nextAction: 'Update the extension and MCP server to matching builds so the expected MCP routes exist.',
      };
    case 'healthy':
    default:
      return {
        why: 'Bridge topology, extension attach, config, and content-script probes all look healthy.',
        nextAction: 'Retry the MCP command. If one tool still fails, use that tool error for the next recovery step.',
      };
  }
}

export function classifyDoctorLayer(snapshot: BridgeDiagnostics): BridgeDiagnosticLayer {
  if (!snapshot.versionParityOk) {
    return 'package';
  }

  if (snapshot.extensionConnected) {
    const configProbeFailed = snapshot.probeNotes?.some((note) => note.scope === 'config') ?? false;
    const configWasProbed = configProbeFailed || snapshot.extensionConfig !== undefined;
    if (configWasProbed && (configProbeFailed || !hasConfiguredModel(snapshot.extensionConfig))) {
      return 'config';
    }
  }

  if (snapshot.bridgeMode === 'disconnected' || (snapshot.bridgeMode === 'relay' && !snapshot.hubConnected)) {
    return 'bridge';
  }

  if (!snapshot.extensionConnected) {
    return 'extension';
  }

  const normalWebPage = Boolean(snapshot.activeTab.url) && snapshot.activeTab.restricted === false;
  if (
    normalWebPage
    && (snapshot.contentScript.ready === false || isContentScriptStale(snapshot.contentScript))
  ) {
    return 'content_script';
  }

  if (snapshot.probeNotes?.some((note) => note.errorCode === 'mcp_route_unavailable')) {
    return 'tool_routing';
  }

  return 'healthy';
}

export function applyDiagnosticClassification(snapshot: BridgeDiagnostics): BridgeDiagnostics {
  const diagnosticLayer = classifyDoctorLayer(snapshot);
  const guidance = getGuidanceForLayer(diagnosticLayer, snapshot);
  return {
    ...snapshot,
    diagnosticLayer,
    diagnosticWhy: guidance.why,
    nextAction: guidance.nextAction,
  };
}

export function formatDiagnosticLayerLabel(layer: BridgeDiagnosticLayer): string {
  return DIAGNOSTIC_LAYER_LABELS[layer];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForExtensionConnection(
  bridge: DiagnosticsBridge,
  timeoutMs: number,
  pollMs = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bridge.isConnected) return true;
    await sleep(pollMs);
  }
  return bridge.isConnected;
}

export async function collectBridgeDiagnostics(options: {
  waitForExtensionMs?: number;
  includeConfig?: boolean;
  includeTabs?: boolean;
} = {}, dependencies: BridgeDiagnosticsDependencies = {}): Promise<BridgeDiagnostics> {
  const dependencyRecord = ownDataRecord(dependencies);
  const bridgeFactory = typeof dependencyRecord?.bridgeFactory === 'function'
    ? dependencyRecord.bridgeFactory as () => DiagnosticsBridge
    : () => new Bridge();
  const adapterRegistry = dependencyRecord?.adapterRegistry as AgentProviderRegistry | undefined
    ?? defaultDoctorAdapterRegistry();
  const authReader = typeof dependencyRecord?.readBridgeAuthState === 'function'
    ? dependencyRecord.readBridgeAuthState as () => unknown
    : readPrivateBridgeAuthState;
  const now = typeof dependencyRecord?.now === 'function'
    ? dependencyRecord.now as () => number
    : Date.now;
  const nowMs = readNowMs(now);
  const checkedAt = new Date(nowMs).toISOString();
  const adapterDiagnostics = await collectAdapterDoctorRows(adapterRegistry);
  const bridgeAuthMetadata = projectBridgeAuthMetadata(authReader, nowMs);
  const bridge = bridgeFactory();
  const waitForExtensionMs = options.waitForExtensionMs ?? 1500;
  const versionMetadata = await readVersionMetadata();
  const notes = [...versionMetadata.notes];
  let diagnostics: BridgeDiagnostics = applyDiagnosticClassification({
    checkedAt,
    bridgeUrl: FSB_EXTENSION_BRIDGE_URL,
    bridgeMode: bridge.topology.mode,
    extensionConnected: bridge.topology.extensionConnected,
    bridgeTopology: bridge.topology,
    hubConnected: bridge.topology.hubConnected,
    relayCount: bridge.topology.relayCount,
    activeHubInstanceId: bridge.topology.activeHubInstanceId,
    lastExtensionHeartbeatAt: bridge.topology.lastExtensionHeartbeatAt,
    lastDisconnectReason: bridge.topology.lastDisconnectReason,
    packageVersion: versionMetadata.packageVersion,
    serverJsonVersion: versionMetadata.serverJsonVersion,
    versionParityOk: versionMetadata.versionParityOk,
    activeTab: emptyActiveTab(),
    contentScript: emptyContentScript(),
    compatibilityMatrix: ADAPTER_COMPATIBILITY_MATRIX,
    adapterDiagnostics,
    bridgeAuthMetadata,
    extensionConfig: undefined,
    bridgeClient: null,
    tabsSummary: undefined,
    probeNotes: versionMetadata.notes.length > 0 ? versionMetadata.notes : undefined,
    diagnosticLayer: 'healthy',
    diagnosticWhy: '',
    nextAction: '',
    error: versionMetadata.notes[0]?.message,
  });

  try {
    await bridge.connect();
    if (!bridge.isConnected && waitForExtensionMs > 0) {
      await waitForExtensionConnection(bridge, waitForExtensionMs);
    }

    diagnostics = withTopology(diagnostics, bridge.topology);

    if (bridge.isConnected && options.includeConfig) {
      const { payload, note } = await runBridgeProbe(bridge, 'config', 'mcp:get-config', 5_000);
      if (note) notes.push(note);
      diagnostics.extensionConfig = normalizeConfig(payload?.config ?? payload);
    }

    if (bridge.isConnected && options.includeTabs) {
      const { payload, note } = await runBridgeProbe(bridge, 'tabs', 'mcp:get-tabs', 5_000);
      if (note) notes.push(note);
      const tabList = Array.isArray(payload?.tabs)
        ? payload.tabs as Array<Record<string, unknown>>
        : [];
      const active = tabList.find((tab) => tab.active === true);
      diagnostics.tabsSummary = {
        totalTabs: tabList.length,
        activeTabId: typeof active?.id === 'number' ? active.id : null,
      };
    }

    if (bridge.isConnected) {
      const { payload, note } = await runBridgeProbe(bridge, 'diagnostics', 'mcp:get-diagnostics', 5_000);
      if (note) notes.push(note);
      diagnostics.activeTab = normalizeActiveTab(payload?.activeTab);
      diagnostics.contentScript = normalizeContentScript(payload?.contentScript);
      diagnostics.bridgeClient = toRecord(payload?.bridgeClient);
    }
  } catch (err) {
    notes.push(createProbeNote('connect', err instanceof Error ? err.message : String(err)));
    diagnostics = withTopology(diagnostics, bridge.topology);
  } finally {
    bridge.disconnect();
  }

  const probeNotes = uniqueNotes(notes);
  diagnostics = applyDiagnosticClassification({
    ...diagnostics,
    checkedAt,
    probeNotes: probeNotes.length > 0 ? probeNotes : undefined,
    error: probeNotes[0]?.message,
  });

  return diagnostics;
}

export function getLocalHttpEndpoint(host = DEFAULT_HTTP_HOST, port = DEFAULT_HTTP_PORT): string {
  return `http://${host}:${port}/mcp`;
}

export async function watchBridgeDiagnostics(options: {
  intervalMs?: number;
  waitForExtensionMs?: number;
  includeConfig?: boolean;
  includeTabs?: boolean;
  onUpdate: (diagnostics: BridgeDiagnostics) => void | Promise<void>;
}): Promise<void> {
  const intervalMs = Math.max(250, options.intervalMs ?? 1000);
  let stopped = false;

  const stop = (): void => {
    stopped = true;
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    while (!stopped) {
      const diagnostics = await collectBridgeDiagnostics({
        waitForExtensionMs: options.waitForExtensionMs,
        includeConfig: options.includeConfig,
        includeTabs: options.includeTabs,
      });
      await options.onUpdate(diagnostics);
      if (stopped) break;
      await sleep(intervalMs);
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
