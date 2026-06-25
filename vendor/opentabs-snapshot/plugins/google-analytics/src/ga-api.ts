import {
  ToolError,
  getCookie,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  getPageGlobal,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Types ---

interface GaAuth {
  apiKey: string;
  authuser: string;
  sapisid: string;
}

interface GapiRequestOptions {
  path: string;
  method?: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

interface GapiResponse<T> {
  status: number;
  result: T;
}

// --- Auth detection ---

const getAuth = (): GaAuth | null => {
  const cached = getAuthCache<GaAuth>('google-analytics');
  if (cached) return cached;

  const apiKey = getPageGlobal('preload.globals.gmsSuiteApiKey') as string | undefined;
  const authuser = (getPageGlobal('preload.globals.authuser') as string | undefined) ?? '0';
  const sapisid = getCookie('SAPISID');

  if (!apiKey || !sapisid) return null;

  const auth: GaAuth = { apiKey, authuser, sapisid };
  setAuthCache('google-analytics', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

// --- gapi.client accessor ---

interface GapiClient {
  request(opts: {
    path: string;
    method: string;
    params?: Record<string, string>;
    body?: string;
    headers?: Record<string, string>;
  }): { then(onOk: (r: GapiResponse<unknown>) => void, onErr: (e: unknown) => void): void };
}

const getGapiClient = (): GapiClient | null => {
  const gapi = getPageGlobal('gapi') as { client?: GapiClient } | undefined;
  return gapi?.client ?? null;
};

// --- API callers ---

const gapiRequest = async <T>(opts: GapiRequestOptions): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Google Analytics.');

  const client = getGapiClient();
  if (!client) throw ToolError.internal('Google API client (gapi.client) not available on page.');

  const params: Record<string, string> = { key: auth.apiKey };
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) params[k] = String(v);
    }
  }

  const headers: Record<string, string> = {};
  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(ToolError.timeout('Google Analytics API request timed out after 30 seconds.'));
    }, 30_000);

    client
      .request({
        path: opts.path,
        method: opts.method ?? (opts.body ? 'POST' : 'GET'),
        params,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        headers,
      })
      .then(
        (resp: GapiResponse<unknown>) => {
          clearTimeout(timeout);
          resolve(resp.result as T);
        },
        (err: unknown) => {
          clearTimeout(timeout);
          const gapiErr = err as {
            status?: number;
            result?: { error?: { code?: number; message?: string; status?: string } };
          };
          const status = gapiErr?.status ?? gapiErr?.result?.error?.code;
          const message = gapiErr?.result?.error?.message ?? 'Google Analytics API error';

          if (status === 401) {
            clearAuthCache('google-analytics');
            reject(ToolError.auth(message));
            return;
          }
          if (status === 403) {
            reject(ToolError.auth(message));
            return;
          }
          if (status === 404) {
            reject(ToolError.notFound(message));
            return;
          }
          if (status === 429) {
            reject(ToolError.rateLimited(message));
            return;
          }
          if (status === 400) {
            reject(ToolError.validation(message));
            return;
          }

          reject(ToolError.internal(message));
        },
      );
  });
};

// Suite Frontend API (accounts, entities)
const SUITE_BASE = 'https://analyticssuitefrontend-pa.clients6.google.com';

export const suiteApi = async <T>(endpoint: string, body?: unknown): Promise<T> => {
  return gapiRequest<T>({
    path: `${SUITE_BASE}${endpoint}`,
    body,
  });
};

// Data API (reports, metadata)
const DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

export const dataApi = async <T>(endpoint: string, body?: unknown): Promise<T> => {
  return gapiRequest<T>({
    path: `${DATA_BASE}${endpoint}`,
    body,
  });
};

// --- Preload data accessors ---

export const getPreloadAccountTree = (): unknown => getPageGlobal('preload.accountTree');

export const getObfuscatedUserId = (): string =>
  (getPageGlobal('preload.obfuscatedUserId') as string | undefined) ?? '';

export const getActivePropertyId = (): string | null => {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  // URL format: #/p<propertyId>/... or #/a<accountId>p<propertyId>/...
  const match = hash.match(/p(\d+)/);
  const propertyId = match?.[1];
  if (propertyId && propertyId !== '0') return propertyId;
  return null;
};
