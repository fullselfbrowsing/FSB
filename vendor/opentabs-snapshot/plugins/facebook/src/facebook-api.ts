import {
  ToolError,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  waitUntil,
  buildQueryString,
} from '@opentabs-dev/plugin-sdk';

// ---------------------------------------------------------------------------
// Facebook internal module access
// ---------------------------------------------------------------------------

/**
 * Access Facebook's internal `require()` module system exposed on `window`.
 * Returns `undefined` if the module is not loaded.
 */
const fbRequire = <T = unknown>(moduleName: string): T | undefined => {
  try {
    const req = (globalThis as Record<string, unknown>).require as ((name: string) => T) | undefined;
    if (typeof req !== 'function') return undefined;
    return req(moduleName);
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface FacebookAuth {
  userId: string;
  fbDtsg: string;
  lsd: string;
}

const getAuth = (): FacebookAuth | null => {
  const cached = getAuthCache<FacebookAuth>('facebook');
  if (cached?.userId && cached?.fbDtsg && cached?.lsd) return cached;

  const userId = fbRequire<{ USER_ID?: string }>('CurrentUserInitialData')?.USER_ID ?? undefined;
  const fbDtsg = fbRequire<{ token?: string }>('DTSGInitialData')?.token ?? undefined;
  const lsd = fbRequire<{ token?: string }>('LSD')?.token ?? undefined;

  if (!userId || !fbDtsg || !lsd) return null;

  const auth: FacebookAuth = { userId, fbDtsg, lsd };
  setAuthCache('facebook', auth);
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

const requireAuth = (): FacebookAuth => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to Facebook.');
  return auth;
};

// ---------------------------------------------------------------------------
// Current user info (from page globals, no API call)
// ---------------------------------------------------------------------------

interface CurrentUserData {
  userId: string;
  name: string;
  shortName: string;
}

export const getCurrentUserData = (): CurrentUserData => {
  requireAuth();
  const mod = fbRequire<{
    USER_ID?: string;
    NAME?: string;
    SHORT_NAME?: string;
  }>('CurrentUserInitialData');
  return {
    userId: mod?.USER_ID ?? '',
    name: mod?.NAME ?? '',
    shortName: mod?.SHORT_NAME ?? '',
  };
};

// ---------------------------------------------------------------------------
// Doc ID resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a Relay persisted query doc_id at runtime.
 *
 * Facebook stores `doc_id` values in modules named
 * `<QueryOrMutationName>_facebookRelayOperation`. The value is a numeric
 * string that changes on every client-side deployment. We cache resolved
 * doc_ids on `globalThis` so they survive SPA route transitions (the Relay
 * modules for some operations are only loaded on specific routes).
 */

const getDocIdCache = (): Record<string, string> => {
  const g = globalThis as Record<string, unknown>;
  if (!g.__fbDocIdCache || typeof g.__fbDocIdCache !== 'object') {
    g.__fbDocIdCache = {};
  }
  return g.__fbDocIdCache as Record<string, string>;
};

/**
 * Scan SSR preloader scripts for queryID → queryName mappings.
 * Facebook embeds preloader parameters in `<script type="application/json">`
 * tags as `{ queryID: "...", queryName: "..." }` objects.
 */
const populateFromSSRScripts = (cache: Record<string, string>): void => {
  if (typeof document === 'undefined') return;
  const scripts = document.querySelectorAll('script');
  const pattern =
    /"queryID"\s*:\s*"(\d{10,})"\s*,\s*"variables"\s*:\s*\{[^}]*\}\s*,\s*"queryName"\s*:\s*"([A-Za-z]+Query|[A-Za-z]+Mutation)"/g;
  for (const script of scripts) {
    const text = script.textContent ?? '';
    for (const match of text.matchAll(pattern)) {
      const queryId = match[1];
      const queryName = match[2];
      if (queryName && queryId && !cache[queryName]) {
        cache[queryName] = queryId;
      }
    }
  }
};

/** Eagerly populate the cache from Relay modules and SSR scripts. */
const populateDocIdCache = (): void => {
  const knownOps = [
    // Notifications
    'CometNotificationsRootQuery',
    // Search
    'CometSearchBootstrapKeywordsDataSourceQuery',
    // Profile & Posts
    'ProfileCometHeaderQuery',
    'ProfileCometTimelineFeedQuery',
    // Reactions
    'CometUFIFeedbackReactMutation',
    'CometUFIReactionsDialogQuery',
    // Post creation
    'ComposerStoryCreateMutation',
    // Friends
    'FriendingCometFriendRequestConfirmMutation',
    'FriendingCometFriendRequestDeleteMutation',
    'FriendingCometRootContentQuery',
    'FriendingCometSendFriendRequestMutation',
    // Marketplace
    'CometMarketplaceRootQuery',
    'CometMarketplaceSearchContentContainerQuery',
    'CometMarketplaceSearchRootQuery',
    // Events
    'EventCometDashboardRootQuery',
    'EventCometHomeRootQuery',
    // Groups
    'CometGroupRootQuery',
    'GroupsCometCrossGroupFeedContainerQuery',
    'GroupsCometLeftRailContainerQuery',
    // Saved
    'CometSaveDashboardRootQuery',
    'CometSavePrimaryNavigationQuery',
  ];
  const cache = getDocIdCache();

  // Source 1: Relay modules
  for (const op of knownOps) {
    if (cache[op]) continue;
    const id = fbRequire<string>(`${op}_facebookRelayOperation`);
    if (id !== undefined) {
      cache[op] = String(id);
    }
  }

  // Source 2: SSR preloader scripts embedded in the page HTML
  populateFromSSRScripts(cache);
};

// Eagerly populate on adapter load
populateDocIdCache();

export const resolveDocId = (operationName: string): string => {
  // Attempt fresh resolution first (the module may have been loaded since last check)
  const freshId = fbRequire<string>(`${operationName}_facebookRelayOperation`);
  if (freshId !== undefined) {
    const cache = getDocIdCache();
    cache[operationName] = String(freshId);
    return String(freshId);
  }

  // Fall back to cached doc_id
  const cached = getDocIdCache()[operationName];
  if (cached) return cached;

  throw ToolError.internal(
    `Could not resolve doc_id for ${operationName}. ` +
      'The required Relay module may not be loaded — try navigating to the relevant Facebook page first.',
  );
};

// ---------------------------------------------------------------------------
// GraphQL API caller
// ---------------------------------------------------------------------------

/**
 * Call Facebook's internal GraphQL API.
 *
 * All requests go to `POST /api/graphql/` with a form-encoded body.
 * Auth is via HttpOnly cookies (automatic) plus `fb_dtsg` (CSRF) and `lsd`
 * tokens extracted from the page's Relay modules.
 */
export const graphql = async <T = unknown>(
  operationName: string,
  variables: Record<string, unknown> = {},
): Promise<T> => {
  const auth = requireAuth();
  const docId = resolveDocId(operationName);

  const body = new URLSearchParams({
    av: auth.userId,
    __user: auth.userId,
    __a: '1',
    __comet_req: '15',
    fb_dtsg: auth.fbDtsg,
    lsd: auth.lsd,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: operationName,
    variables: JSON.stringify(variables),
    server_timestamps: 'true',
    doc_id: docId,
  });

  const resp = await fetch('/api/graphql/', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-LSD': auth.lsd,
      'X-FB-Friendly-Name': operationName,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    clearAuthCache('facebook');
    if (resp.status === 401 || resp.status === 403) {
      throw ToolError.auth('Facebook session expired — please log in again.');
    }
    if (resp.status === 429) {
      throw ToolError.rateLimited('Rate limited by Facebook. Try again later.');
    }
    throw ToolError.internal(`Facebook API returned HTTP ${resp.status}.`);
  }

  const text = await resp.text();

  // Facebook may prefix responses with "for (;;);" as an anti-XSSI measure
  const cleaned = text.replace(/^for \(;;\);/, '');

  // Responses can be multi-line NDJSON (streaming Relay payloads)
  const lines = cleaned.split('\n').filter(Boolean);
  const parsed = lines.map(line => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      return null;
    }
  });

  const first = parsed.find(p => p !== null);
  if (!first) {
    throw ToolError.internal('Empty response from Facebook GraphQL API.');
  }

  // Check for GraphQL-level errors — only throw when no usable data is present.
  // Facebook returns non-critical errors alongside valid data when optional
  // variables are omitted (e.g., "missing_required_variable_value").
  const errors = first.errors as Array<{ message?: string; code?: number }> | undefined;
  const hasData = first.data !== undefined && first.data !== null;

  if (errors?.length && !hasData) {
    const msg = errors[0]?.message ?? 'Unknown GraphQL error';
    const code = errors[0]?.code;

    if (code === 1675039) {
      throw ToolError.validation(`Query blocked: ${msg}`);
    }
    if (msg.includes('not authenticated') || msg.includes('session') || code === 190) {
      clearAuthCache('facebook');
      throw ToolError.auth(msg);
    }
    throw ToolError.internal(`Facebook GraphQL error: ${msg}`);
  }

  return (first.data ?? first) as T;
};

// ---------------------------------------------------------------------------
// Search API (uses a different stable endpoint)
// ---------------------------------------------------------------------------

export const searchTypeahead = async (query: string): Promise<Array<Record<string, unknown>>> => {
  const auth = requireAuth();

  const qs = buildQueryString({
    value: query,
    viewer: auth.userId,
    rsp: 'search',
    context: 'search',
    sid: '',
    __a: '1',
    fb_dtsg: auth.fbDtsg,
    lsd: auth.lsd,
  });

  const resp = await fetch(`/ajax/typeahead/search/facebar/query/?${qs}`, {
    credentials: 'include',
    headers: { 'X-FB-LSD': auth.lsd },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw ToolError.internal(`Facebook search returned HTTP ${resp.status}.`);
  }

  const text = await resp.text();
  const cleaned = text.replace(/^for \(;;\);/, '');
  try {
    const data = JSON.parse(cleaned) as {
      payload?: { entries?: Array<Record<string, unknown>> };
    };
    return data?.payload?.entries ?? [];
  } catch {
    return [];
  }
};
