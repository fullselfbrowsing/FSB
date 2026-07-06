import { ToolError, getPageGlobal, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Google Drive uses `gapi.client.request` for API calls. The gapi library
// handles auth internally via SAPISIDHASH headers derived from the user's
// session cookies. An API key embedded in the page must be set via
// `gapi.client.setApiKey()` before requests succeed.

const DRIVE_API_KEY = 'AIzaSyD_InbmSFufIEps5UAt2NmB_3LvBH3Sz_8';

const isGapiReady = (): boolean => {
  const req = getPageGlobal('gapi.client.request') as ((...args: unknown[]) => unknown) | undefined;
  return typeof req === 'function';
};

export const isAuthenticated = (): boolean => isGapiReady();

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 8000 }).then(
    () => true,
    () => false,
  );

// --- gapi.client.request wrapper ---

interface GapiResponse<T> {
  status: number;
  result: T;
  body: string;
  headers: Record<string, string>;
}

interface GapiRequestParams {
  path: string;
  method?: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: string;
}

let apiKeySet = false;

const ensureApiKey = (): void => {
  if (apiKeySet) return;
  const setApiKey = getPageGlobal('gapi.client.setApiKey') as ((key: string) => void) | undefined;
  if (setApiKey) {
    setApiKey(DRIVE_API_KEY);
    apiKeySet = true;
  }
};

const gapiRequest = <T>(opts: GapiRequestParams): Promise<GapiResponse<T>> => {
  const requestFn = getPageGlobal('gapi.client.request') as
    | ((opts: GapiRequestParams) => {
        then: (ok: (r: GapiResponse<T>) => void, err: (e: GapiResponse<T>) => void) => void;
      })
    | undefined;

  if (!requestFn) {
    throw ToolError.auth('Google Drive is not ready — please open Google Drive and sign in.');
  }

  ensureApiKey();

  // Filter undefined params
  const cleanParams: Record<string, string | number | boolean> | undefined = opts.params
    ? (Object.fromEntries(Object.entries(opts.params).filter(([, v]) => v !== undefined)) as Record<
        string,
        string | number | boolean
      >)
    : undefined;

  return new Promise<GapiResponse<T>>((resolve, reject) => {
    requestFn({ ...opts, params: cleanParams }).then(resolve, reject);
  });
};

// --- API caller ---

const API_BASE = '/drive/v3';

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const path = `${API_BASE}${endpoint}`;

  try {
    const resp = await gapiRequest<T>({
      path,
      method: options.method,
      params: options.params,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return resp.result;
  } catch (err: unknown) {
    const gapiErr = err as GapiResponse<{ error?: { code?: number; message?: string } }>;
    const status = gapiErr?.status;
    const message = gapiErr?.result?.error?.message ?? `API error: ${endpoint}`;

    if (status === 401 || status === 403) throw ToolError.auth(message);
    if (status === 404) throw ToolError.notFound(message);
    if (status === 429) throw ToolError.rateLimited(message);
    if (status === 400 || status === 422) throw ToolError.validation(message);
    throw ToolError.internal(`(${status ?? 'unknown'}) ${message}`);
  }
};

// --- Void API caller (for DELETE returning 204) ---

export const apiVoid = async (
  endpoint: string,
  options: {
    method?: string;
    params?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<void> => {
  const path = `${API_BASE}${endpoint}`;

  try {
    await gapiRequest<unknown>({
      path,
      method: options.method,
      params: options.params,
    });
  } catch (err: unknown) {
    const gapiErr = err as GapiResponse<{ error?: { code?: number; message?: string } }>;
    const status = gapiErr?.status;

    // 204 No Content is a success for DELETE operations but gapi treats it as an error
    if (status === 204) return;

    const message = gapiErr?.result?.error?.message ?? `API error: ${endpoint}`;

    if (status === 401 || status === 403) throw ToolError.auth(message);
    if (status === 404) throw ToolError.notFound(message);
    if (status === 429) throw ToolError.rateLimited(message);
    if (status === 400 || status === 422) throw ToolError.validation(message);
    throw ToolError.internal(`(${status ?? 'unknown'}) ${message}`);
  }
};
