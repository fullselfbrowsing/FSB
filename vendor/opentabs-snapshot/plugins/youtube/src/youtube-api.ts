import {
  type FetchFromPageOptions,
  ToolError,
  fetchFromPage,
  getCookie,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  getPageGlobal,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface YouTubeAuth {
  apiKey: string;
  sessionIndex: string;
  sapisid: string;
}

/** Read InnerTube config from the page global `ytcfg.data_`. */
const getYtcfg = (key: string): unknown => getPageGlobal(`ytcfg.data_.${key}`);

/**
 * Generate the SAPISIDHASH authorization header.
 * Formula: `SAPISIDHASH <timestamp>_<SHA1(timestamp + " " + SAPISID + " " + origin)>`
 */
const generateSAPISIDHASH = async (sapisid: string): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const origin = 'https://www.youtube.com';
  const input = `${timestamp} ${sapisid} ${origin}`;
  const buffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  const hash = Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `SAPISIDHASH ${timestamp}_${hash}`;
};

const getAuth = (): YouTubeAuth | null => {
  const cached = getAuthCache<YouTubeAuth>('youtube');
  if (cached) return cached;

  const loggedIn = getYtcfg('LOGGED_IN') as boolean | undefined;
  if (!loggedIn) return null;

  const apiKey = getYtcfg('INNERTUBE_API_KEY') as string | undefined;
  const sessionIndex = (getYtcfg('SESSION_INDEX') as string | undefined) ?? '0';
  const sapisid = getCookie('SAPISID');

  if (!apiKey || !sapisid) return null;

  const auth: YouTubeAuth = { apiKey, sessionIndex, sapisid };
  setAuthCache('youtube', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

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

/** Get the InnerTube context object required for every API call. */
const getInnerTubeContext = (): Record<string, unknown> => {
  const ctx = getYtcfg('INNERTUBE_CONTEXT') as Record<string, unknown> | undefined;
  if (!ctx) throw ToolError.internal('InnerTube context not found on page.');
  return ctx;
};

// --- API ---

/**
 * Call a YouTube InnerTube API endpoint.
 *
 * All InnerTube endpoints are POST requests to
 * `https://www.youtube.com/youtubei/v1/<endpoint>?key=<apiKey>`
 * with a JSON body containing the `context` object and endpoint-specific params.
 *
 * Read operations work with cookies alone. Write operations additionally
 * require the `Authorization: SAPISIDHASH ...` header.
 */
export const api = async <T>(
  endpoint: string,
  body: Record<string, unknown> = {},
  options: { requireAuth?: boolean } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to YouTube.');

  const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${auth.apiKey}&prettyPrint=false`;
  const context = getInnerTubeContext();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Goog-AuthUser': auth.sessionIndex,
  };

  // Write operations need SAPISIDHASH
  if (options.requireAuth !== false) {
    headers.Authorization = await generateSAPISIDHASH(auth.sapisid);
  }

  const init: FetchFromPageOptions = {
    method: 'POST',
    headers,
    body: JSON.stringify({ context, ...body }),
  };

  let response: Response;
  try {
    response = await fetchFromPage(url, init);
  } catch (error) {
    // fetchFromPage throws ToolError for HTTP errors — re-throw as-is
    if (error instanceof ToolError) {
      // On 401, clear cached auth so it re-reads on next call
      if (error.category === 'auth') {
        clearAuthCache('youtube');
      }
      throw error;
    }
    throw error;
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};
