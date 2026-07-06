import { defineTool, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const diagnose = defineTool({
  name: 'diagnose',
  displayName: 'Diagnose Connection',
  description:
    'Diagnose the Snowflake browser adapter connection. Returns whether the internal Snowflake app state is available, the authenticated user, API server URL, and available internal APIs. Use this to debug connectivity issues when other Snowflake tools fail.',
  summary: 'Diagnose Snowflake connection state',
  icon: 'stethoscope',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    available: z.boolean().describe('Whether window.numeracy is available'),
    url: z.string().describe('Current page URL'),
    hasRequestContext: z.boolean().describe('Whether the request context API is available'),
    appServerUrl: z.string().describe('Snowflake API server URL (empty if unavailable)'),
    role: z.string().describe('Active role (empty if unavailable)'),
    hasUser: z.boolean().describe('Whether user info is available'),
    orgId: z.string().describe('Organization ID (empty if unavailable)'),
    storeKeys: z.array(z.string()).describe('Available Snowflake internal store names'),
    hasNufetch: z.boolean().describe('Whether the nufetch transport is available'),
  }),
  handle: async () => {
    const numeracy = getPageGlobal('numeracy') as Record<string, unknown> | undefined;
    if (!numeracy) {
      return {
        available: false,
        url: typeof window !== 'undefined' ? window.location.href : '',
        hasRequestContext: false,
        appServerUrl: '',
        role: '',
        hasUser: false,
        orgId: '',
        storeKeys: [],
        hasNufetch: false,
      };
    }

    const backendHttp = (numeracy.api as Record<string, unknown> | undefined)?.backendHttp as
      | Record<string, unknown>
      | undefined;

    let appServerUrl = '';
    let role = '';
    const hasRequestContext = typeof backendHttp?.getRequestContext === 'function';
    if (hasRequestContext) {
      try {
        const ctx = (backendHttp.getRequestContext as () => Record<string, unknown>)();
        appServerUrl = (ctx.appServerUrl as string) ?? '';
        role = (ctx.role as string) ?? '';
      } catch {
        // Context unavailable
      }
    }

    const pageState = numeracy.pageState as Record<string, unknown> | undefined;
    const user = pageState?.user as Record<string, unknown> | undefined;
    const stores = numeracy.stores as Record<string, unknown> | undefined;
    const org = (stores?.organization as Record<string, unknown> | undefined)?.activeOrg as
      | Record<string, unknown>
      | undefined;

    return {
      available: true,
      url: typeof window !== 'undefined' ? window.location.href : '',
      hasRequestContext,
      appServerUrl,
      role,
      hasUser: !!user?.id,
      orgId: (org?.id as string) ?? '',
      storeKeys: stores ? Object.keys(stores) : [],
      hasNufetch: typeof numeracy.nufetch === 'function',
    };
  },
});
