import { fetchText, querySelectorAll, ToolError } from '@opentabs-dev/plugin-sdk';

const KNOWN_TOOLSCRIPT_HELPER_PATH = '/assets_vjs/toolscriptHelpers-CViOCr-a.js';
const KNOWN_MAIN_MODULE_PATH = '/assets_vjs/main-DNKK9RAp.js';
const KNOWN_SEND_SAVE_MODULE_PATH = '/assets_vjs/sendSave-CM0VM8H0.js';
const TOOLSCRIPT_HELPER_RE = /(?:\/assets_vjs\/|assets_vjs\/|\.\/)toolscriptHelpers-[A-Za-z0-9_-]+\.js/g;
const MAIN_MODULE_RE = /(?:\/assets_vjs\/|assets_vjs\/|\.\/)main-[A-Za-z0-9_-]+\.js/g;
const SEND_SAVE_MODULE_RE = /(?:\/assets_vjs\/|assets_vjs\/|\.\/)sendSave-[A-Za-z0-9_-]+\.js/g;
const ZIP_MIME_TYPE = 'application/zip';
const SEND_SAVE_TYPE_PREFIX = 'changesRecordV2/sendSave';

export const TOOLSCRIPT_IMPORT_WARNINGS = [
  'Retool compiles Toolscript archives in the browser before saving. Some editor-only server state can still require opening the app in the editor, touching the affected property, and saving.',
  'Known affected state includes some query bodies/run modes, resource type changes, top-level modal or drawer reconciliation, table pagination add-ons, and drawer width.',
];

interface ToolscriptContext {
  hasErrors?: boolean;
  formatErrors?: () => string;
}

interface ToolscriptArchiveOutput {
  appTemplate?: unknown;
}

interface DeserializeResult {
  output?: ToolscriptArchiveOutput;
  ctx?: ToolscriptContext;
}

interface ToolscriptHelpersModule {
  deserializeToolscriptArchive: (file: File) => Promise<DeserializeResult>;
  serializeToolscriptArchive: (input: {
    exportData: {
      uuid?: string;
      page: unknown;
      modules: Record<string, unknown>;
    };
    pageUuid: string;
    experiments: { perPagePositionJsonFiles: boolean };
  }) => Promise<Blob>;
}

interface TransitCodec {
  toJSON: (value: unknown) => string;
}

interface TransitModule {
  G: () => TransitCodec;
}

interface RetoolStore {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface SaveActionCreator {
  (metadata: { trigger: string; forceSave: boolean; waitForCompletion: boolean }): unknown;
  typePrefix?: string;
}

type ToolscriptImportActionCreator = (
  file: File,
  isMobileApp: boolean,
) => (dispatch: (action: unknown) => unknown) => unknown;

export interface CompiledToolscriptArchive {
  appState: string;
  isGlobalWidget: boolean;
  isMobileApp: boolean;
  multiScreenMobileApp: boolean;
  warnings: string[];
}

export interface EditorSaveResult {
  currentPageUuid: string;
  previousSaveId?: number;
  saveId: number;
}

export interface EditorToolscriptImportInput {
  base64Zip: string;
  fileName: string;
  pageUuid: string;
  isMobileApp: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasGetMethod = (value: unknown): value is { get: (key: string) => unknown } =>
  isRecord(value) && typeof value.get === 'function';

const readProperty = (value: unknown, key: string): unknown => {
  if (hasGetMethod(value)) return value.get(key);
  if (isRecord(value)) return value[key];
  return undefined;
};

const readStringProperty = (value: unknown, key: string): string | null => {
  const property = readProperty(value, key);
  return typeof property === 'string' ? property : null;
};

const readNumberProperty = (value: unknown, key: string): number | undefined => {
  const property = readProperty(value, key);
  return typeof property === 'number' ? property : undefined;
};

const readTemplateFlag = (template: unknown, key: string): boolean => {
  if (hasGetMethod(template)) return template.get(key) === true;
  if (isRecord(template)) return template[key] === true;
  return false;
};

const toAbsoluteAssetUrl = (assetSpecifier: string, baseUrl: string): string => {
  if (assetSpecifier.startsWith('./')) return new URL(assetSpecifier, baseUrl).href;
  if (assetSpecifier.startsWith('assets_vjs/')) return new URL(`/${assetSpecifier}`, location.origin).href;
  return new URL(assetSpecifier, location.origin).href;
};

const isSameOriginAssetScript = (url: string): boolean => {
  try {
    const parsed = new URL(url, location.href);
    return (
      parsed.origin === location.origin && parsed.pathname.startsWith('/assets_vjs/') && parsed.pathname.endsWith('.js')
    );
  } catch {
    return false;
  }
};

const getLoadedAssetScriptUrls = (): string[] => {
  const urls = new Set<string>();

  if (typeof performance !== 'undefined') {
    for (const entry of performance.getEntriesByType('resource')) {
      if (isSameOriginAssetScript(entry.name)) urls.add(new URL(entry.name, location.href).href);
    }
  }

  for (const script of querySelectorAll<HTMLScriptElement>('script[src]')) {
    if (isSameOriginAssetScript(script.src)) urls.add(new URL(script.src, location.href).href);
  }

  for (const link of querySelectorAll<HTMLLinkElement>('link[href]')) {
    if (isSameOriginAssetScript(link.href)) urls.add(new URL(link.href, location.href).href);
  }

  return [...urls];
};

const extractFirstAssetUrl = (sourceText: string, sourceUrl: string, pattern: RegExp): string | null => {
  for (const match of sourceText.matchAll(pattern)) {
    const specifier = match[0];
    if (specifier) return toAbsoluteAssetUrl(specifier, sourceUrl);
  }
  return null;
};

const fetchAssetText = async (url: string): Promise<string | null> => {
  try {
    return await fetchText(url);
  } catch {
    return null;
  }
};

const orderDiscoveryCandidates = (urls: string[]): string[] => {
  const priority = urls.filter(url => /\/(sendSave|AppContainer|ImportAppModal)-/.test(url));
  const rest = urls.filter(url => !priority.includes(url));
  return [...priority, ...rest];
};

const discoverToolscriptHelperUrl = async (): Promise<string> => {
  const loadedUrls = getLoadedAssetScriptUrls();
  const loadedHelperUrl = loadedUrls.find(url => /\/toolscriptHelpers-[A-Za-z0-9_-]+\.js$/.test(url));
  if (loadedHelperUrl) return loadedHelperUrl;

  for (const url of orderDiscoveryCandidates(loadedUrls)) {
    const sourceText = await fetchAssetText(url);
    if (!sourceText) continue;
    const discoveredUrl = extractFirstAssetUrl(sourceText, url, TOOLSCRIPT_HELPER_RE);
    if (discoveredUrl) return discoveredUrl;
  }

  return new URL(KNOWN_TOOLSCRIPT_HELPER_PATH, location.origin).href;
};

const discoverMainModuleUrl = async (helperUrl: string): Promise<string> => {
  const helperText = await fetchAssetText(helperUrl);
  if (helperText) {
    const discoveredUrl = extractFirstAssetUrl(helperText, helperUrl, MAIN_MODULE_RE);
    if (discoveredUrl) return discoveredUrl;
  }

  const loadedMainUrl = getLoadedAssetScriptUrls().find(url => /\/main-[A-Za-z0-9_-]+\.js$/.test(url));
  if (loadedMainUrl) return loadedMainUrl;

  return new URL(KNOWN_MAIN_MODULE_PATH, location.origin).href;
};

const discoverSendSaveModuleUrl = async (): Promise<string> => {
  const loadedUrls = getLoadedAssetScriptUrls();
  const loadedSendSaveUrl = loadedUrls.find(url => /\/sendSave-[A-Za-z0-9_-]+\.js$/.test(url));
  if (loadedSendSaveUrl) return loadedSendSaveUrl;

  for (const url of orderDiscoveryCandidates(loadedUrls)) {
    const sourceText = await fetchAssetText(url);
    if (!sourceText) continue;
    const discoveredUrl = extractFirstAssetUrl(sourceText, url, SEND_SAVE_MODULE_RE);
    if (discoveredUrl) return discoveredUrl;
  }

  return new URL(KNOWN_SEND_SAVE_MODULE_PATH, location.origin).href;
};

const loadToolscriptRuntime = async (): Promise<{
  helpers: ToolscriptHelpersModule;
  transit: TransitCodec;
}> => {
  const helperUrl = await discoverToolscriptHelperUrl();
  const helperModule = (await import(helperUrl)) as Partial<ToolscriptHelpersModule>;

  if (
    typeof helperModule.deserializeToolscriptArchive !== 'function' ||
    typeof helperModule.serializeToolscriptArchive !== 'function'
  ) {
    throw ToolError.internal('Retool Toolscript helper module did not expose the expected archive functions.');
  }

  const mainModuleUrl = await discoverMainModuleUrl(helperUrl);
  const mainModule = (await import(mainModuleUrl)) as Partial<TransitModule>;
  const transit = mainModule.G?.();

  if (!transit || typeof transit.toJSON !== 'function') {
    throw ToolError.internal('Retool Transit codec module did not expose the expected toJSON function.');
  }

  return {
    helpers: helperModule as ToolscriptHelpersModule,
    transit,
  };
};

const isRetoolStore = (value: unknown): value is RetoolStore =>
  isRecord(value) && typeof value.dispatch === 'function' && typeof value.getState === 'function';

const findRetoolStore = (mainModule: Record<string, unknown>): RetoolStore | null => {
  for (const value of Object.values(mainModule)) {
    if (isRetoolStore(value)) return value;
  }

  for (const value of Object.values(mainModule)) {
    if (!isRecord(value)) continue;
    const nestedStore = value.store;
    if (isRetoolStore(nestedStore)) return nestedStore;
  }

  return null;
};

const findSaveActionCreator = (saveModule: Record<string, unknown>): SaveActionCreator | null => {
  for (const value of Object.values(saveModule)) {
    if (typeof value === 'function' && (value as { typePrefix?: unknown }).typePrefix === SEND_SAVE_TYPE_PREFIX) {
      return value as SaveActionCreator;
    }
  }

  return null;
};

const findToolscriptImportActionCreator = (
  saveModule: Record<string, unknown>,
): ToolscriptImportActionCreator | null => {
  for (const value of Object.values(saveModule)) {
    if (typeof value !== 'function') continue;

    const source = Function.prototype.toString.call(value);
    if (
      source.includes('deserializeToolscriptArchive') &&
      source.includes('prepareAppStateForFrontend') &&
      source.includes('imported')
    ) {
      return value as ToolscriptImportActionCreator;
    }
  }

  return null;
};

const readCurrentPageUuid = (state: unknown): string | null => {
  const pages = readProperty(state, 'pages');
  return readStringProperty(pages, 'currentPageUuid') ?? readStringProperty(pages, 'pageUuid');
};

const readCurrentSaveId = (state: unknown): number | undefined => {
  const multiplayer = readProperty(state, 'multiplayer');
  return readNumberProperty(multiplayer, 'currentPageSaveId');
};

const extractSaveId = (action: unknown): number | null => {
  const payload = readProperty(action, 'payload');
  const innerPayload = readProperty(payload, 'payload');
  const innerSave = readProperty(innerPayload, 'save');
  const directSave = readProperty(payload, 'save');
  const rootSave = readProperty(action, 'save');

  return (
    readNumberProperty(innerSave, 'id') ??
    readNumberProperty(directSave, 'id') ??
    readNumberProperty(rootSave, 'id') ??
    null
  );
};

const readActionType = (action: unknown): string | null => readStringProperty(action, 'type');

export const getCurrentSourceControlBranchName = (): string | null => {
  const treeMatch = location.pathname.match(/(?:^|\/)tree\/([^/]+)\/(?:editor|apps)\//);
  if (!treeMatch?.[1]) return null;

  try {
    return decodeURIComponent(treeMatch[1]);
  } catch {
    return treeMatch[1];
  }
};

const readRejectedActionMessage = (action: unknown): string => {
  const error = readProperty(action, 'error');
  const errorMessage = readStringProperty(error, 'message');
  if (errorMessage) return errorMessage;

  const payload = readProperty(action, 'payload');
  const payloadPayload = readProperty(payload, 'payload');
  const nestedPayload = readProperty(payloadPayload, 'payload');

  return (
    readStringProperty(payload, 'message') ??
    readStringProperty(payloadPayload, 'message') ??
    readStringProperty(nestedPayload, 'message') ??
    'Retool rejected the editor save.'
  );
};

const readFailureActionMessage = (action: unknown): string | null => {
  const payload = readProperty(action, 'payload');
  const payloadType = readStringProperty(payload, 'type');
  if (payloadType?.startsWith('FAILURE_')) return readRejectedActionMessage(action);

  return null;
};

export const forceEditorSave = async (pageUuid: string, trigger: string): Promise<EditorSaveResult> => {
  const sendSaveUrl = await discoverSendSaveModuleUrl();
  const helperUrl = await discoverToolscriptHelperUrl();
  const mainModuleUrl = await discoverMainModuleUrl(helperUrl);

  const saveModule = (await import(sendSaveUrl)) as Record<string, unknown>;
  const mainModule = (await import(mainModuleUrl)) as Record<string, unknown>;
  const store = findRetoolStore(mainModule);
  if (!store) throw ToolError.internal('Retool editor store was not available in this tab.');

  const saveActionCreator = findSaveActionCreator(saveModule);
  if (!saveActionCreator) throw ToolError.internal('Retool editor save action was not available in this tab.');

  const beforeState = store.getState();
  const currentPageUuid = readCurrentPageUuid(beforeState);
  if (!currentPageUuid) {
    throw ToolError.validation('This tool must target an open Retool editor tab with a loaded app.');
  }

  if (currentPageUuid !== pageUuid) {
    throw ToolError.validation(
      `Targeted editor is loaded for page ${currentPageUuid}, not requested page ${pageUuid}.`,
    );
  }

  const previousSaveId = readCurrentSaveId(beforeState);
  const action = await Promise.resolve(
    store.dispatch(saveActionCreator({ trigger, forceSave: true, waitForCompletion: true })),
  );
  const actionType = readActionType(action);
  if (actionType?.endsWith('/rejected')) throw ToolError.internal(readRejectedActionMessage(action));
  const failureMessage = readFailureActionMessage(action);
  if (failureMessage) throw ToolError.internal(failureMessage);

  const saveId = extractSaveId(action);
  if (!saveId) throw ToolError.internal('Retool editor save completed without returning a save ID.');

  return {
    currentPageUuid,
    previousSaveId,
    saveId,
  };
};

export const importToolscriptArchiveThroughEditor = async (
  input: EditorToolscriptImportInput,
): Promise<EditorSaveResult> => {
  const sendSaveUrl = await discoverSendSaveModuleUrl();
  const helperUrl = await discoverToolscriptHelperUrl();
  const mainModuleUrl = await discoverMainModuleUrl(helperUrl);

  const saveModule = (await import(sendSaveUrl)) as Record<string, unknown>;
  const mainModule = (await import(mainModuleUrl)) as Record<string, unknown>;
  const store = findRetoolStore(mainModule);
  if (!store) throw ToolError.internal('Retool editor store was not available in this tab.');

  const importActionCreator = findToolscriptImportActionCreator(saveModule);
  if (!importActionCreator) throw ToolError.internal('Retool editor Toolscript import action was not available.');

  const beforeState = store.getState();
  const currentPageUuid = readCurrentPageUuid(beforeState);
  if (!currentPageUuid) {
    throw ToolError.validation('This tool must target an open Retool editor tab with a loaded app.');
  }

  if (currentPageUuid !== input.pageUuid) {
    throw ToolError.validation(
      `Targeted editor is loaded for page ${currentPageUuid}, not requested page ${input.pageUuid}.`,
    );
  }

  const previousSaveId = readCurrentSaveId(beforeState);
  let saveId: number | null = null;

  const dispatchAndCaptureSave = async (action: unknown): Promise<unknown> => {
    const result = await Promise.resolve(store.dispatch(action));
    const actionType = readActionType(result);
    if (actionType?.endsWith('/rejected')) throw ToolError.internal(readRejectedActionMessage(result));
    const failureMessage = readFailureActionMessage(result);
    if (failureMessage) throw ToolError.internal(failureMessage);

    const resultSaveId = extractSaveId(result);
    if (resultSaveId) saveId = resultSaveId;

    return result;
  };

  const file = base64ToZipFile(input.base64Zip, input.fileName);
  await Promise.resolve(importActionCreator(file, input.isMobileApp)(dispatchAndCaptureSave));

  const currentSaveId = saveId ?? readCurrentSaveId(store.getState());
  if (!currentSaveId || currentSaveId === previousSaveId) {
    return forceEditorSave(input.pageUuid, 'imported');
  }

  return {
    currentPageUuid,
    previousSaveId,
    saveId: currentSaveId,
  };
};

const normalizeBase64 = (base64: string): string => {
  const commaIndex = base64.indexOf(',');
  const rawBase64 = base64.startsWith('data:') && commaIndex >= 0 ? base64.slice(commaIndex + 1) : base64;
  return rawBase64.replace(/\s/g, '');
};

export const ensureZipFileName = (fileName: string): string => {
  const sanitized = fileName.trim().replace(/[\\/]/g, '_') || 'retool-app';
  return sanitized.toLowerCase().endsWith('.zip') ? sanitized : `${sanitized}.zip`;
};

export const base64ToZipFile = (base64: string, fileName: string): File => {
  let binary: string;
  try {
    binary = atob(normalizeBase64(base64));
  } catch {
    throw ToolError.validation('Invalid base64_zip value. Provide a raw base64-encoded ZIP archive or a data URL.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], ensureZipFileName(fileName), { type: ZIP_MIME_TYPE });
};

export const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = ensureZipFileName(fileName);
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const formatToolscriptErrors = (ctx: ToolscriptContext): string => {
  if (typeof ctx.formatErrors === 'function') return ctx.formatErrors();
  return 'Retool reported errors while deserializing the Toolscript archive.';
};

export const serializeToolscriptArchive = async (input: {
  pageUuid: string;
  exportData: { uuid?: string; page: unknown; modules?: Record<string, unknown> };
  perPagePositionJsonFiles: boolean;
}): Promise<Blob> => {
  const { helpers } = await loadToolscriptRuntime();
  return helpers.serializeToolscriptArchive({
    exportData: {
      uuid: input.exportData.uuid,
      page: input.exportData.page,
      modules: input.exportData.modules ?? {},
    },
    pageUuid: input.pageUuid,
    experiments: { perPagePositionJsonFiles: input.perPagePositionJsonFiles },
  });
};

export const compileToolscriptArchive = async (
  base64Zip: string,
  fileName: string,
): Promise<CompiledToolscriptArchive> => {
  const { helpers, transit } = await loadToolscriptRuntime();
  const file = base64ToZipFile(base64Zip, fileName);
  const { output, ctx } = await helpers.deserializeToolscriptArchive(file);

  if (ctx?.hasErrors) throw ToolError.validation(formatToolscriptErrors(ctx));
  if (!output?.appTemplate) throw ToolError.validation('Toolscript archive did not contain an app template.');

  return {
    appState: transit.toJSON(output.appTemplate),
    isGlobalWidget: readTemplateFlag(output.appTemplate, 'isGlobalWidget'),
    isMobileApp: readTemplateFlag(output.appTemplate, 'isMobileApp'),
    multiScreenMobileApp: readTemplateFlag(output.appTemplate, 'multiScreenMobileApp'),
    warnings: [...TOOLSCRIPT_IMPORT_WARNINGS],
  };
};
