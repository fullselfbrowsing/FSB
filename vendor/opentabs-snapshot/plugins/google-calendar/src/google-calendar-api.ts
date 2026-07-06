import { ToolError, getPageGlobal, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// Google Calendar uses `gapi.client.request` for API calls. The gapi library
// handles auth internally via SAPISIDHASH headers derived from the user's
// session cookies. Auth readiness is detected by checking that gapi.client.request
// is available on the page.

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

const gapiRequest = <T>(opts: GapiRequestParams): Promise<GapiResponse<T>> => {
  const requestFn = getPageGlobal('gapi.client.request') as
    | ((opts: GapiRequestParams) => {
        then: (ok: (r: GapiResponse<T>) => void, err: (e: GapiResponse<T>) => void) => void;
      })
    | undefined;

  if (!requestFn) {
    throw ToolError.auth('Google Calendar is not ready — please open Google Calendar and sign in.');
  }

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

const API_BASE = '/calendar/v3';

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
