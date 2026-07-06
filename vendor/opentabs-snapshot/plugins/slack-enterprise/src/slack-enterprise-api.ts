import {
  ToolError,
  getAuthCache,
  getLocalStorage,
  getPageGlobal,
  parseRetryAfterMs,
  setAuthCache,
  waitUntil,
} from '@opentabs-dev/plugin-sdk';

/**
 * Enterprise Slack authentication with both workspace and enterprise tokens.
 * Enterprise Grid stores two entries in localStorage:
 *   - E-prefix team ID → enterprise org token (restricted for most APIs)
 *   - T-prefix team ID → workspace token (works for channels, users, messages, etc.)
 */
interface EnterpriseSlackAuth {
  workspaceToken: string;
  workspaceTeamId: string;
  workspaceUrl: string;
  enterpriseToken: string | null;
  enterpriseId: string;
}

interface LocalConfigTeam {
  token: string;
  url: string;
  name: string;
}

interface LocalConfig {
  teams?: Record<string, LocalConfigTeam>;
  lastActiveTeamId?: string;
}

interface SlackBootData {
  api_token?: string;
  team_id?: string;
  team_url?: string;
  enterprise_id?: string;
  [key: string]: unknown;
}

interface UserBootResponse {
  ok: boolean;
  default_workspace?: string;
  workspaces?: Array<{ id: string; enterprise_id?: string }>;
}

const AUTH_CACHE_KEY = 'slack-enterprise';

/**
 * Discover the default workspace team ID via client.userBoot API.
 * The enterprise org token is needed for this call since it operates
 * at the org level. Caches the result in the auth cache.
 */
const discoverWorkspaceTeamId = async (enterpriseToken: string, enterpriseId: string): Promise<string | null> => {
  try {
    const form = new URLSearchParams();
    form.append('token', enterpriseToken);
    form.append('_x_reason', 'api_call');
    form.append('_x_mode', 'online');
    form.append('_x_sonic', 'true');
    form.append('_x_app_name', 'client');
    form.append('_x_team_id', enterpriseId);

    const signal = AbortSignal.timeout(15_000);
    const response = await fetch('/api/client.userBoot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      credentials: 'include',
      signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as UserBootResponse;
    if (!data.ok) return null;

    return data.default_workspace ?? data.workspaces?.[0]?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Extract enterprise auth from localConfig_v2/v3 in localStorage.
 * Identifies the enterprise org (E-prefix) and workspace (T-prefix) entries,
 * preferring the workspace token for API calls.
 */
const getAuthFromLocalConfig = async (): Promise<EnterpriseSlackAuth | null> => {
  try {
    let raw: string | null = null;
    for (const key of ['localConfig_v2', 'localConfig_v3']) {
      raw = getLocalStorage(key);
      if (raw) break;
    }
    if (!raw) return null;

    const config = JSON.parse(raw) as LocalConfig;
    if (!config.teams) return null;

    const teamIds = Object.keys(config.teams);

    // Find enterprise org entry (E-prefix) and workspace entries (T-prefix)
    const enterpriseId = teamIds.find(id => id.startsWith('E'));
    if (!enterpriseId) return null; // Not an enterprise workspace

    const workspaceIds = teamIds.filter(id => id.startsWith('T'));

    // Get enterprise token
    const enterpriseTeam = config.teams[enterpriseId];
    const enterpriseToken = enterpriseTeam?.token ?? null;

    // Find workspace token — prefer explicitly listed T-prefix teams
    let workspaceTeamId: string | null = null;
    let workspaceToken: string | null = null;
    let workspaceUrl = '';

    if (workspaceIds.length > 0) {
      const firstWsId = workspaceIds[0] as string;
      workspaceTeamId = firstWsId;
      const wsTeam = config.teams[firstWsId];
      workspaceToken = wsTeam?.token ?? null;
      workspaceUrl = wsTeam?.url ?? '';
    }

    // If no T-prefix team found, try discovering via client.userBoot
    if (!workspaceToken && enterpriseToken) {
      const discoveredId = await discoverWorkspaceTeamId(enterpriseToken, enterpriseId);
      if (discoveredId && config.teams[discoveredId]) {
        workspaceTeamId = discoveredId;
        const wsTeam = config.teams[discoveredId];
        workspaceToken = wsTeam?.token ?? null;
        workspaceUrl = wsTeam?.url ?? '';
      }
    }

    // Fall back to enterprise token if no workspace token found
    if (!workspaceToken && enterpriseToken) {
      workspaceToken = enterpriseToken;
      workspaceTeamId = enterpriseId;
      workspaceUrl = enterpriseTeam?.url ?? '';
    }

    if (!workspaceToken || !workspaceTeamId) return null;

    return {
      workspaceToken,
      workspaceTeamId,
      workspaceUrl: workspaceUrl.replace(/\/$/, '') || window.location.origin,
      enterpriseToken,
      enterpriseId,
    };
  } catch {
    return null;
  }
};

/**
 * Try extracting auth from boot_data globals set by the Slack web client.
 * Only returns auth if the workspace is enterprise (has enterprise_id).
 */
const getAuthFromBootData = (): EnterpriseSlackAuth | null => {
  try {
    const bootData = getPageGlobal('boot_data') as SlackBootData | undefined;
    if (!bootData?.api_token || typeof bootData.api_token !== 'string') return null;
    if (!bootData.api_token.startsWith('xoxc-')) return null;
    if (!bootData.enterprise_id) return null;

    const teamId = typeof bootData.team_id === 'string' ? bootData.team_id : '';
    const teamUrl = typeof bootData.team_url === 'string' ? bootData.team_url.replace(/\/$/, '') : '';

    return {
      workspaceToken: bootData.api_token,
      workspaceTeamId: teamId,
      workspaceUrl: teamUrl || window.location.origin,
      enterpriseToken: null,
      enterpriseId: bootData.enterprise_id,
    };
  } catch {
    return null;
  }
};

/**
 * Read enterprise Slack auth from available sources.
 * Checks auth cache first (survives adapter re-injection), then
 * tries localStorage and boot_data globals.
 */
const getAuth = async (): Promise<EnterpriseSlackAuth | null> => {
  const cached = getAuthCache<EnterpriseSlackAuth>(AUTH_CACHE_KEY);
  if (cached) return cached;

  const auth = (await getAuthFromLocalConfig()) ?? getAuthFromBootData();
  if (auth) {
    setAuthCache(AUTH_CACHE_KEY, auth);
  }
  return auth;
};

/**
 * Synchronous auth check for isReady() — checks cache and localStorage
 * without async workspace discovery.
 */
const getAuthSync = (): EnterpriseSlackAuth | null => {
  const cached = getAuthCache<EnterpriseSlackAuth>(AUTH_CACHE_KEY);
  if (cached) return cached;

  // Quick sync check: look for E-prefix team in localStorage
  try {
    let raw: string | null = null;
    for (const key of ['localConfig_v2', 'localConfig_v3']) {
      raw = getLocalStorage(key);
      if (raw) break;
    }
    if (!raw) return null;

    const config = JSON.parse(raw) as LocalConfig;
    if (!config.teams) return null;

    const teamIds = Object.keys(config.teams);
    const hasEnterprise = teamIds.some(id => id.startsWith('E'));
    if (!hasEnterprise) return null;

    // Has enterprise teams — try to build auth synchronously
    const enterpriseId = teamIds.find(id => id.startsWith('E')) as string;
    const workspaceId = teamIds.find(id => id.startsWith('T'));
    const enterpriseTeam = config.teams[enterpriseId];

    if (workspaceId) {
      const wsTeam = config.teams[workspaceId];
      if (wsTeam?.token) {
        const auth: EnterpriseSlackAuth = {
          workspaceToken: wsTeam.token,
          workspaceTeamId: workspaceId,
          workspaceUrl: (wsTeam.url ?? '').replace(/\/$/, '') || window.location.origin,
          enterpriseToken: enterpriseTeam?.token ?? null,
          enterpriseId,
        };
        setAuthCache(AUTH_CACHE_KEY, auth);
        return auth;
      }
    }

    // No T-prefix workspace but enterprise token exists — use it as fallback
    if (enterpriseTeam?.token) {
      const auth: EnterpriseSlackAuth = {
        workspaceToken: enterpriseTeam.token,
        workspaceTeamId: enterpriseId,
        workspaceUrl: (enterpriseTeam.url ?? '').replace(/\/$/, '') || window.location.origin,
        enterpriseToken: enterpriseTeam.token,
        enterpriseId,
      };
      setAuthCache(AUTH_CACHE_KEY, auth);
      return auth;
    }

    return null;
  } catch {
    return null;
  }
};

const isEnterpriseAuthenticated = (): boolean => getAuthSync() !== null;

const waitForEnterpriseAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isEnterpriseAuthenticated(), { interval: 500, timeout: 3000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Call a Slack Web API method using the workspace token.
 * Uses form-encoded POST to match the Slack web client's request format.
 */
const slackApi = async <T extends Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T & { ok: true }> => {
  const auth = await getAuth();
  if (!auth) {
    throw ToolError.auth('Not authenticated — no enterprise Slack session found');
  }

  const form = new URLSearchParams();
  form.append('token', auth.workspaceToken);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean));
    }
  }

  form.append('_x_reason', 'api_call');
  form.append('_x_mode', 'online');
  form.append('_x_sonic', 'true');
  form.append('_x_app_name', 'client');
  form.append('_x_team_id', auth.workspaceTeamId);

  const signal = AbortSignal.timeout(30_000);

  let response: Response;
  try {
    response = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw ToolError.timeout(`slackApi: request timed out after 30000ms for ${method}`);
    }
    if (signal.aborted) {
      throw new ToolError(`slackApi: request aborted for ${method}`, 'aborted');
    }
    throw new ToolError(
      `slackApi: network error for ${method}: ${error instanceof Error ? error.message : String(error)}`,
      'network_error',
      { category: 'internal', retryable: true },
    );
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryMs = retryAfterHeader !== null ? parseRetryAfterMs(retryAfterHeader) : undefined;
    throw ToolError.rateLimited(
      `Slack API rate limited (429)${retryAfterHeader ? `. Retry after ${retryAfterHeader} seconds` : ''}`,
      retryMs,
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    const errorMsg = `Slack API HTTP ${response.status}: ${errorText}`;
    if (response.status === 401 || response.status === 403) {
      throw ToolError.auth(errorMsg);
    } else if (response.status === 404) {
      throw ToolError.notFound(errorMsg);
    } else {
      throw ToolError.internal(errorMsg);
    }
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw ToolError.internal('Failed to parse Slack API response');
  }

  if (typeof data !== 'object' || data === null) {
    throw ToolError.internal('Invalid API response format');
  }

  const record = data as Record<string, unknown>;
  if (record.ok !== true) {
    classifySlackError(record);
  }

  return data as T & { ok: true };
};

/**
 * Call a Slack API method using the enterprise org token.
 * Used for enterprise-level APIs like saved.list that require
 * the E-prefix org token.
 */
const slackEnterpriseApi = async <T extends Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T & { ok: true }> => {
  const auth = await getAuth();
  if (!auth?.enterpriseToken) {
    throw ToolError.auth('No enterprise org token available');
  }

  const form = new URLSearchParams();
  form.append('token', auth.enterpriseToken);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean));
    }
  }

  form.append('_x_reason', 'api_call');
  form.append('_x_mode', 'online');
  form.append('_x_sonic', 'true');
  form.append('_x_app_name', 'client');
  form.append('_x_team_id', auth.enterpriseId);

  const signal = AbortSignal.timeout(30_000);

  let response: Response;
  try {
    response = await fetch(`/api/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw ToolError.timeout(`slackEnterpriseApi: timed out for ${method}`);
    }
    throw new ToolError(
      `slackEnterpriseApi: network error for ${method}: ${error instanceof Error ? error.message : String(error)}`,
      'network_error',
      { category: 'internal', retryable: true },
    );
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryMs = retryAfterHeader !== null ? parseRetryAfterMs(retryAfterHeader) : undefined;
    throw ToolError.rateLimited(`Slack API rate limited (429)`, retryMs);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    const errorMsg = `Slack API HTTP ${response.status}: ${errorText}`;
    if (response.status === 401 || response.status === 403) throw ToolError.auth(errorMsg);
    if (response.status === 404) throw ToolError.notFound(errorMsg);
    throw ToolError.internal(errorMsg);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw ToolError.internal('Failed to parse enterprise Slack API response');
  }

  if (typeof data !== 'object' || data === null) {
    throw ToolError.internal('Invalid API response format');
  }

  const record = data as Record<string, unknown>;
  if (record.ok !== true) {
    classifySlackError(record);
  }

  return data as T & { ok: true };
};

/**
 * Get the enterprise workspace team ID for operations that require it
 * (e.g., channel creation with team_id parameter).
 */
const getWorkspaceTeamId = async (): Promise<string> => {
  const auth = await getAuth();
  if (!auth) throw ToolError.auth('Not authenticated');
  return auth.workspaceTeamId;
};

/**
 * Classify a Slack API error response into the appropriate ToolError type.
 */
const classifySlackError = (record: Record<string, unknown>): never => {
  const error = typeof record.error === 'string' ? record.error : 'unknown_error';
  const errorMsg = `Slack API error: ${error}`;

  if (
    ['not_authed', 'invalid_auth', 'account_inactive', 'token_revoked', 'token_expired', 'missing_scope'].includes(
      error,
    )
  ) {
    throw ToolError.auth(errorMsg);
  }
  if (['channel_not_found', 'user_not_found', 'message_not_found', 'not_in_channel'].includes(error)) {
    throw ToolError.notFound(errorMsg);
  }
  if (error === 'ratelimited') {
    throw ToolError.rateLimited(errorMsg);
  }
  if (['invalid_arguments', 'too_many_attachments', 'msg_too_long', 'no_text', 'invalid_blocks'].includes(error)) {
    throw ToolError.validation(errorMsg);
  }
  throw ToolError.internal(errorMsg);
};

export { isEnterpriseAuthenticated, waitForEnterpriseAuth, slackApi, slackEnterpriseApi, getWorkspaceTeamId };
export type { EnterpriseSlackAuth };
