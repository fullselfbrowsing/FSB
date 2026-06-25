import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';

const entitlementSchema = z.object({
  feature_id: z.string().describe('Feature identifier'),
  display_name: z.string().describe('Human-readable feature name'),
  has_access: z.boolean().describe('Whether the workspace has access to this feature'),
  limit: z.number().describe('Usage limit for this feature (0 if unlimited or boolean feature)'),
  current_usage: z.number().describe('Current usage count'),
});

interface RawEntitlement {
  feature?: { id?: string; displayName?: string };
  hasAccess?: boolean;
  entitlementLimit?: number;
  currentUsage?: number;
}

type EntitlementsResponse = Record<string, RawEntitlement>;

export const getWorkspaceEntitlements = defineTool({
  name: 'get_workspace_entitlements',
  displayName: 'Get Workspace Entitlements',
  description:
    'Get the feature entitlements for a Webflow workspace. Shows which features are available on the current plan with usage limits and current consumption (e.g., max sites, max pages, logic flows).',
  summary: 'Get workspace feature entitlements',
  icon: 'badge-check',
  group: 'Workspaces',
  input: z.object({
    workspace_slug: z.string().describe('Workspace URL slug'),
  }),
  output: z.object({
    entitlements: z.array(entitlementSchema),
  }),
  handle: async params => {
    const data = await api<EntitlementsResponse>(`/workspaces/${params.workspace_slug}/entitlements`);
    const entitlements = Object.entries(data).map(([key, val]) => ({
      feature_id: val.feature?.id ?? key,
      display_name: val.feature?.displayName ?? key,
      has_access: val.hasAccess ?? false,
      limit: val.entitlementLimit ?? 0,
      current_usage: val.currentUsage ?? 0,
    }));
    return { entitlements };
  },
});
