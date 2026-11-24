import {
  NATIVE_HOST_DEFAULT_EXTENSION_ID,
  NATIVE_HOST_PACKAGE_NAME,
  isNativeHostExtensionId,
  nativeHostOrigin,
} from '../native-host/constants.js';
import type { NativeHostOwnerMarker } from '../native-host/runtime-layout.js';
import {
  createNativeHostManifest,
  inspectNativeHostRegistration,
  validateNativeHostMarker,
} from '../native-host-registration.js';
import { NATIVE_HOST_BROWSERS, isNativeHostBrowser } from './browser.js';
import type {
  NativeHostBrowser,
  NativeHostEnsureDependencies,
  NativeHostEnsureRequest,
  NativeHostEnsureResult,
  NativeHostEnsureStamp,
  NativeHostFileFact,
  NativeHostInstallPlatformAdapter,
  NativeHostInstallRequest,
  NativeHostInstallResult,
  NativeHostInstallRuntimeAdapter,
  NativeHostInstallTransactionDependencies,
  NativeHostLockLease,
  NativeHostOwnedState,
  NativeHostProvenance,
  NativeHostRegistrationReadFacts,
  NativeHostRuntimeOwnedInspection,
  NativeHostRuntimeReceipt,
  NativeHostUninstallAllRequest,
  NativeHostUninstallAllResult,
  NativeHostUninstallRequest,
  NativeHostUninstallTransactionDependencies,
  NativeHostUninstallResult,
} from './types.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SHA512_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const transactionTails = new Map<string, Promise<void>>();

function pathsEqual(platform: string, left: string, right: string): boolean {
  return platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function ordinaryRequest(value: unknown): NativeHostInstallRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(value);
  const allowedKeys = ['browser', 'extensionId'];
  if (keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key))) return null;
  if (keys.length > allowedKeys.length) return null;
  if (keys.length === 0) return Object.freeze({});
  const request: NativeHostInstallRequest = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    if (key === 'extensionId') {
      if (descriptor.value !== undefined && typeof descriptor.value !== 'string') return null;
      request.extensionId = descriptor.value as string | undefined;
    } else {
      if (
        descriptor.value !== undefined
        && !isNativeHostBrowser(descriptor.value)
      ) return null;
      request.browser = descriptor.value as NativeHostInstallRequest['browser'];
    }
  }
  return Object.freeze(request);
}

function dependencyLayoutsMatch(
  dependencies: NativeHostUninstallTransactionDependencies,
): boolean {
  const platform = dependencies?.platform?.layout;
  const runtime = dependencies?.runtime?.layout;
  return Boolean(
    platform
    && runtime
    && platform.platform === runtime.platform
    && pathsEqual(platform.platform, platform.stableRoot, runtime.stableRoot)
    && pathsEqual(platform.platform, platform.markerPath, runtime.markerPath)
    && pathsEqual(platform.platform, platform.launcherPath, runtime.launcherPath),
  );
}

async function serialized<T>(
  stableRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const predecessor = transactionTails.get(stableRoot) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = predecessor.then(() => gate);
  transactionTails.set(stableRoot, tail);
  await predecessor;
  try {
    return await operation();
  } finally {
    release();
    if (transactionTails.get(stableRoot) === tail) transactionTails.delete(stableRoot);
  }
}

function installResult(
  dependencies: NativeHostInstallTransactionDependencies,
  status: NativeHostInstallResult['status'],
  reason: string,
  origin: string | null,
  packageVersion: string | null,
): NativeHostInstallResult {
  return Object.freeze({
    status,
    reason,
    location: dependencies.platform.layout.manifestPath,
    origin,
    packageVersion,
  });
}

function uninstallResult(
  dependencies: NativeHostUninstallTransactionDependencies,
  status: NativeHostUninstallResult['status'],
  reason: string,
  origin: string | null,
  packageVersion: string | null,
): NativeHostUninstallResult {
  return Object.freeze({
    status,
    reason,
    location: dependencies.platform.layout.manifestPath,
    origin,
    packageVersion,
  });
}

function extensionIdFromOrigin(origin: unknown): string | null {
  if (
    typeof origin !== 'string'
    || !origin.startsWith('chrome-extension://')
    || !origin.endsWith('/')
  ) {
    return null;
  }
  const extensionId = origin.slice(19, -1);
  return isNativeHostExtensionId(extensionId)
    && nativeHostOrigin(extensionId) === origin
    ? extensionId
    : null;
}

function markersEqual(left: NativeHostOwnerMarker, right: NativeHostOwnerMarker): boolean {
  return left.schema === right.schema
    && left.owner === right.owner
    && left.host === right.host
    && left.origin === right.origin
    && left.platform === right.platform
    && left.packageVersion === right.packageVersion
    && left.launcherRelativePath === right.launcherRelativePath
    && left.artifactSha256 === right.artifactSha256
    && left.installToken === right.installToken;
}

function receiptsEqual(
  left: Readonly<NativeHostRuntimeReceipt>,
  right: Readonly<NativeHostRuntimeReceipt>,
): boolean {
  return left.schema === right.schema
    && left.platform === right.platform
    && left.packageName === right.packageName
    && left.packageVersion === right.packageVersion
    && left.stableRoot === right.stableRoot
    && left.launcherPath === right.launcherPath
    && left.packageRoot === right.packageRoot
    && left.markerPath === right.markerPath
    && left.origin === right.origin
    && left.installToken === right.installToken
    && left.tarballIntegrity === right.tarballIntegrity
    && left.artifactSha256 === right.artifactSha256
    && receiptProvenance(left) === receiptProvenance(right)
    && markersEqual(left.marker, right.marker);
}

function receiptProvenance(receipt: Readonly<NativeHostRuntimeReceipt>): NativeHostProvenance {
  return receipt.provenance === 'auto' ? 'auto' : 'explicit';
}

function exactRuntimeReceipt(
  inspection: NativeHostRuntimeOwnedInspection,
  dependencies: NativeHostUninstallTransactionDependencies,
  requireExactState = true,
): Readonly<NativeHostRuntimeReceipt> | null {
  if (
    (requireExactState && inspection.state !== 'exact')
    || !inspection.marker
    || !inspection.receipt
    || inspection.markerFact.status !== 'file'
  ) {
    return null;
  }
  const platformLayout = dependencies.platform.layout;
  const runtimeLayout = dependencies.runtime.layout;
  const receipt = inspection.receipt;
  const marker = validateNativeHostMarker(inspection.marker, {
    platform: platformLayout.platform,
    origin: inspection.marker.origin,
  });
  const receiptMarker = validateNativeHostMarker(receipt.marker, {
    platform: platformLayout.platform,
    origin: inspection.marker.origin,
  });
  if (
    !marker
    || !receiptMarker
    || !markersEqual(marker, receiptMarker)
    || inspection.markerFact.path !== platformLayout.markerPath
    || inspection.markerFact.realPath !== platformLayout.markerPath
    || receipt.schema !== 2
    || receipt.platform !== platformLayout.platform
    || receipt.packageName !== NATIVE_HOST_PACKAGE_NAME
    || receipt.packageVersion !== marker.packageVersion
    || receipt.origin !== marker.origin
    || receipt.installToken !== marker.installToken
    || receipt.artifactSha256 !== marker.artifactSha256
    || !SHA256_PATTERN.test(receipt.artifactSha256)
    || !SHA512_INTEGRITY_PATTERN.test(receipt.tarballIntegrity)
    || (platformLayout.platform === 'win32'
      ? !receipt.registryHelperPath
        || !receipt.registryHelperSha256
        || !SHA256_PATTERN.test(receipt.registryHelperSha256)
        || !pathsEqual(
          platformLayout.platform,
          receipt.registryHelperPath,
          runtimeLayout.registryHelperPath ?? '',
        )
      : receipt.registryHelperPath !== null || receipt.registryHelperSha256 !== null)
    || !pathsEqual(platformLayout.platform, receipt.stableRoot, platformLayout.stableRoot)
    || !pathsEqual(platformLayout.platform, receipt.launcherPath, platformLayout.launcherPath)
    || !pathsEqual(platformLayout.platform, receipt.markerPath, platformLayout.markerPath)
    || !pathsEqual(platformLayout.platform, receipt.packageRoot, runtimeLayout.packageRoot)
  ) {
    return null;
  }
  return receipt;
}

function ownershipReason(
  runtimeState: NativeHostOwnedState,
  registration: ReturnType<typeof inspectNativeHostRegistration>,
): string {
  if (registration.reason === 'registry-shadow') return 'registry-shadow';
  if (runtimeState === 'unavailable' || registration.state === 'unavailable') {
    return 'unavailable';
  }
  if (runtimeState === 'foreign' || registration.state === 'foreign') {
    return 'foreign-state';
  }
  if (runtimeState === 'invalid' || registration.state === 'invalid') {
    return 'invalid-state';
  }
  if (runtimeState === 'mismatched' || registration.state === 'mismatched') {
    return 'split-state';
  }
  if (runtimeState !== registration.state) return 'split-state';
  return 'ownership-mismatch';
}

async function inspectTransactionState(
  dependencies: NativeHostUninstallTransactionDependencies,
  extensionId: string,
): Promise<Readonly<{
  runtime: Readonly<NativeHostRuntimeOwnedInspection>;
  facts: NativeHostRegistrationReadFacts;
  registration: ReturnType<typeof inspectNativeHostRegistration>;
}> | null> {
  try {
    const runtime = await dependencies.runtime.inspectRuntime();
    const facts = await dependencies.platform.readRegistrationFacts();
    const registration = inspectNativeHostRegistration({
      layout: dependencies.platform.layout,
      extensionId,
      manifest: facts.manifest,
      marker: runtime.markerFact,
      registry32: facts.registry32,
      registry64: facts.registry64,
    });
    return Object.freeze({ runtime, facts, registration });
  } catch {
    return null;
  }
}

function registrationSurfaceAbsent(
  dependencies: NativeHostInstallTransactionDependencies,
  facts: NativeHostRegistrationReadFacts,
): boolean {
  if (facts.manifest.status !== 'absent') return false;
  if (dependencies.platform.layout.registration.kind !== 'registry') return true;
  return facts.registry32?.status === 'absent'
    && facts.registry64?.status === 'absent';
}

async function rollbackRuntime(
  dependencies: NativeHostInstallTransactionDependencies,
  receipt: Readonly<NativeHostRuntimeReceipt>,
): Promise<void> {
  try {
    await dependencies.runtime.removeExactRuntime(receipt);
  } catch {
    // A failed rollback never expands deletion authority beyond the exact receipt.
  }
}

async function removeFailedExactRegistration(
  dependencies: NativeHostInstallTransactionDependencies,
  receipt: Readonly<NativeHostRuntimeReceipt>,
): Promise<void> {
  const extensionId = extensionIdFromOrigin(receipt.origin);
  if (!extensionId) return;
  try {
    const facts = await dependencies.platform.readRegistrationFacts();
    const markerFact = Object.freeze({
      status: 'file' as const,
      path: dependencies.platform.layout.markerPath,
      realPath: dependencies.platform.layout.markerPath,
      contents: JSON.stringify(receipt.marker),
    });
    const inspection = inspectNativeHostRegistration({
      layout: dependencies.platform.layout,
      extensionId,
      manifest: facts.manifest,
      marker: markerFact,
      registry32: facts.registry32,
      registry64: facts.registry64,
    });
    if (inspection.state === 'exact') {
      await dependencies.platform.removeCanonicalRegistration();
    }
  } catch {
    // A changed or unreadable registration is never deleted during rollback.
  }
}

export async function installNativeHost(
  requestValue: NativeHostInstallRequest,
  dependencies: NativeHostInstallTransactionDependencies,
): Promise<NativeHostInstallResult> {
  const request = ordinaryRequest(requestValue);
  const extensionId = request?.extensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
  const browser = request?.browser ?? 'chrome';
  if (
    !request
    || !isNativeHostExtensionId(extensionId)
    || browser !== dependencies.platform.layout.browser
    || !dependencyLayoutsMatch(dependencies)
    || dependencies.runtime.layout.extensionId !== extensionId
  ) {
    return installResult(
      dependencies,
      'refused',
      'invalid-request',
      null,
      null,
    );
  }
  return serialized(
    dependencies.platform.layout.stableRoot,
    () => installTransaction(extensionId, dependencies),
  );
}

async function installTransaction(
  extensionId: string,
  dependencies: NativeHostInstallTransactionDependencies,
): Promise<NativeHostInstallResult> {
  const expectedOrigin = nativeHostOrigin(extensionId);
  const initial = await inspectTransactionState(dependencies, extensionId);
  if (!initial) {
    return installResult(dependencies, 'refused', 'unavailable', expectedOrigin, null);
  }
  if (initial.runtime.state === 'exact' && initial.registration.state === 'exact') {
    const receipt = exactRuntimeReceipt(initial.runtime, dependencies);
    if (
      !receipt
      || !initial.registration.marker
      || !markersEqual(receipt.marker, initial.registration.marker)
      || receipt.origin !== expectedOrigin
    ) {
      return installResult(
        dependencies,
        'refused',
        'ownership-mismatch',
        expectedOrigin,
        receipt?.packageVersion ?? null,
      );
    }
    if (receipt.packageVersion !== dependencies.runtime.layout.packageVersion) {
      return installResult(
        dependencies,
        'refused',
        'version-mismatch',
        receipt.origin,
        receipt.packageVersion,
      );
    }
    return installResult(
      dependencies,
      'already-installed',
      'exact',
      receipt.origin,
      receipt.packageVersion,
    );
  }
  if (initial.runtime.state !== 'absent' || initial.registration.state !== 'absent') {
    return installResult(
      dependencies,
      'refused',
      ownershipReason(initial.runtime.state, initial.registration),
      expectedOrigin,
      initial.runtime.receipt?.packageVersion ?? null,
    );
  }

  let publication;
  try {
    publication = await dependencies.runtime.publishRuntime();
  } catch {
    return installResult(
      dependencies,
      'refused',
      'publication-failed',
      expectedOrigin,
      null,
    );
  }
  if (publication.status !== 'published') {
    return installResult(
      dependencies,
      'refused',
      publication.reason,
      expectedOrigin,
      null,
    );
  }
  const receipt = publication.receipt;
  if (
    receipt.origin !== expectedOrigin
    || receipt.packageVersion !== dependencies.runtime.layout.packageVersion
    || !pathsEqual(
      dependencies.platform.layout.platform,
      receipt.stableRoot,
      dependencies.platform.layout.stableRoot,
    )
  ) {
    await rollbackRuntime(dependencies, receipt);
    return installResult(
      dependencies,
      'refused',
      'ownership-mismatch',
      expectedOrigin,
      null,
    );
  }

  let boundaryExact = false;
  let registrationFacts: NativeHostRegistrationReadFacts | null = null;
  try {
    boundaryExact = await dependencies.runtime.recheckPublicationBoundary(receipt);
    registrationFacts = await dependencies.platform.readRegistrationFacts();
  } catch {
    boundaryExact = false;
  }
  if (
    !boundaryExact
    || !registrationFacts
    || !registrationSurfaceAbsent(dependencies, registrationFacts)
  ) {
    await rollbackRuntime(dependencies, receipt);
    return installResult(
      dependencies,
      'refused',
      'boundary-changed',
      expectedOrigin,
      null,
    );
  }

  const manifest = createNativeHostManifest({
    platform: dependencies.platform.layout.platform,
    launcherPath: dependencies.platform.layout.launcherPath,
    extensionId,
  });
  try {
    await dependencies.platform.publishRegistration(`${JSON.stringify(manifest)}\n`);
  } catch {
    await removeFailedExactRegistration(dependencies, receipt);
    await rollbackRuntime(dependencies, receipt);
    return installResult(
      dependencies,
      'refused',
      'registration-publish-failed',
      expectedOrigin,
      null,
    );
  }
  return installResult(
    dependencies,
    'installed',
    'installed',
    receipt.origin,
    receipt.packageVersion,
  );
}

export async function uninstallNativeHost(
  dependencies: NativeHostUninstallTransactionDependencies,
): Promise<NativeHostUninstallResult> {
  if (!dependencyLayoutsMatch(dependencies)) {
    return uninstallResult(dependencies, 'refused', 'invalid-request', null, null);
  }
  return serialized(dependencies.platform.layout.stableRoot, async () => {
    let runtimeInspection: Readonly<NativeHostRuntimeOwnedInspection>;
    try {
      runtimeInspection = await dependencies.runtime.inspectRuntime();
    } catch {
      return uninstallResult(dependencies, 'refused', 'unavailable', null, null);
    }
    const installedExtensionId = runtimeInspection.marker
      ? extensionIdFromOrigin(runtimeInspection.marker.origin)
      : null;
    const extensionId = installedExtensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
    let facts: NativeHostRegistrationReadFacts;
    try {
      facts = await dependencies.platform.readRegistrationFacts();
    } catch {
      return uninstallResult(dependencies, 'refused', 'unavailable', null, null);
    }
    const registration = inspectNativeHostRegistration({
      layout: dependencies.platform.layout,
      extensionId,
      manifest: facts.manifest,
      marker: runtimeInspection.markerFact,
      registry32: facts.registry32,
      registry64: facts.registry64,
    });
    if (runtimeInspection.state === 'absent' && registration.state === 'absent') {
      return uninstallResult(dependencies, 'not-installed', 'absent', null, null);
    }
    if (runtimeInspection.state !== 'exact' || registration.state !== 'exact') {
      return uninstallResult(
        dependencies,
        'refused',
        ownershipReason(runtimeInspection.state, registration),
        runtimeInspection.marker?.origin ?? null,
        runtimeInspection.marker?.packageVersion ?? null,
      );
    }
    const receipt = exactRuntimeReceipt(runtimeInspection, dependencies);
    if (
      !receipt
      || !installedExtensionId
      || !registration.marker
      || !markersEqual(receipt.marker, registration.marker)
    ) {
      return uninstallResult(
        dependencies,
        'refused',
        'ownership-mismatch',
        runtimeInspection.marker?.origin ?? null,
        runtimeInspection.marker?.packageVersion ?? null,
      );
    }

    if (dependencies.platform.layout.registration.kind === 'registry') {
      let keyFact;
      try {
        keyFact = await dependencies.platform.inspectCanonicalKey();
      } catch {
        keyFact = Object.freeze({ status: 'unavailable' as const });
      }
      if (keyFact.status !== 'exact-default-only') {
        return uninstallResult(
          dependencies,
          'refused',
          'registry-key-not-exact',
          receipt.origin,
          receipt.packageVersion,
        );
      }
    }

    let boundaryExact = false;
    try {
      boundaryExact = await dependencies.runtime.recheckExactRuntime(receipt);
    } catch {
      boundaryExact = false;
    }
    if (!boundaryExact) {
      return uninstallResult(
        dependencies,
        'refused',
        'boundary-changed',
        receipt.origin,
        receipt.packageVersion,
      );
    }

    const rechecked = await inspectTransactionState(dependencies, installedExtensionId);
    if (
      !rechecked
      || rechecked.runtime.state !== 'exact'
      || rechecked.registration.state !== 'exact'
      || !rechecked.runtime.receipt
      || !receiptsEqual(rechecked.runtime.receipt, receipt)
      || !rechecked.registration.marker
      || !markersEqual(receipt.marker, rechecked.registration.marker)
    ) {
      return uninstallResult(
        dependencies,
        'refused',
        'boundary-changed',
        receipt.origin,
        receipt.packageVersion,
      );
    }

    try {
      await dependencies.platform.removeCanonicalRegistration();
    } catch {
      return uninstallResult(
        dependencies,
        'refused',
        'registration-remove-failed',
        receipt.origin,
        receipt.packageVersion,
      );
    }
    if (dependencies.platform.layout.registration.kind === 'registry') {
      let keyFact;
      try {
        keyFact = await dependencies.platform.inspectCanonicalKey();
      } catch {
        keyFact = Object.freeze({ status: 'unavailable' as const });
      }
      if (keyFact.status !== 'empty') {
        return uninstallResult(
          dependencies,
          'refused',
          'registry-key-cleanup-failed',
          receipt.origin,
          receipt.packageVersion,
        );
      }
      try {
        await dependencies.platform.deleteCanonicalKeyIfEmpty();
      } catch {
        return uninstallResult(
          dependencies,
          'refused',
          'registry-key-cleanup-failed',
          receipt.origin,
          receipt.packageVersion,
        );
      }
    }
    try {
      await dependencies.runtime.removeExactRuntime(receipt);
    } catch {
      return uninstallResult(
        dependencies,
        'refused',
        'runtime-remove-failed',
        receipt.origin,
        receipt.packageVersion,
      );
    }
    return uninstallResult(
      dependencies,
      'removed',
      'removed',
      receipt.origin,
      receipt.packageVersion,
    );
  });
}

// ---------------------------------------------------------------------------
// Keeping an installed helper current, one browser at a time.
//
// Every transaction below runs inside the in-process queue (`serialized`) and
// a cross-process lock owned by `dependencies.state`. The lock token doubles
// as the install token, so each directory a transaction creates beside the
// stable root (`.stage-`, `.next-`, `.retired-`, `.quarantine-`) carries the
// holder's token. Anything left with another token was abandoned by a holder
// that is gone, and the next holder finishes or discards it.
// ---------------------------------------------------------------------------

// The first package version whose serve daemon watches for a stop request.
// Older daemons are stopped with a terminate signal after their command line
// has been confirmed.
export const NATIVE_HOST_STOP_REQUEST_MIN_VERSION = '0.12.0';

const STAMP_BACKOFF_BASE_MS = 60_000;
const STAMP_BACKOFF_MAX_MS = 24 * 60 * 60_000;
// A stage directory from a holder this process never saw may belong to an
// older installer that takes no lock; such a publish finishes well within
// this window.
const UNOWNED_STAGE_STALE_MS = 10 * 60_000;
const VERSION_PARTS_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;

/**
 * Semver order of two package versions: negative when `left` is older, zero
 * when equal, positive when newer, and null when either does not parse.
 */
export function compareNativeHostVersions(left: string, right: string): number | null {
  const a = VERSION_PARTS_PATTERN.exec(String(left));
  const b = VERSION_PARTS_PATTERN.exec(String(right));
  if (!a || !b) return null;
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (!Number.isSafeInteger(difference)) return null;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  const leftPre = a[4] ? a[4].split('.') : [];
  const rightPre = b[4] ? b[4].split('.') : [];
  if (leftPre.length === 0 || rightPre.length === 0) {
    if (leftPre.length === rightPre.length) return 0;
    return leftPre.length === 0 ? 1 : -1;
  }
  for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index += 1) {
    const l = leftPre[index];
    const r = rightPre[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNumeric = /^\d+$/u.test(l);
    const rNumeric = /^\d+$/u.test(r);
    if (lNumeric && rNumeric) {
      if (Number(l) !== Number(r)) return Number(l) < Number(r) ? -1 : 1;
    } else if (lNumeric !== rNumeric) {
      return lNumeric ? -1 : 1;
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

type ParsedEnsureRequest = Readonly<{
  mode: 'install' | 'refresh-only';
  browsers: 'auto' | readonly NativeHostBrowser[];
  extensionId: string | null;
  provenance: NativeHostProvenance;
}>;

function plainOwnValues(
  value: unknown,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedKeys.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    fields[key] = descriptor.value;
  }
  return fields;
}

function parseEnsureRequest(value: unknown): ParsedEnsureRequest | null {
  const fields = plainOwnValues(value, ['mode', 'browsers', 'extensionId', 'provenance']);
  if (!fields) return null;
  if (fields.mode !== 'install' && fields.mode !== 'refresh-only') return null;
  if (fields.provenance !== 'auto' && fields.provenance !== 'explicit') return null;
  let browsers: ParsedEnsureRequest['browsers'] = 'auto';
  if (fields.browsers !== undefined && fields.browsers !== 'auto') {
    if (
      !Array.isArray(fields.browsers)
      || fields.browsers.length === 0
      || fields.browsers.length > NATIVE_HOST_BROWSERS.length
      || fields.browsers.some((browser) => !isNativeHostBrowser(browser))
      || new Set(fields.browsers).size !== fields.browsers.length
    ) {
      return null;
    }
    browsers = Object.freeze([...fields.browsers] as NativeHostBrowser[]);
  }
  let extensionId: string | null = null;
  if (fields.extensionId !== undefined) {
    if (typeof fields.extensionId !== 'string' || !isNativeHostExtensionId(fields.extensionId)) {
      return null;
    }
    extensionId = fields.extensionId;
  }
  return Object.freeze({
    mode: fields.mode,
    browsers,
    extensionId,
    provenance: fields.provenance,
  });
}

function ensureDependenciesMatch(dependencies: NativeHostEnsureDependencies): boolean {
  const runtimeLayout = dependencies?.runtime?.layout;
  if (
    !runtimeLayout
    || !dependencies.registrations
    || !dependencies.state
    || !dependencies.daemon
    || !dependencies.timing
    || runtimeLayout.platform !== dependencies.platform
    || !pathsEqual(dependencies.platform, runtimeLayout.stableRoot, dependencies.stableRoot)
  ) {
    return false;
  }
  return NATIVE_HOST_BROWSERS.every((browser) => {
    const adapter = dependencies.registrations[browser];
    return Boolean(adapter?.layout)
      && adapter.layout.browser === browser
      && dependencyLayoutsMatch({ platform: adapter, runtime: dependencies.runtime });
  });
}

type EnsureResultFields = Readonly<{
  reason?: string;
  version?: string | null;
  browsers?: readonly NativeHostBrowser[];
  addedBrowsers?: readonly NativeHostBrowser[];
}>;

function ensureResult(
  dependencies: Pick<NativeHostEnsureDependencies, 'stableRoot'>,
  outcome: NativeHostEnsureResult['outcome'],
  fields: EnsureResultFields = {},
): NativeHostEnsureResult {
  return Object.freeze({
    outcome,
    ...(fields.reason ? { reason: fields.reason } : {}),
    ...(fields.version ? { version: fields.version } : {}),
    browsers: [...(fields.browsers ?? [])],
    addedBrowsers: [...(fields.addedBrowsers ?? [])],
    stableRoot: dependencies?.stableRoot ?? '',
  });
}

type SurfaceState = 'absent' | 'exact' | 'other' | 'unavailable';

type BrowserSurface = Readonly<{
  browser: NativeHostBrowser;
  adapter: NativeHostInstallPlatformAdapter;
  state: SurfaceState;
  reason: string;
}>;

// The per-browser part of a registration. On Windows the manifest inside the
// stable root is shared by every browser, so only the browser's own registry
// values decide whether that browser is registered.
function browserSurfaceAbsent(
  adapter: NativeHostInstallPlatformAdapter,
  facts: NativeHostRegistrationReadFacts,
): boolean {
  if (adapter.layout.registration.kind === 'registry') {
    return facts.registry32?.status === 'absent' && facts.registry64?.status === 'absent';
  }
  return facts.manifest.status === 'absent';
}

function browserSurfaceUnavailable(
  adapter: NativeHostInstallPlatformAdapter,
  facts: NativeHostRegistrationReadFacts,
): boolean {
  if (!facts?.manifest || facts.manifest.status === 'unavailable') return true;
  if (adapter.layout.registration.kind !== 'registry') return false;
  return !facts.registry32
    || !facts.registry64
    || facts.registry32.status === 'unavailable'
    || facts.registry64.status === 'unavailable';
}

async function readBrowserSurface(
  adapter: NativeHostInstallPlatformAdapter,
  markerFact: NativeHostFileFact,
  extensionId: string,
): Promise<BrowserSurface> {
  const facts = await adapter.readRegistrationFacts();
  const base = { browser: adapter.layout.browser, adapter };
  if (browserSurfaceUnavailable(adapter, facts)) {
    return Object.freeze({ ...base, state: 'unavailable', reason: 'unavailable' });
  }
  if (browserSurfaceAbsent(adapter, facts)) {
    return Object.freeze({ ...base, state: 'absent', reason: 'absent' });
  }
  const inspection = inspectNativeHostRegistration({
    layout: adapter.layout,
    extensionId,
    manifest: facts.manifest,
    marker: markerFact,
    registry32: facts.registry32,
    registry64: facts.registry64,
  });
  return Object.freeze({
    ...base,
    state: inspection.state === 'exact' ? 'exact' : 'other',
    reason: inspection.state === 'exact' ? 'exact' : `${inspection.state}:${inspection.reason}`,
  });
}

async function readBrowserSurfaces(
  dependencies: NativeHostEnsureDependencies,
  markerFact: NativeHostFileFact,
  extensionId: string,
): Promise<readonly BrowserSurface[] | null> {
  try {
    const surfaces: BrowserSurface[] = [];
    for (const browser of NATIVE_HOST_BROWSERS) {
      surfaces.push(await readBrowserSurface(
        dependencies.registrations[browser],
        markerFact,
        extensionId,
      ));
    }
    return Object.freeze(surfaces);
  } catch {
    return null;
  }
}

function surfaceFor(
  surfaces: readonly BrowserSurface[],
  browser: NativeHostBrowser,
): BrowserSurface {
  return surfaces.find((surface) => surface.browser === browser) as BrowserSurface;
}

function browsersIn(
  surfaces: readonly BrowserSurface[],
  state: SurfaceState,
): NativeHostBrowser[] {
  return surfaces.filter((surface) => surface.state === state).map((surface) => surface.browser);
}

function surfacesOwnershipReason(
  runtimeState: NativeHostOwnedState,
  surfaces: readonly BrowserSurface[],
): string {
  const others = surfaces.filter((surface) => surface.state !== 'absent' && surface.state !== 'exact');
  if (others.some((surface) => surface.reason.endsWith(':registry-shadow'))) return 'registry-shadow';
  if (runtimeState === 'unavailable' || others.some((surface) => surface.state === 'unavailable')) {
    return 'unavailable';
  }
  if (runtimeState === 'foreign' || others.some((surface) => surface.reason.startsWith('foreign:'))) {
    return 'foreign-state';
  }
  if (runtimeState === 'invalid' || others.some((surface) => surface.reason.startsWith('invalid:'))) {
    return 'invalid-state';
  }
  return 'split-state';
}

function ensurePair(
  dependencies: NativeHostEnsureDependencies,
  browser: NativeHostBrowser = 'chrome',
): NativeHostUninstallTransactionDependencies {
  return Object.freeze({
    platform: dependencies.registrations[browser],
    runtime: dependencies.runtime,
  });
}

function manifestContents(
  dependencies: NativeHostEnsureDependencies,
  extensionId: string,
): string {
  return `${JSON.stringify(createNativeHostManifest({
    platform: dependencies.platform,
    launcherPath: dependencies.runtime.layout.launcherPath,
    extensionId,
  }))}\n`;
}

function sortedBrowsers(browsers: Iterable<NativeHostBrowser>): NativeHostBrowser[] {
  const set = new Set(browsers);
  return NATIVE_HOST_BROWSERS.filter((browser) => set.has(browser));
}

async function targetBrowsers(
  request: ParsedEnsureRequest,
  dependencies: NativeHostEnsureDependencies,
  extensionId: string,
  registered: readonly NativeHostBrowser[],
): Promise<NativeHostBrowser[]> {
  if (request.browsers !== 'auto') return sortedBrowsers(request.browsers);
  let detected: NativeHostBrowser[] = [];
  try {
    detected = sortedBrowsers(
      [...await dependencies.detectBrowsers(extensionId)].filter((browser) => (
        isNativeHostBrowser(browser)
      )),
    );
  } catch {
    detected = [];
  }
  // Chrome is the fallback only for a helper with no registration yet; an
  // installed helper is never spread to a browser where the extension is not.
  if (detected.length === 0 && registered.length === 0) return ['chrome'];
  return detected;
}

type EnsurePlan =
  | Readonly<{ kind: 'final'; result: NativeHostEnsureResult }>
  | Readonly<{
    kind: 'install';
    extensionId: string;
    targets: readonly NativeHostBrowser[];
  }>
  | Readonly<{
    kind: 'update' | 'quarantine';
    receipt: Readonly<NativeHostRuntimeReceipt>;
    extensionId: string;
    registered: readonly NativeHostBrowser[];
    additions: readonly NativeHostBrowser[];
    targets: readonly NativeHostBrowser[];
    refresh: 'version' | 'node' | 'integrity' | null;
    promote: boolean;
  }>;

function finalPlan(result: NativeHostEnsureResult): EnsurePlan {
  return Object.freeze({ kind: 'final', result });
}

async function planEnsure(
  request: ParsedEnsureRequest,
  dependencies: NativeHostEnsureDependencies,
): Promise<EnsurePlan> {
  let runtime: Readonly<NativeHostRuntimeOwnedInspection>;
  try {
    runtime = await dependencies.runtime.inspectRuntime();
  } catch {
    return finalPlan(ensureResult(dependencies, 'unavailable', { reason: 'unavailable' }));
  }
  const markerExtensionId = runtime.marker ? extensionIdFromOrigin(runtime.marker.origin) : null;
  const installedVersion = runtime.marker?.packageVersion ?? null;
  if (request.extensionId && markerExtensionId && request.extensionId !== markerExtensionId) {
    return finalPlan(ensureResult(dependencies, 'refused', {
      reason: 'ownership-mismatch',
      version: installedVersion,
    }));
  }
  const extensionId = markerExtensionId
    ?? request.extensionId
    ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
  const surfaces = await readBrowserSurfaces(dependencies, runtime.markerFact, extensionId);
  if (!surfaces) {
    return finalPlan(ensureResult(dependencies, 'unavailable', { reason: 'unavailable' }));
  }
  const registered = browsersIn(surfaces, 'exact');
  if (surfaces.some((surface) => surface.state === 'unavailable')) {
    return finalPlan(ensureResult(dependencies, 'unavailable', {
      reason: 'unavailable',
      version: installedVersion,
      browsers: registered,
    }));
  }

  if (runtime.state === 'absent') {
    if (surfaces.every((surface) => surface.state === 'absent')) {
      if (request.mode === 'refresh-only') {
        return finalPlan(ensureResult(dependencies, 'skipped-absent', { reason: 'absent' }));
      }
      return Object.freeze({
        kind: 'install',
        extensionId,
        targets: await targetBrowsers(request, dependencies, extensionId, []),
      });
    }
    return finalPlan(ensureResult(dependencies, 'refused', {
      reason: surfacesOwnershipReason(runtime.state, surfaces),
    }));
  }

  const integrityFailure = runtime.state === 'invalid' && runtime.reason === 'launcher-integrity';
  if (runtime.state !== 'exact' && !integrityFailure) {
    return finalPlan(ensureResult(dependencies, 'refused', {
      reason: surfacesOwnershipReason(runtime.state, surfaces),
      version: installedVersion,
      browsers: registered,
    }));
  }
  const receipt = exactRuntimeReceipt(runtime, ensurePair(dependencies), !integrityFailure);
  if (!receipt || !markerExtensionId) {
    return finalPlan(ensureResult(dependencies, 'refused', {
      reason: integrityFailure ? 'invalid-state' : 'ownership-mismatch',
      version: installedVersion,
      browsers: registered,
    }));
  }
  const order = compareNativeHostVersions(receipt.packageVersion, dependencies.packageVersion);
  if (order === null) {
    return finalPlan(ensureResult(dependencies, 'refused', {
      reason: 'invalid-state',
      version: receipt.packageVersion,
      browsers: registered,
    }));
  }
  const targets = await targetBrowsers(request, dependencies, extensionId, registered);
  const additions = targets.filter((browser) => surfaceFor(surfaces, browser).state === 'absent');

  if (integrityFailure) {
    // Only a tree whose marker and receipt agree, and whose launcher alone
    // fails its hash, is rebuilt; a newer install is never replaced by an
    // older one, and an unregistered tree is left for repair by hand.
    if (order > 0 || registered.length === 0) {
      return finalPlan(ensureResult(dependencies, 'refused', {
        reason: 'invalid-state',
        version: receipt.packageVersion,
        browsers: registered,
      }));
    }
    return Object.freeze({
      kind: 'quarantine',
      receipt,
      extensionId,
      registered,
      additions,
      targets,
      refresh: 'integrity',
      promote: false,
    });
  }

  let refresh: 'version' | 'node' | null = null;
  if (order < 0) {
    refresh = 'version';
  } else if (order === 0) {
    let nodePresent = true;
    try {
      nodePresent = await dependencies.pinnedNodePresent();
    } catch {
      nodePresent = true;
    }
    if (!nodePresent) refresh = 'node';
  }
  const promote = request.provenance === 'explicit' && receiptProvenance(receipt) === 'auto';
  if (registered.length === 0 && additions.length === 0) {
    return finalPlan(ensureResult(dependencies, 'refused', {
      reason: surfacesOwnershipReason(runtime.state, surfaces),
      version: receipt.packageVersion,
    }));
  }
  if (!refresh && additions.length === 0 && !promote) {
    return finalPlan(ensureResult(dependencies, 'current', {
      ...(order > 0 ? { reason: 'installed-newer' } : {}),
      version: receipt.packageVersion,
      browsers: registered,
    }));
  }
  return Object.freeze({
    kind: 'update',
    receipt,
    extensionId,
    registered,
    additions,
    targets,
    refresh,
    promote,
  });
}

function planPublishes(plan: EnsurePlan): boolean {
  return plan.kind === 'install' || ((plan.kind === 'update' || plan.kind === 'quarantine') && plan.refresh !== null);
}

type StampKey = Readonly<{
  packageVersion: string;
  nodePath: string;
  browsers: readonly NativeHostBrowser[];
}>;

function stampKey(
  dependencies: NativeHostEnsureDependencies,
  plan: EnsurePlan,
): StampKey {
  const browsers = plan.kind === 'install'
    ? plan.targets
    : plan.kind === 'final'
      ? []
      : [...plan.registered, ...plan.targets];
  return Object.freeze({
    packageVersion: dependencies.packageVersion,
    nodePath: dependencies.nodePath,
    browsers: sortedBrowsers(browsers),
  });
}

function stampMatches(stamp: NativeHostEnsureStamp | null, key: StampKey): stamp is NativeHostEnsureStamp {
  return Boolean(stamp)
    && stamp?.packageVersion === key.packageVersion
    && stamp.nodePath === key.nodePath
    && Array.isArray(stamp.browsers)
    && stamp.browsers.join(',') === key.browsers.join(',');
}

async function readStamp(
  dependencies: NativeHostEnsureDependencies,
): Promise<NativeHostEnsureStamp | null> {
  try {
    return await dependencies.state.readStamp();
  } catch {
    return null;
  }
}

async function recordStamp(
  dependencies: NativeHostEnsureDependencies,
  key: StampKey,
  succeeded: boolean,
): Promise<void> {
  const now = dependencies.now();
  let failures = 0;
  let nextAttemptAt = 0;
  if (!succeeded) {
    const previous = await readStamp(dependencies);
    failures = stampMatches(previous, key) ? Math.min(previous.failures + 1, 32) : 1;
    nextAttemptAt = now + Math.min(
      STAMP_BACKOFF_MAX_MS,
      STAMP_BACKOFF_BASE_MS * 2 ** (failures - 1),
    );
  }
  try {
    await dependencies.state.writeStamp(Object.freeze({
      version: 1,
      packageVersion: key.packageVersion,
      nodePath: key.nodePath,
      browsers: [...key.browsers],
      at: now,
      failures,
      nextAttemptAt,
    }));
  } catch {
    // The stamp only paces retries; failing to write it never fails the run.
  }
}

async function acquireLease(
  dependencies: NativeHostEnsureDependencies,
  waitMs: number,
): Promise<NativeHostLockLease | null> {
  try {
    const lease = await dependencies.state.acquireLock(waitMs);
    if (!lease || !/^[a-f0-9]{32}$/u.test(lease.token)) {
      if (lease) await lease.release().catch(() => undefined);
      return null;
    }
    return lease;
  } catch {
    return null;
  }
}

async function releaseLease(lease: NativeHostLockLease): Promise<void> {
  try {
    await lease.release();
  } catch {
    // A lock that cannot be released ages out through its heartbeat.
  }
}

/**
 * Finishes or discards what a dead holder left beside the stable root. When
 * the stable root itself is missing, a holder died between its two renames:
 * a finished `.next-` with its `.retired-` partner completes the swap, and a
 * lone `.retired-` or `.quarantine-` is put back so the next run can
 * re-inspect it. Leftovers are deleted only once a stable root exists again.
 */
async function recoverSiblings(
  dependencies: NativeHostEnsureDependencies,
  lease: NativeHostLockLease,
): Promise<void> {
  let siblings;
  let stablePresent;
  try {
    siblings = await dependencies.state.listSiblings();
    stablePresent = await dependencies.state.stableRootPresent();
  } catch {
    return;
  }
  const abandoned = siblings.filter((sibling) => sibling.token !== lease.token);
  if (!stablePresent) {
    const tokens = [...new Set(abandoned
      .filter((sibling) => sibling.kind === 'retired' || sibling.kind === 'quarantine')
      .map((sibling) => sibling.token))].sort();
    for (const token of tokens) {
      const has = (kind: string) => abandoned.some((sibling) => (
        sibling.token === token && sibling.kind === kind
      ));
      try {
        if (has('retired') && has('next')) {
          await dependencies.state.moveSiblingToStable('next', token);
        } else if (has('retired')) {
          await dependencies.state.moveSiblingToStable('retired', token);
        } else {
          await dependencies.state.moveSiblingToStable('quarantine', token);
        }
        stablePresent = true;
        break;
      } catch {
        // Try the next candidate; nothing is deleted while the root is missing.
      }
    }
    try {
      siblings = await dependencies.state.listSiblings();
    } catch {
      return;
    }
  }
  for (const sibling of siblings) {
    if (sibling.token === lease.token) continue;
    if (
      sibling.kind === 'stage'
      && !lease.staleTokens.includes(sibling.token)
      && sibling.ageMs < UNOWNED_STAGE_STALE_MS
    ) {
      continue;
    }
    if (
      !stablePresent
      && (sibling.kind === 'next' || sibling.kind === 'retired' || sibling.kind === 'quarantine')
    ) {
      continue;
    }
    try {
      await dependencies.state.removeSibling(sibling.kind, sibling.token);
    } catch {
      // Left for the next holder.
    }
  }
}

type StepFailure = Readonly<{
  ok: false;
  outcome: 'deferred' | 'refused' | 'unavailable';
  reason: string;
  backoff: boolean;
}>;

function stepFailure(
  outcome: StepFailure['outcome'],
  reason: string,
  backoff: boolean,
): StepFailure {
  return Object.freeze({ ok: false, outcome, reason, backoff });
}

async function waitForOffline(dependencies: NativeHostEnsureDependencies): Promise<boolean> {
  try {
    return await dependencies.daemon.waitForOffline(dependencies.timing.offlineTimeoutMs);
  } catch {
    return false;
  }
}

/**
 * Asks a serve daemon started from the stable root to stop, so its files can
 * be moved. The request file is left in place for the caller to remove once
 * the stable root has been replaced or removed.
 */
async function stopStableRootDaemon(
  dependencies: NativeHostEnsureDependencies,
  token: string,
  reason: 'refresh' | 'uninstall',
  runningVersion: string,
): Promise<Readonly<{ ok: true }> | StepFailure> {
  const ok = Object.freeze({ ok: true as const });
  try {
    await dependencies.state.writeStopRequest(token, reason);
  } catch {
    return stepFailure('deferred', 'stop-request-failed', true);
  }
  let online = true;
  try {
    online = await dependencies.daemon.isOnline();
  } catch {
    online = true;
  }
  if (!online) return ok;
  let listener;
  try {
    listener = await dependencies.daemon.identifyListener();
  } catch {
    listener = Object.freeze({ status: 'unknown' as const });
  }
  if (listener.status === 'none' || listener.status === 'other') return ok;
  if (listener.status === 'unknown') {
    return await waitForOffline(dependencies)
      ? ok
      : stepFailure('deferred', 'daemon-unidentified', true);
  }
  const stopAware = compareNativeHostVersions(runningVersion, NATIVE_HOST_STOP_REQUEST_MIN_VERSION);
  if (stopAware !== null && stopAware >= 0) {
    return await waitForOffline(dependencies)
      ? ok
      : stepFailure('deferred', 'daemon-busy', true);
  }
  // An older daemon never reads the request; its terminate handler runs the
  // same graceful shutdown.
  let terminated = false;
  try {
    terminated = await dependencies.daemon.terminate(listener.pid);
  } catch {
    terminated = false;
  }
  if (!terminated) return stepFailure('deferred', 'daemon-busy', true);
  return await waitForOffline(dependencies)
    ? ok
    : stepFailure('deferred', 'daemon-busy', true);
}

async function removeStopRequest(
  dependencies: NativeHostEnsureDependencies,
  token: string,
): Promise<void> {
  try {
    await dependencies.state.removeStopRequest(token);
  } catch {
    // A stale request is ignored by daemons started after it was written.
  }
}

async function removeSiblingQuietly(
  dependencies: NativeHostEnsureDependencies,
  kind: 'next' | 'retired' | 'quarantine',
  token: string,
): Promise<void> {
  try {
    await dependencies.state.removeSibling(kind, token);
  } catch {
    // The next holder deletes what is left.
  }
}

async function createPublisher(
  dependencies: NativeHostEnsureDependencies,
  options: Parameters<NativeHostEnsureDependencies['createPublisher']>[0],
): Promise<NativeHostInstallRuntimeAdapter | null> {
  try {
    const publisher = await dependencies.createPublisher(options);
    if (
      !publisher?.layout
      || !pathsEqual(dependencies.platform, publisher.layout.stableRoot, dependencies.stableRoot)
      || publisher.layout.extensionId !== options.extensionId
      || publisher.layout.installToken !== options.installToken
      || publisher.layout.packageVersion !== dependencies.packageVersion
    ) {
      return null;
    }
    return publisher;
  } catch {
    return null;
  }
}

function publicationMatches(
  dependencies: NativeHostEnsureDependencies,
  receipt: Readonly<NativeHostRuntimeReceipt>,
  extensionId: string,
): boolean {
  return receipt.origin === nativeHostOrigin(extensionId)
    && receipt.packageVersion === dependencies.packageVersion
    && pathsEqual(dependencies.platform, receipt.stableRoot, dependencies.stableRoot);
}

/** True when the stable root holds exactly `receipt` and every listed browser still points at it. */
async function verifyStableRoot(
  dependencies: NativeHostEnsureDependencies,
  receipt: Readonly<NativeHostRuntimeReceipt>,
  extensionId: string,
  browsers: readonly NativeHostBrowser[],
): Promise<boolean> {
  try {
    const inspected = await dependencies.runtime.inspectRuntime();
    if (
      inspected.state !== 'exact'
      || !inspected.receipt
      || !receiptsEqual(inspected.receipt, receipt)
      || !exactRuntimeReceipt(inspected, ensurePair(dependencies))
    ) {
      return false;
    }
    for (const browser of browsers) {
      const surface = await readBrowserSurface(
        dependencies.registrations[browser],
        inspected.markerFact,
        extensionId,
      );
      if (surface.state !== 'exact') return false;
    }
    return true;
  } catch {
    return false;
  }
}

type RefreshContext = Readonly<{
  lease: NativeHostLockLease;
  receipt: Readonly<NativeHostRuntimeReceipt>;
  extensionId: string;
  registered: readonly NativeHostBrowser[];
  provenance: NativeHostProvenance;
}>;

/**
 * Replaces an exact, older (or interpreter-orphaned) runtime: publish beside
 * it, stop its daemon, swap with two renames, re-verify, then delete the
 * retired tree. Any failure before the swap leaves the old runtime serving;
 * a failed re-verification swaps the old runtime back.
 */
async function refreshRuntime(
  dependencies: NativeHostEnsureDependencies,
  context: RefreshContext,
): Promise<Readonly<{ ok: true; receipt: Readonly<NativeHostRuntimeReceipt> }> | StepFailure> {
  const { lease, extensionId } = context;
  const token = lease.token;
  const publisher = await createPublisher(dependencies, {
    extensionId,
    installToken: token,
    provenance: context.provenance,
    destination: 'next',
    windowsManifest: dependencies.platform === 'win32'
      ? manifestContents(dependencies, extensionId)
      : null,
  });
  if (!publisher) return stepFailure('refused', 'unavailable', true);
  let publication;
  try {
    publication = await publisher.publishRuntime();
  } catch {
    return stepFailure('refused', 'publication-failed', true);
  }
  if (publication.status !== 'published') {
    return stepFailure('refused', publication.reason, true);
  }
  const next = publication.receipt;
  if (!publicationMatches(dependencies, next, extensionId) || lease.lost()) {
    await removeSiblingQuietly(dependencies, 'next', token);
    return stepFailure(lease.lost() ? 'deferred' : 'refused', lease.lost() ? 'lock-lost' : 'ownership-mismatch', !lease.lost());
  }

  const stopped = await stopStableRootDaemon(
    dependencies,
    token,
    'refresh',
    context.receipt.packageVersion,
  );
  const abandon = async (failure: StepFailure): Promise<StepFailure> => {
    await removeSiblingQuietly(dependencies, 'next', token);
    await removeStopRequest(dependencies, token);
    return failure;
  };
  if (!stopped.ok) return abandon(stopped);

  let unchanged = false;
  try {
    unchanged = !lease.lost() && await dependencies.runtime.recheckExactRuntime(context.receipt);
  } catch {
    unchanged = false;
  }
  if (!unchanged) return abandon(stepFailure('refused', 'boundary-changed', false));

  try {
    await dependencies.state.moveStableToSibling('retired', token);
  } catch {
    return abandon(stepFailure('deferred', 'swap-failed', true));
  }
  try {
    await dependencies.state.moveSiblingToStable('next', token);
  } catch {
    try {
      await dependencies.state.moveSiblingToStable('retired', token);
    } catch {
      // Recovery under the next lock restores or completes the swap.
    }
    return abandon(stepFailure('deferred', 'swap-failed', true));
  }

  if (!await verifyStableRoot(dependencies, next, extensionId, context.registered)) {
    try {
      await dependencies.state.moveStableToSibling('next', token);
      await dependencies.state.moveSiblingToStable('retired', token);
    } catch {
      // Recovery under the next lock restores or completes the swap.
    }
    return abandon(stepFailure('refused', 'boundary-changed', false));
  }
  await removeSiblingQuietly(dependencies, 'retired', token);
  await removeStopRequest(dependencies, token);
  return Object.freeze({ ok: true, receipt: next });
}

/**
 * Rebuilds a runtime whose launcher alone fails its hash. The suspect tree is
 * moved aside first so its launcher can no longer be started, then a fresh
 * runtime is published into the empty stable root with the same extension id
 * and provenance. A failed publish puts the suspect tree back untouched.
 */
async function rebuildQuarantinedRuntime(
  dependencies: NativeHostEnsureDependencies,
  context: RefreshContext,
): Promise<Readonly<{ ok: true; receipt: Readonly<NativeHostRuntimeReceipt> }> | StepFailure> {
  const { lease, extensionId } = context;
  const token = lease.token;
  const publisher = await createPublisher(dependencies, {
    extensionId,
    installToken: token,
    provenance: context.provenance,
    destination: 'stable',
    windowsManifest: dependencies.platform === 'win32'
      ? manifestContents(dependencies, extensionId)
      : null,
  });
  if (!publisher) return stepFailure('refused', 'unavailable', true);

  const stopped = await stopStableRootDaemon(
    dependencies,
    token,
    'refresh',
    context.receipt.packageVersion,
  );
  if (!stopped.ok) {
    await removeStopRequest(dependencies, token);
    return stopped;
  }
  let unchanged = false;
  try {
    const current = await dependencies.runtime.inspectRuntime();
    unchanged = !lease.lost()
      && current.state === 'invalid'
      && current.reason === 'launcher-integrity'
      && Boolean(current.receipt)
      && receiptsEqual(current.receipt as Readonly<NativeHostRuntimeReceipt>, context.receipt);
  } catch {
    unchanged = false;
  }
  if (!unchanged) {
    await removeStopRequest(dependencies, token);
    return stepFailure('refused', 'boundary-changed', false);
  }
  try {
    await dependencies.state.moveStableToSibling('quarantine', token);
  } catch {
    await removeStopRequest(dependencies, token);
    return stepFailure('deferred', 'swap-failed', true);
  }
  const restore = async (failure: StepFailure): Promise<StepFailure> => {
    try {
      if (await dependencies.state.stableRootPresent()) {
        await dependencies.state.moveStableToSibling('next', token);
      }
      await dependencies.state.moveSiblingToStable('quarantine', token);
      await removeSiblingQuietly(dependencies, 'next', token);
    } catch {
      // Recovery under the next lock puts the quarantined tree back.
    }
    await removeStopRequest(dependencies, token);
    return failure;
  };
  let publication;
  try {
    publication = await publisher.publishRuntime();
  } catch {
    return restore(stepFailure('refused', 'publication-failed', true));
  }
  if (publication.status !== 'published') {
    return restore(stepFailure('refused', publication.reason, true));
  }
  const rebuilt = publication.receipt;
  if (
    !publicationMatches(dependencies, rebuilt, extensionId)
    || !await verifyStableRoot(dependencies, rebuilt, extensionId, context.registered)
  ) {
    return restore(stepFailure('refused', 'boundary-changed', false));
  }
  await removeSiblingQuietly(dependencies, 'quarantine', token);
  await removeStopRequest(dependencies, token);
  return Object.freeze({ ok: true, receipt: rebuilt });
}

type RegistrationStep = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>;

/**
 * Registers one more browser for the exact runtime already in place, using
 * the extension id its marker records. Requires the browser's own surface to
 * be absent; nothing that exists is overwritten.
 */
async function addRegistrationLocked(
  dependencies: NativeHostEnsureDependencies,
  browser: NativeHostBrowser,
  extensionId: string,
): Promise<RegistrationStep> {
  const adapter = dependencies.registrations[browser];
  let runtime;
  try {
    runtime = await dependencies.runtime.inspectRuntime();
  } catch {
    return Object.freeze({ ok: false, reason: 'unavailable' });
  }
  const receipt = runtime.state === 'exact'
    ? exactRuntimeReceipt(runtime, ensurePair(dependencies, browser))
    : null;
  if (!receipt || extensionIdFromOrigin(receipt.origin) !== extensionId) {
    return Object.freeze({ ok: false, reason: 'ownership-mismatch' });
  }
  let before;
  try {
    before = await readBrowserSurface(adapter, runtime.markerFact, extensionId);
  } catch {
    return Object.freeze({ ok: false, reason: 'unavailable' });
  }
  if (before.state === 'exact') return Object.freeze({ ok: true });
  if (before.state !== 'absent') {
    return Object.freeze({ ok: false, reason: before.state === 'unavailable' ? 'unavailable' : 'split-state' });
  }
  try {
    await adapter.publishBrowserRegistration(manifestContents(dependencies, extensionId));
  } catch {
    return Object.freeze({ ok: false, reason: 'registration-publish-failed' });
  }
  try {
    const after = await readBrowserSurface(adapter, runtime.markerFact, extensionId);
    if (after.state === 'exact') return Object.freeze({ ok: true });
  } catch {
    // Reported below.
  }
  return Object.freeze({ ok: false, reason: 'boundary-changed' });
}

/**
 * Removes one browser's exact registration, rechecking it first. On Windows
 * only the browser's registry value and its emptied key go; the manifest
 * inside the stable root stays for the other browsers and leaves with it.
 */
async function removeRegistrationLocked(
  dependencies: NativeHostEnsureDependencies,
  browser: NativeHostBrowser,
  markerFact: NativeHostFileFact,
  extensionId: string,
): Promise<RegistrationStep> {
  const adapter = dependencies.registrations[browser];
  const fail = (reason: string): RegistrationStep => Object.freeze({ ok: false, reason });
  const registry = adapter.layout.registration.kind === 'registry';
  if (registry) {
    let keyFact;
    try {
      keyFact = await adapter.inspectCanonicalKey();
    } catch {
      keyFact = Object.freeze({ status: 'unavailable' as const });
    }
    if (keyFact.status !== 'exact-default-only') return fail('registry-key-not-exact');
  }
  try {
    const current = await readBrowserSurface(adapter, markerFact, extensionId);
    if (current.state !== 'exact') return fail('boundary-changed');
  } catch {
    return fail('boundary-changed');
  }
  try {
    await adapter.removeCanonicalRegistration();
  } catch {
    return fail('registration-remove-failed');
  }
  if (registry) {
    let keyFact;
    try {
      keyFact = await adapter.inspectCanonicalKey();
    } catch {
      keyFact = Object.freeze({ status: 'unavailable' as const });
    }
    if (keyFact.status !== 'empty') return fail('registry-key-cleanup-failed');
    try {
      await adapter.deleteCanonicalKeyIfEmpty();
    } catch {
      return fail('registry-key-cleanup-failed');
    }
  }
  return Object.freeze({ ok: true });
}

async function executeInstall(
  request: ParsedEnsureRequest,
  dependencies: NativeHostEnsureDependencies,
  lease: NativeHostLockLease,
  plan: Extract<EnsurePlan, { kind: 'install' }>,
): Promise<NativeHostEnsureResult> {
  const key = stampKey(dependencies, plan);
  const [first, ...rest] = plan.targets.length > 0 ? plan.targets : ['chrome' as const];
  const publisher = await createPublisher(dependencies, {
    extensionId: plan.extensionId,
    installToken: lease.token,
    provenance: request.provenance,
    destination: 'stable',
    windowsManifest: null,
  });
  if (!publisher) {
    await recordStamp(dependencies, key, false);
    return ensureResult(dependencies, 'unavailable', { reason: 'unavailable' });
  }
  const installed = await installTransaction(plan.extensionId, {
    platform: dependencies.registrations[first],
    runtime: publisher,
  });
  if (installed.status !== 'installed') {
    const settled = installed.status === 'already-installed';
    if (!settled) await recordStamp(dependencies, key, false);
    return ensureResult(dependencies, settled ? 'current' : 'refused', {
      reason: installed.reason,
      version: installed.packageVersion,
      browsers: settled ? [first] : [],
    });
  }
  const added: NativeHostBrowser[] = [first];
  for (const browser of rest) {
    if ((await addRegistrationLocked(dependencies, browser, plan.extensionId)).ok) {
      added.push(browser);
    }
  }
  await recordStamp(dependencies, key, true);
  return ensureResult(dependencies, 'installed', {
    version: installed.packageVersion,
    browsers: sortedBrowsers(added),
    addedBrowsers: sortedBrowsers(added),
  });
}

async function executeUpdate(
  request: ParsedEnsureRequest,
  dependencies: NativeHostEnsureDependencies,
  lease: NativeHostLockLease,
  plan: Extract<EnsurePlan, { kind: 'update' | 'quarantine' }>,
): Promise<NativeHostEnsureResult> {
  let receipt = plan.receipt;
  let outcome: 'current' | 'refreshed' | 'registered' = 'current';
  const provenance: NativeHostProvenance = request.provenance === 'explicit'
    ? 'explicit'
    : receiptProvenance(receipt);
  if (plan.refresh !== null) {
    const key = stampKey(dependencies, plan);
    const context = Object.freeze({
      lease,
      receipt,
      extensionId: plan.extensionId,
      registered: plan.registered,
      provenance,
    });
    const refreshed = plan.kind === 'quarantine'
      ? await rebuildQuarantinedRuntime(dependencies, context)
      : await refreshRuntime(dependencies, context);
    if (!refreshed.ok) {
      if (refreshed.backoff) await recordStamp(dependencies, key, false);
      return ensureResult(dependencies, refreshed.outcome, {
        reason: refreshed.reason,
        version: receipt.packageVersion,
        browsers: plan.registered,
      });
    }
    receipt = refreshed.receipt;
    outcome = 'refreshed';
    await recordStamp(dependencies, key, true);
  } else if (plan.promote) {
    try {
      await dependencies.rewriteReceiptProvenance(receipt, 'explicit');
    } catch {
      // The helper keeps working; it only stays removable with its last client.
    }
  }
  const added: NativeHostBrowser[] = [];
  for (const browser of plan.additions) {
    if ((await addRegistrationLocked(dependencies, browser, plan.extensionId)).ok) {
      added.push(browser);
    }
  }
  if (outcome === 'current' && added.length > 0) outcome = 'registered';
  return ensureResult(dependencies, outcome, {
    version: receipt.packageVersion,
    browsers: sortedBrowsers([...plan.registered, ...added]),
    addedBrowsers: sortedBrowsers(added),
  });
}

async function ensureTransaction(
  request: ParsedEnsureRequest,
  dependencies: NativeHostEnsureDependencies,
): Promise<NativeHostEnsureResult> {
  const refreshOnly = request.mode === 'refresh-only';
  const optedOut = async (): Promise<boolean> => {
    try {
      return Boolean(await dependencies.state.readOptOut());
    } catch {
      return false;
    }
  };
  if (refreshOnly && await optedOut()) {
    return ensureResult(dependencies, 'skipped-opt-out', { reason: 'opt-out' });
  }
  // Cheap checks first, without the lock: most runs end here as `current`.
  const preview = await planEnsure(request, dependencies);
  if (preview.kind === 'final') return preview.result;
  if (refreshOnly && planPublishes(preview)) {
    const stamp = await readStamp(dependencies);
    const key = stampKey(dependencies, preview);
    if (stampMatches(stamp, key) && stamp.failures > 0 && dependencies.now() < stamp.nextAttemptAt) {
      return ensureResult(dependencies, 'deferred', {
        reason: 'backoff',
        version: preview.kind === 'install' ? null : preview.receipt.packageVersion,
        browsers: preview.kind === 'install' ? [] : preview.registered,
      });
    }
  }
  const lease = await acquireLease(dependencies, refreshOnly ? 0 : dependencies.timing.lockWaitMs);
  if (!lease) return ensureResult(dependencies, 'deferred', { reason: 'locked' });
  try {
    await recoverSiblings(dependencies, lease);
    if (refreshOnly) {
      if (await optedOut()) {
        return ensureResult(dependencies, 'skipped-opt-out', { reason: 'opt-out' });
      }
    } else {
      try {
        await dependencies.state.clearOptOut();
      } catch {
        // An explicit install proceeds; the stale opt-out only pauses refreshes.
      }
    }
    const plan = await planEnsure(request, dependencies);
    if (plan.kind === 'final') return plan.result;
    if (plan.kind === 'install') return await executeInstall(request, dependencies, lease, plan);
    return await executeUpdate(request, dependencies, lease, plan);
  } finally {
    await releaseLease(lease);
  }
}

/**
 * Makes the helper present and current. `install` creates it when absent;
 * `refresh-only` never does, skips when the user opted out, and backs off
 * after failures. Both refresh an exact older runtime (keeping the extension
 * id its marker records, never the store default), replace one whose pinned
 * interpreter is gone, rebuild one whose launcher alone fails its hash, and
 * register browsers that have the extension but no registration.
 */
export async function ensureNativeHost(
  requestValue: NativeHostEnsureRequest,
  dependencies: NativeHostEnsureDependencies,
): Promise<NativeHostEnsureResult> {
  const request = parseEnsureRequest(requestValue);
  if (!request || !ensureDependenciesMatch(dependencies)) {
    return ensureResult(dependencies, 'refused', { reason: 'invalid-request' });
  }
  return serialized(dependencies.stableRoot, () => ensureTransaction(request, dependencies));
}

function browserUninstallResult(
  dependencies: NativeHostEnsureDependencies,
  browser: NativeHostBrowser,
  status: NativeHostUninstallResult['status'],
  reason: string,
  origin: string | null,
  packageVersion: string | null,
): NativeHostUninstallResult {
  return Object.freeze({
    status,
    reason,
    location: dependencies.registrations[browser].layout.manifestPath,
    origin,
    packageVersion,
  });
}

function browserInstallResult(
  dependencies: NativeHostEnsureDependencies,
  browser: NativeHostBrowser,
  status: NativeHostInstallResult['status'],
  reason: string,
  origin: string | null,
  packageVersion: string | null,
): NativeHostInstallResult {
  return Object.freeze({
    status,
    reason,
    location: dependencies.registrations[browser].layout.manifestPath,
    origin,
    packageVersion,
  });
}

/**
 * The explicit single-browser install. With no other browser registered it is
 * the original install transaction. With another browser already registered
 * to the same current runtime it adds this browser's registration instead of
 * refusing; any other registration it does not own still refuses.
 */
export async function installNativeHostBrowser(
  requestValue: NativeHostInstallRequest,
  dependencies: NativeHostEnsureDependencies,
  provenance: NativeHostProvenance = 'explicit',
): Promise<NativeHostInstallResult> {
  const request = ordinaryRequest(requestValue);
  const browser = request?.browser ?? 'chrome';
  const extensionId = request?.extensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
  if (
    !request
    || !isNativeHostBrowser(browser)
    || !isNativeHostExtensionId(extensionId)
    || (provenance !== 'auto' && provenance !== 'explicit')
    || !ensureDependenciesMatch(dependencies)
  ) {
    return Object.freeze({
      status: 'refused',
      reason: 'invalid-request',
      location: dependencies?.registrations?.[isNativeHostBrowser(browser) ? browser : 'chrome']
        ?.layout.manifestPath ?? '',
      origin: null,
      packageVersion: null,
    });
  }
  const expectedOrigin = nativeHostOrigin(extensionId);
  return serialized(dependencies.stableRoot, async () => {
    const lease = await acquireLease(dependencies, dependencies.timing.lockWaitMs);
    if (!lease) {
      return browserInstallResult(dependencies, browser, 'refused', 'locked', expectedOrigin, null);
    }
    try {
      await recoverSiblings(dependencies, lease);
      try {
        await dependencies.state.clearOptOut();
      } catch {
        // See ensureTransaction.
      }
      let runtime;
      try {
        runtime = await dependencies.runtime.inspectRuntime();
      } catch {
        return browserInstallResult(dependencies, browser, 'refused', 'unavailable', expectedOrigin, null);
      }
      const markerExtensionId = runtime.marker ? extensionIdFromOrigin(runtime.marker.origin) : null;
      const surfaces = await readBrowserSurfaces(
        dependencies,
        runtime.markerFact,
        markerExtensionId ?? extensionId,
      );
      if (!surfaces || surfaces.some((surface) => surface.state === 'unavailable')) {
        return browserInstallResult(dependencies, browser, 'refused', 'unavailable', expectedOrigin, null);
      }
      const others = surfaces.filter((surface) => surface.browser !== browser);
      if (others.some((surface) => surface.state === 'other')) {
        return browserInstallResult(
          dependencies,
          browser,
          'refused',
          'split-state',
          expectedOrigin,
          runtime.marker?.packageVersion ?? null,
        );
      }
      if (!others.some((surface) => surface.state === 'exact')) {
        const publisher = await createPublisher(dependencies, {
          extensionId,
          installToken: lease.token,
          provenance,
          destination: 'stable',
          windowsManifest: null,
        });
        if (!publisher) {
          return browserInstallResult(dependencies, browser, 'refused', 'unavailable', expectedOrigin, null);
        }
        const result = await installTransaction(extensionId, {
          platform: dependencies.registrations[browser],
          runtime: publisher,
        });
        if (result.status === 'already-installed' && provenance === 'explicit') {
          await promoteProvenance(dependencies);
        }
        return result;
      }
      if (runtime.state !== 'exact') {
        return browserInstallResult(
          dependencies,
          browser,
          'refused',
          surfacesOwnershipReason(runtime.state, surfaces),
          expectedOrigin,
          runtime.marker?.packageVersion ?? null,
        );
      }
      const receipt = exactRuntimeReceipt(runtime, ensurePair(dependencies, browser));
      if (!receipt || receipt.origin !== expectedOrigin) {
        return browserInstallResult(
          dependencies,
          browser,
          'refused',
          'ownership-mismatch',
          expectedOrigin,
          receipt?.packageVersion ?? null,
        );
      }
      if (receipt.packageVersion !== dependencies.packageVersion) {
        return browserInstallResult(
          dependencies,
          browser,
          'refused',
          'version-mismatch',
          receipt.origin,
          receipt.packageVersion,
        );
      }
      const target = surfaceFor(surfaces, browser);
      if (target.state === 'exact') {
        if (provenance === 'explicit') await promoteProvenance(dependencies);
        return browserInstallResult(dependencies, browser, 'already-installed', 'exact', receipt.origin, receipt.packageVersion);
      }
      const added = await addRegistrationLocked(dependencies, browser, extensionId);
      if (!added.ok) {
        return browserInstallResult(dependencies, browser, 'refused', added.reason, receipt.origin, receipt.packageVersion);
      }
      if (provenance === 'explicit') await promoteProvenance(dependencies);
      return browserInstallResult(dependencies, browser, 'installed', 'installed', receipt.origin, receipt.packageVersion);
    } finally {
      await releaseLease(lease);
    }
  });
}

async function promoteProvenance(dependencies: NativeHostEnsureDependencies): Promise<void> {
  try {
    const runtime = await dependencies.runtime.inspectRuntime();
    const receipt = runtime.state === 'exact'
      ? exactRuntimeReceipt(runtime, ensurePair(dependencies))
      : null;
    if (receipt && receiptProvenance(receipt) === 'auto') {
      await dependencies.rewriteReceiptProvenance(receipt, 'explicit');
    }
  } catch {
    // See executeUpdate.
  }
}

/**
 * Removes one browser's registration. The runtime goes only with the last
 * exact registration, after its daemon has been asked to stop. A registration
 * this package does not own, in any browser, still refuses the whole call.
 */
export async function uninstallNativeHostBrowser(
  requestValue: NativeHostUninstallRequest,
  dependencies: NativeHostEnsureDependencies,
): Promise<NativeHostUninstallResult> {
  const fields = plainOwnValues(requestValue ?? {}, ['browser']);
  const browser = fields?.browser === undefined ? 'chrome' : fields.browser;
  if (!fields || !isNativeHostBrowser(browser) || !ensureDependenciesMatch(dependencies)) {
    return Object.freeze({
      status: 'refused',
      reason: 'invalid-request',
      location: dependencies?.registrations?.chrome?.layout.manifestPath ?? '',
      origin: null,
      packageVersion: null,
    });
  }
  return serialized(dependencies.stableRoot, async () => {
    const lease = await acquireLease(dependencies, dependencies.timing.lockWaitMs);
    if (!lease) return browserUninstallResult(dependencies, browser, 'refused', 'locked', null, null);
    try {
      await recoverSiblings(dependencies, lease);
      let runtime;
      try {
        runtime = await dependencies.runtime.inspectRuntime();
      } catch {
        return browserUninstallResult(dependencies, browser, 'refused', 'unavailable', null, null);
      }
      const installedExtensionId = runtime.marker ? extensionIdFromOrigin(runtime.marker.origin) : null;
      const extensionId = installedExtensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
      const origin = runtime.marker?.origin ?? null;
      const version = runtime.marker?.packageVersion ?? null;
      const surfaces = await readBrowserSurfaces(dependencies, runtime.markerFact, extensionId);
      if (!surfaces || surfaces.some((surface) => surface.state === 'unavailable')) {
        return browserUninstallResult(dependencies, browser, 'refused', 'unavailable', origin, version);
      }
      const target = surfaceFor(surfaces, browser);
      const others = surfaces.filter((surface) => surface.browser !== browser);
      if (others.some((surface) => surface.state === 'other')) {
        return browserUninstallResult(dependencies, browser, 'refused', 'split-state', origin, version);
      }
      const remaining = browsersIn(others, 'exact');
      if (runtime.state === 'absent' && surfaces.every((surface) => surface.state === 'absent')) {
        return browserUninstallResult(dependencies, browser, 'not-installed', 'absent', null, null);
      }
      if (runtime.state !== 'exact' || target.state === 'other') {
        return browserUninstallResult(
          dependencies,
          browser,
          'refused',
          surfacesOwnershipReason(runtime.state, surfaces),
          origin,
          version,
        );
      }
      const receipt = exactRuntimeReceipt(runtime, ensurePair(dependencies, browser));
      if (!receipt || !installedExtensionId) {
        return browserUninstallResult(dependencies, browser, 'refused', 'ownership-mismatch', origin, version);
      }
      if (target.state === 'absent') {
        return remaining.length > 0
          ? browserUninstallResult(dependencies, browser, 'not-installed', 'absent', receipt.origin, receipt.packageVersion)
          : browserUninstallResult(dependencies, browser, 'refused', 'split-state', receipt.origin, receipt.packageVersion);
      }
      if (remaining.length === 0) {
        const stopped = await stopStableRootDaemon(
          dependencies,
          lease.token,
          'uninstall',
          receipt.packageVersion,
        );
        if (!stopped.ok) {
          await removeStopRequest(dependencies, lease.token);
          return browserUninstallResult(dependencies, browser, 'refused', stopped.reason, receipt.origin, receipt.packageVersion);
        }
      }
      try {
        const removed = await removeRegistrationLocked(
          dependencies,
          browser,
          runtime.markerFact,
          installedExtensionId,
        );
        if (!removed.ok) {
          return browserUninstallResult(dependencies, browser, 'refused', removed.reason, receipt.origin, receipt.packageVersion);
        }
        if (remaining.length > 0) {
          return browserUninstallResult(
            dependencies,
            browser,
            'removed',
            'registration-removed',
            receipt.origin,
            receipt.packageVersion,
          );
        }
        let unchanged = false;
        try {
          unchanged = await dependencies.runtime.recheckExactRuntime(receipt);
        } catch {
          unchanged = false;
        }
        if (!unchanged) {
          return browserUninstallResult(dependencies, browser, 'refused', 'boundary-changed', receipt.origin, receipt.packageVersion);
        }
        try {
          await dependencies.runtime.removeExactRuntime(receipt);
        } catch {
          return browserUninstallResult(dependencies, browser, 'refused', 'runtime-remove-failed', receipt.origin, receipt.packageVersion);
        }
        return browserUninstallResult(dependencies, browser, 'removed', 'removed', receipt.origin, receipt.packageVersion);
      } finally {
        if (remaining.length === 0) await removeStopRequest(dependencies, lease.token);
      }
    } finally {
      await releaseLease(lease);
    }
  });
}

function uninstallAllResult(
  outcome: NativeHostUninstallAllResult['outcome'],
  fields: Readonly<{
    reason?: string;
    removedBrowsers?: readonly NativeHostBrowser[];
    provenance?: NativeHostProvenance;
  }> = {},
): NativeHostUninstallAllResult {
  return Object.freeze({
    outcome,
    ...(fields.reason ? { reason: fields.reason } : {}),
    removedBrowsers: [...(fields.removedBrowsers ?? [])],
    ...(fields.provenance ? { provenance: fields.provenance } : {}),
  });
}

/**
 * Removes every exact registration and then the runtime, after asking its
 * daemon to stop. With `onlyProvenance: 'auto'` a helper the user installed
 * by name is kept. Registrations this package does not own are left alone.
 */
export async function uninstallAllNativeHost(
  requestValue: NativeHostUninstallAllRequest,
  dependencies: NativeHostEnsureDependencies,
): Promise<NativeHostUninstallAllResult> {
  const fields = plainOwnValues(requestValue ?? {}, ['onlyProvenance']);
  if (
    !fields
    || (fields.onlyProvenance !== undefined && fields.onlyProvenance !== 'auto')
    || !ensureDependenciesMatch(dependencies)
  ) {
    return uninstallAllResult('refused', { reason: 'invalid-request' });
  }
  const onlyAuto = fields.onlyProvenance === 'auto';
  return serialized(dependencies.stableRoot, async () => {
    const lease = await acquireLease(dependencies, dependencies.timing.lockWaitMs);
    if (!lease) return uninstallAllResult('refused', { reason: 'locked' });
    try {
      await recoverSiblings(dependencies, lease);
      let runtime;
      try {
        runtime = await dependencies.runtime.inspectRuntime();
      } catch {
        return uninstallAllResult('unavailable', { reason: 'unavailable' });
      }
      const installedExtensionId = runtime.marker ? extensionIdFromOrigin(runtime.marker.origin) : null;
      const extensionId = installedExtensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
      const surfaces = await readBrowserSurfaces(dependencies, runtime.markerFact, extensionId);
      if (!surfaces || surfaces.some((surface) => surface.state === 'unavailable')) {
        return uninstallAllResult('unavailable', { reason: 'unavailable' });
      }
      if (runtime.state === 'absent') {
        return surfaces.some((surface) => surface.state === 'exact')
          ? uninstallAllResult('refused', { reason: 'split-state' })
          : uninstallAllResult('absent', { reason: 'absent' });
      }
      if (runtime.state !== 'exact') {
        return uninstallAllResult('refused', {
          reason: surfacesOwnershipReason(runtime.state, surfaces),
        });
      }
      const receipt = exactRuntimeReceipt(runtime, ensurePair(dependencies));
      if (!receipt || !installedExtensionId) {
        return uninstallAllResult('refused', { reason: 'ownership-mismatch' });
      }
      const provenance = receiptProvenance(receipt);
      if (onlyAuto && provenance !== 'auto') {
        return uninstallAllResult('kept', { reason: 'explicit-provenance', provenance });
      }
      const stopped = await stopStableRootDaemon(
        dependencies,
        lease.token,
        'uninstall',
        receipt.packageVersion,
      );
      const removedBrowsers: NativeHostBrowser[] = [];
      try {
        if (!stopped.ok) {
          return uninstallAllResult('refused', { reason: stopped.reason, provenance });
        }
        for (const browser of browsersIn(surfaces, 'exact')) {
          const removed = await removeRegistrationLocked(
            dependencies,
            browser,
            runtime.markerFact,
            installedExtensionId,
          );
          if (!removed.ok) {
            return uninstallAllResult('refused', {
              reason: removed.reason,
              removedBrowsers,
              provenance,
            });
          }
          removedBrowsers.push(browser);
        }
        let unchanged = false;
        try {
          unchanged = await dependencies.runtime.recheckExactRuntime(receipt);
        } catch {
          unchanged = false;
        }
        if (!unchanged) {
          return uninstallAllResult('refused', {
            reason: 'boundary-changed',
            removedBrowsers,
            provenance,
          });
        }
        try {
          await dependencies.runtime.removeExactRuntime(receipt);
        } catch {
          return uninstallAllResult('refused', {
            reason: 'runtime-remove-failed',
            removedBrowsers,
            provenance,
          });
        }
        return uninstallAllResult('removed', { removedBrowsers, provenance });
      } finally {
        await removeStopRequest(dependencies, lease.token);
      }
    } finally {
      await releaseLease(lease);
    }
  });
}

/** Registers one browser beside an existing current install. */
export async function addNativeHostRegistration(
  browser: NativeHostBrowser,
  dependencies: NativeHostEnsureDependencies,
): Promise<NativeHostEnsureResult> {
  if (!isNativeHostBrowser(browser) || !ensureDependenciesMatch(dependencies)) {
    return ensureResult(dependencies, 'refused', { reason: 'invalid-request' });
  }
  return serialized(dependencies.stableRoot, async () => {
    const lease = await acquireLease(dependencies, dependencies.timing.lockWaitMs);
    if (!lease) return ensureResult(dependencies, 'deferred', { reason: 'locked' });
    try {
      await recoverSiblings(dependencies, lease);
      let runtime;
      try {
        runtime = await dependencies.runtime.inspectRuntime();
      } catch {
        return ensureResult(dependencies, 'unavailable', { reason: 'unavailable' });
      }
      const extensionId = runtime.marker ? extensionIdFromOrigin(runtime.marker.origin) : null;
      if (runtime.state !== 'exact' || !extensionId) {
        return ensureResult(dependencies, 'refused', { reason: 'runtime-not-exact' });
      }
      const added = await addRegistrationLocked(dependencies, browser, extensionId);
      const surfaces = await readBrowserSurfaces(dependencies, runtime.markerFact, extensionId);
      const registered = surfaces ? browsersIn(surfaces, 'exact') : [];
      return added.ok
        ? ensureResult(dependencies, 'registered', {
          version: runtime.marker?.packageVersion ?? null,
          browsers: registered,
          addedBrowsers: [browser],
        })
        : ensureResult(dependencies, 'refused', {
          reason: added.reason,
          version: runtime.marker?.packageVersion ?? null,
          browsers: registered,
        });
    } finally {
      await releaseLease(lease);
    }
  });
}
