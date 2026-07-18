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
import type {
  NativeHostInstallRequest,
  NativeHostInstallResult,
  NativeHostInstallTransactionDependencies,
  NativeHostOwnedState,
  NativeHostRegistrationReadFacts,
  NativeHostRuntimeOwnedInspection,
  NativeHostRuntimeReceipt,
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
  if (keys.some((key) => typeof key !== 'string' || key !== 'extensionId')) return null;
  if (keys.length > 1) return null;
  if (keys.length === 0) return Object.freeze({});
  const descriptor = Object.getOwnPropertyDescriptor(value, 'extensionId');
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
  if (descriptor.value !== undefined && typeof descriptor.value !== 'string') return null;
  return Object.freeze({ extensionId: descriptor.value as string | undefined });
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
    && markersEqual(left.marker, right.marker);
}

function exactRuntimeReceipt(
  inspection: NativeHostRuntimeOwnedInspection,
  dependencies: NativeHostUninstallTransactionDependencies,
): Readonly<NativeHostRuntimeReceipt> | null {
  if (
    inspection.state !== 'exact'
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
    || receipt.schema !== 1
    || receipt.platform !== platformLayout.platform
    || receipt.packageName !== NATIVE_HOST_PACKAGE_NAME
    || receipt.packageVersion !== marker.packageVersion
    || receipt.origin !== marker.origin
    || receipt.installToken !== marker.installToken
    || receipt.artifactSha256 !== marker.artifactSha256
    || !SHA256_PATTERN.test(receipt.artifactSha256)
    || !SHA512_INTEGRITY_PATTERN.test(receipt.tarballIntegrity)
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
  if (
    !request
    || !isNativeHostExtensionId(extensionId)
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
  const expectedOrigin = nativeHostOrigin(extensionId);
  return serialized(dependencies.platform.layout.stableRoot, async () => {
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
  });
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
