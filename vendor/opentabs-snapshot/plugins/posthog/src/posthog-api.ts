import {
  ToolError,
  fetchJSON,
  buildQueryString,
  getCookie,
  getPageGlobal,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';
import type { FetchFromPageOptions } from '@opentabs-dev/plugin-sdk';

// --- Auth ---

interface PostHogAuth {
  csrfToken: string;
  teamId: number;
  orgId: string;
}

const getAuth = (): PostHogAuth | null => {
  const cached = getAuthCache<PostHogAuth>('posthog');
  if (cached) return cached;

  const csrfToken = getCookie('posthog_csrftoken');
  if (!csrfToken) return null;

  const teamId = (getPageGlobal('POSTHOG_APP_CONTEXT.current_team.id') as number | undefined) ?? 0;
  const orgId = (getPageGlobal('POSTHOG_APP_CONTEXT.current_project.organization_id') as string | undefined) ?? '';
  if (!teamId) return null;

  const auth: PostHogAuth = { csrfToken, teamId, orgId };
  setAuthCache('posthog', auth);
  return auth;
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

export const getTeamId = (): number => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to PostHog.');
  return auth.teamId;
};

export const getOrgId = (): string => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to PostHog.');
  return auth.orgId;
};

// --- API caller ---

/**
 * PostHog uses two URL patterns:
 * - /api/environments/:teamId/... for dashboards, insights, persons, events
 * - /api/projects/:teamId/... for feature flags, experiments, annotations, actions, cohorts, surveys
 * The teamId and projectId are interchangeable in PostHog Cloud.
 */
export const api = async <T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | string[] | undefined>;
  } = {},
): Promise<T> => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to PostHog.');

  const qs = options.query ? buildQueryString(options.query) : '';
  const url = qs ? `${endpoint}?${qs}` : endpoint;

  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (method !== 'GET') {
    headers['X-CSRFToken'] = auth.csrfToken;
  }

  const init: FetchFromPageOptions = { method, headers };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  try {
    const data = await fetchJSON(url, init);
    return data as T;
  } catch (error) {
    if (error instanceof ToolError && error.category === 'auth') {
      clearAuthCache('posthog');
    }
    throw error;
  }
};

/**
 * Soft-delete a PostHog resource. Most DELETE endpoints return 405;
 * the convention is PATCH with { deleted: true }.
 */
export const softDelete = async (endpoint: string): Promise<void> => {
  await api(endpoint, { method: 'PATCH', body: { deleted: true } });
};
