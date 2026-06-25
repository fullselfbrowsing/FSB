import {
  ToolError,
  fetchJSON,
  fetchFromPage,
  getPageGlobal,
  waitUntil,
  getAuthCache,
  setAuthCache,
  clearAuthCache,
  buildQueryString,
} from '@opentabs-dev/plugin-sdk';

// --- GraphQL context ---
// Every Expedia GraphQL query requires a ContextInput that identifies the site,
// locale, currency, device, and auth state. This is extracted from the SSR-injected
// __PLUGIN_STATE__.context.context page global.

export interface ExpediaContext {
  siteId: number;
  locale: string;
  eapid: number;
  tpid: number;
  currency: string;
  device: { type: string };
  identity: { duaid: string; authState: string };
  privacyTrackingState: string;
}

const getContext = (): ExpediaContext | null => {
  const cached = getAuthCache<ExpediaContext>('expedia');
  if (cached) return cached;

  const state = getPageGlobal('__PLUGIN_STATE__') as { context?: { context?: Record<string, unknown> } } | undefined;
  const ctx = state?.context?.context;
  if (!ctx) return null;

  const site = ctx.site as { id?: number; tpid?: number } | undefined;
  const user = ctx.user as { authState?: string } | undefined;
  const deviceId = ctx.deviceId as string | undefined;

  if (user?.authState !== 'AUTHENTICATED') return null;

  const expCtx: ExpediaContext = {
    siteId: site?.id ?? 1,
    locale: (ctx.locale as string) ?? 'en_US',
    eapid: (site as { eapid?: number } | undefined)?.eapid ?? 0,
    tpid: site?.tpid ?? 1,
    currency: (ctx.currency as string) ?? 'USD',
    device: { type: 'DESKTOP' },
    identity: {
      duaid: deviceId ?? '',
      authState: 'AUTHENTICATED',
    },
    privacyTrackingState: (ctx.privacyTrackingState as string) ?? 'CAN_TRACK',
  };

  setAuthCache('expedia', expCtx);
  return expCtx;
};

export const isAuthenticated = (): boolean => getContext() !== null;

export const waitForAuth = async (): Promise<boolean> => {
  try {
    await waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

const requireContext = (): ExpediaContext => {
  const ctx = getContext();
  if (!ctx) {
    clearAuthCache('expedia');
    throw ToolError.auth('Not authenticated — please log in to Expedia.');
  }
  return ctx;
};

// --- GraphQL API ---
// Expedia's BFF GraphQL endpoint accepts batched queries as an array.
// All queries require a ContextInput variable.

const GRAPHQL_URL = '/graphql';

export const graphql = async <T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> => {
  const ctx = requireContext();
  const allVars = { context: ctx, ...variables };

  const response = await fetchFromPage(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-info': 'blossom-flex-ui',
    },
    body: JSON.stringify([{ operationName, query, variables: allVars }]),
  });

  const body = (await response.json()) as Array<{
    data?: Record<string, unknown>;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  }>;

  const result = body[0];
  if (!result) throw ToolError.internal('Empty GraphQL response');

  if (result.errors?.length && !result.data) {
    const msg = result.errors.map(e => e.message).join('; ');
    const code = result.errors[0]?.extensions?.code;
    if (code === 'UNAUTHENTICATED' || msg.includes('auth')) {
      clearAuthCache('expedia');
      throw ToolError.auth(`GraphQL auth error: ${msg}`);
    }
    throw ToolError.internal(`GraphQL error: ${msg}`);
  }

  return (result.data ?? {}) as T;
};

// --- REST typeahead API ---
// Location suggestion endpoint returning structured region/airport/hotel results.

const TYPEAHEAD_BASE = '/api/v4/typeahead';

export const typeahead = async <T>(
  query: string,
  options: {
    client?: string;
    lob?: string;
    maxresults?: number;
    locale?: string;
  } = {},
): Promise<T> => {
  const ctx = requireContext();

  const qs = buildQueryString({
    client: options.client ?? 'Homepage',
    lob: options.lob ?? 'HOTELS',
    maxresults: options.maxresults ?? 10,
    locale: ctx?.locale ?? 'en_US',
  });

  const url = `${TYPEAHEAD_BASE}/${encodeURIComponent(query)}?${qs}`;
  const data = await fetchJSON<T>(url);
  return data as T;
};

// --- Apollo state reference resolver ---
// Resolves __ref pointers in Apollo normalized cache.

export const resolveRef = (ref: unknown, state: Record<string, unknown>, depth = 0): unknown => {
  if (depth > 10) return ref;
  if (ref === null || ref === undefined) return ref;
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'number' || typeof ref === 'boolean') return ref;

  if (Array.isArray(ref)) {
    return ref.map(item => resolveRef(item, state, depth + 1));
  }

  if (typeof ref === 'object') {
    const obj = ref as Record<string, unknown>;
    if (obj.__ref && typeof obj.__ref === 'string') {
      const resolved = state[obj.__ref];
      if (resolved) return resolveRef(resolved, state, depth + 1);
      return obj.__ref;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveRef(value, state, depth + 1);
    }
    return result;
  }

  return ref;
};
