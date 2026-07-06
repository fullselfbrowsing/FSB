import { getAuthCache, getPageGlobal, setAuthCache, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface NetflixAuth {
  authURL: string;
  guid: string;
  name: string;
  membershipStatus: string;
}

/**
 * Extract auth from `window.netflix.reactContext.models.memberContext.data.userInfo`.
 * Netflix uses HttpOnly session cookies for API requests. The authURL token from
 * the page global is used by the SPA's Falcor pathEvaluator model internally.
 */
const getAuth = (): NetflixAuth | null => {
  const cached = getAuthCache<NetflixAuth>('netflix');
  if (cached?.authURL && cached?.guid) return cached;

  const userInfo = getPageGlobal('netflix.reactContext.models.memberContext.data.userInfo') as
    | Record<string, unknown>
    | undefined;
  if (!userInfo) return null;

  const authURL = userInfo.authURL as string | undefined;
  const guid = (userInfo.guid ?? userInfo.userGuid) as string | undefined;
  if (!authURL || !guid) return null;

  const membershipStatus = (userInfo.membershipStatus as string | undefined) ?? '';
  if (membershipStatus !== 'CURRENT_MEMBER') return null;

  const auth: NetflixAuth = {
    authURL,
    guid,
    name: (userInfo.name as string | undefined) ?? '',
    membershipStatus,
  };
  setAuthCache('netflix', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForNetflixAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// --- Apollo Cache Reader ---

/**
 * Read a title (Movie or Show) from the Apollo Client cache by video ID.
 * The Apollo cache stores titles with keys like `Movie:{"videoId":12345}`
 * or `Show:{"videoId":12345}`. Returns null if not cached.
 */
export const readApolloTitle = (videoId: number): Record<string, unknown> | null => {
  const client = getPageGlobal('netflix.appContext.state.graphqlClient') as {
    cache?: { extract: () => Record<string, Record<string, unknown>> };
  } | null;

  if (!client?.cache) return null;

  const cache = client.cache.extract();
  return cache[`Movie:{"videoId":${videoId}}`] ?? cache[`Show:{"videoId":${videoId}}`] ?? null;
};

/**
 * Get the authenticated user's profile info from page globals.
 */
export const getUserInfo = (): Record<string, unknown> | null => {
  return (getPageGlobal('netflix.reactContext.models.memberContext.data.userInfo') as Record<string, unknown>) ?? null;
};
