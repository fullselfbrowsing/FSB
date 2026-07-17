export const NATIVE_HOST_NAME = 'io.github.fullselfbrowsing.fsb_native_host';
export const NATIVE_HOST_OWNER = 'io.github.fullselfbrowsing.fsb';
export const NATIVE_HOST_DESCRIPTION = 'FSB local agent service wake host';
export const NATIVE_HOST_DEFAULT_EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';
export const NATIVE_HOST_DEFAULT_ORIGIN =
  `chrome-extension://${NATIVE_HOST_DEFAULT_EXTENSION_ID}/`;
export const NATIVE_HOST_EXTENSION_ID_PATTERN = /^[a-p]{32}$/u;

export const NATIVE_HOST_PROTOCOL_VERSION = 1;
export const NATIVE_HOST_MAX_FRAME_BYTES = 4096;
export const NATIVE_HOST_MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;
export const NATIVE_HOST_HEALTH_PRODUCT = 'fsb-mcp-server';
export const NATIVE_HOST_HEALTH_PROTOCOL = 'fsb-native-host-health-v1';
export const NATIVE_HOST_HEALTH_MAX_BYTES = 4096;

export const NATIVE_HOST_OWNER_MARKER_SCHEMA = 1;
export const NATIVE_HOST_RUNTIME_DIRECTORY_MODE = 0o700;
export const NATIVE_HOST_LAUNCHER_MODE = 0o700;
export const NATIVE_HOST_PRIVATE_FILE_MODE = 0o600;

export const NATIVE_HOST_HEALTH_TIMEOUT_MS = 500;
export const NATIVE_HOST_DAEMON_START_TIMEOUT_MS = 10_000;
export const NATIVE_HOST_START_LOCK_STALE_MS = 30_000;
export const NATIVE_HOST_START_POLL_INTERVAL_MS = 100;

export const NATIVE_HOST_PACKAGE_NAME = 'fsb-mcp-server';
export const NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH =
  'bin/fsb-native-host-launcher.mjs';
export const NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH =
  'bin\\fsb-native-host.exe';
export const NATIVE_HOST_WINDOWS_CONFIG_RELATIVE_PATH =
  'bin\\fsb-native-host-bootstrap.bin';
export const NATIVE_HOST_PACKAGE_RELATIVE_PATH = 'runtime/package';
export const NATIVE_HOST_ENTRY_RELATIVE_PATH =
  'runtime/package/build/native-host/index.js';
export const NATIVE_HOST_INTEGRITY_RELATIVE_PATH =
  'runtime/package/native-host/runtime-integrity.json';

export function isNativeHostExtensionId(value: string): boolean {
  return NATIVE_HOST_EXTENSION_ID_PATTERN.test(value);
}

export function nativeHostOrigin(extensionId: string): string {
  if (!isNativeHostExtensionId(extensionId)) {
    throw new Error('FSBNH_EXTENSION_ID');
  }
  return `chrome-extension://${extensionId}/`;
}
