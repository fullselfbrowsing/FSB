import { NATIVE_HOST_NAME } from '../native-host/constants.js';
import type { NativeHostBrowser } from './types.js';

export const NATIVE_HOST_BROWSERS = Object.freeze<readonly NativeHostBrowser[]>([
  'chrome',
  'edge',
  'brave',
  'chromium',
]);

export const NATIVE_HOST_WINDOWS_REGISTRY_KEYS: Readonly<Record<NativeHostBrowser, string>> =
  Object.freeze({
    chrome: `Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
    edge: `Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
    brave: `Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
    chromium: `Software\\Chromium\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  });

export function isNativeHostBrowser(value: unknown): value is NativeHostBrowser {
  return NATIVE_HOST_BROWSERS.includes(value as NativeHostBrowser);
}
