import {
  type FetchFromPageOptions,
  ToolError,
  buildQueryString,
  fetchFromPage,
  getAuthCache,
  getLocalStorage,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

interface OnlyFansAuth {
  userId: number;
}

// ---------------------------------------------------------------------------
// Untyped page internals
// ---------------------------------------------------------------------------

/** Minimal shape of the Vue 2 Vuex store accessed from the DOM. */
interface VuexStore {
  getters: Record<string, unknown>;
  state: { auth?: { csrf?: string } };
}

/** Vue 2 component instance shape we access on `#app.__vue__`. */
interface VueInstance {
  $root?: { $store?: VuexStore };
}

/** The `#app` element augmented with Vue 2 internals. */
interface VueAppElement extends Element {
  __vue__?: VueInstance;
}

type WebpackRequire = (id: string) => Record<string, unknown>;

// ---------------------------------------------------------------------------
// Webpack header builder
// ---------------------------------------------------------------------------

/**
 * The OnlyFans SPA computes per-request cryptographic headers (`sign`, `time`,
 * `app-token`, `x-bc`, `x-of-rev`, `x-hash`) via an obfuscated signing module
 * bundled in webpack. Rather than reverse-engineering the algorithm, we access
 * the app's own header builder function at runtime through the webpack chunk.
 *
 * Module `977434` exports `JA` — a function that accepts a request config
 * object `{ url: string }` and returns a headers object with all required
 * auth/signing fields.
 */
type HeaderBuilder = (config: { url: string }) => Record<string, string>;

let cachedHeaderBuilder: HeaderBuilder | null = null;
let probeCounter = 0;

const getHeaderBuilder = (): HeaderBuilder | null => {
  if (cachedHeaderBuilder) return cachedHeaderBuilder;

  try {
    const g = globalThis as unknown as Record<string, unknown>;
    const chunks = g.webpackChunkof_vue as unknown[] | undefined;
    if (!chunks) return null;

    let webpackRequire: WebpackRequire | null = null;
    // The webpack runtime overrides Array.push on the chunk array and tracks
    // installed chunk IDs. Using the same ID on subsequent calls causes webpack
    // to skip the callback. A unique ID per call ensures the callback fires.
    probeCounter += 1;
    chunks.push([
      [`__ot_${probeCounter}`],
      {},
      (req: WebpackRequire) => {
        webpackRequire = req;
      },
    ]);

    if (!webpackRequire) return null;
    const mod = (webpackRequire as WebpackRequire)('977434');
    const builder = mod.JA as HeaderBuilder | undefined;
    if (typeof builder === 'function') {
      cachedHeaderBuilder = builder;
      return builder;
    }
    return null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Vuex store access
// ---------------------------------------------------------------------------

const getStore = (): VuexStore | null => {
  try {
    const el = document.querySelector('#app') as VueAppElement | null;
    return el?.__vue__?.$root?.$store ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Auth detection
// ---------------------------------------------------------------------------

const getUserId = (): number | null => {
  const store = getStore();
  if (store) {
    const id = store.getters['auth/authUserId'] as number | undefined;
    if (id && id > 0) return id;
  }

  // Fallback: localStorage stores the numeric user ID
  const userStr = getLocalStorage('user');
  if (userStr) {
    const userId = Number(userStr);
    if (!Number.isNaN(userId) && userId > 0) return userId;
  }

  return null;
};

const getAuth = (): OnlyFansAuth | null => {
  const cached = getAuthCache<OnlyFansAuth>('onlyfans');
  if (cached) return cached;

  const userId = getUserId();
  if (!userId) return null;

  const auth: OnlyFansAuth = { userId };
  setAuthCache('onlyfans', auth);
  return auth;
};

export const isAuthenticated = (): boolean => {
  return getAuth() !== null && getHeaderBuilder() !== null;
};

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), {
      interval: 500,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// API base
// ---------------------------------------------------------------------------

const API_BASE = '/api2/v2';

// ---------------------------------------------------------------------------
// CSRF token
// ---------------------------------------------------------------------------

const getCsrf = (): string | null => {
  const store = getStore();
  return (store?.state?.auth?.csrf as string) ?? null;
};

// ---------------------------------------------------------------------------
// API caller
// ---------------------------------------------------------------------------

export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to OnlyFans.');

  const builder = getHeaderBuilder();
  if (!builder) throw ToolError.auth('Signing function unavailable — the OnlyFans page may not be fully loaded.');

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_BASE}${endpoint}?${qs}` : `${API_BASE}${endpoint}`;

  const signHeaders = builder({ url });

  const headers: Record<string, string> = {
    ...signHeaders,
    Accept: 'application/json, text/plain, */*',
  };

  const method = options.method ?? 'GET';

  if (method !== 'GET') {
    const csrf = getCsrf();
    if (csrf) headers.csrf = csrf;
  }

  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetchFromPage(url, init);

  if (response.status === 204) return {} as T;

  return (await response.json()) as T;
};
