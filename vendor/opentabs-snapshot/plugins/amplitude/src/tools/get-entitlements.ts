import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { type RawEntitlement, entitlementSchema, mapEntitlement } from './schemas.js';

const QUERY = `query GetActiveOrgEntitlements {
  getActiveOrgEntitlements {
    type source plan quota quotaType startTime endTime
  }
}`;

export const getEntitlements = defineTool({
  name: 'get_entitlements',
  displayName: 'Get Entitlements',
  description:
    'Get active entitlements for the organization including analytics, experiment, and session replay quotas with their limits and time ranges.',
  summary: 'Get active org entitlements and quotas',
  icon: 'shield-check',
  group: 'Billing',
  input: z.object({}),
  output: z.object({
    entitlements: z.array(entitlementSchema).describe('List of active entitlements'),
  }),
  handle: async () => {
    const data = await gql<{
      getActiveOrgEntitlements: RawEntitlement[];
    }>('GetActiveOrgEntitlements', QUERY);
    return {
      entitlements: (data.getActiveOrgEntitlements ?? []).map(mapEntitlement),
    };
  },
});
