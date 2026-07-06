import {
  type FetchFromPageOptions,
  buildQueryString,
  fetchFromPage,
  fetchJSON,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// CircleCI uses HttpOnly session cookies — no explicit token needed.
// Auth is detected via __NEXT_DATA__.props.pageProps presence (populated by Next.js SSR).
// The session cookie is sent automatically via credentials: 'include'.

export const isAuthenticated = (): boolean => {
  // Check for the CircleCI page context — the pipelines page has __NEXT_DATA__
  // with pageProps containing user/org info. A simple presence check is sufficient.
  const nextData = (globalThis as Record<string, unknown>).__NEXT_DATA__ as
    | { props?: { pageProps?: Record<string, unknown> } }
    | undefined;
  return nextData?.props?.pageProps !== undefined;
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

// --- API helpers ---

const API_V2 = '/api/v2';

interface ApiOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export const api = async <T>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_V2}${endpoint}?${qs}` : `${API_V2}${endpoint}`;

  const init: FetchFromPageOptions = {
    method: options.method ?? 'GET',
  };

  if (options.body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  return fetchJSON<T>(url, init) as Promise<T>;
};

// For endpoints that return 204 No Content on success (cancel, delete, etc.)
export const apiVoid = async (endpoint: string, options: ApiOptions = {}): Promise<void> => {
  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${API_V2}${endpoint}?${qs}` : `${API_V2}${endpoint}`;

  const init: FetchFromPageOptions = {
    method: options.method ?? 'POST',
  };

  if (options.body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  const resp = await fetchFromPage(url, init);
  if (resp.status === 202 || resp.status === 200) {
    // Some CircleCI endpoints return 202 with a JSON body — consume it
    await resp.text();
  }
};
