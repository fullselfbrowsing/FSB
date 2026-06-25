import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { armApi } from '../azure-api.js';
import { type ArmListResponse, type RawTenant, mapTenant, tenantSchema } from './schemas.js';

export const listTenants = defineTool({
  name: 'list_tenants',
  displayName: 'List Tenants',
  description:
    'List all Azure Active Directory tenants accessible to the current user. Returns tenant ID, display name, default domain, and category.',
  summary: 'List all Azure AD tenants',
  icon: 'building-2',
  group: 'Tenants',
  input: z.object({}),
  output: z.object({
    tenants: z.array(tenantSchema).describe('List of tenants'),
  }),
  handle: async () => {
    const data = await armApi<ArmListResponse<RawTenant>>('/tenants', {
      apiVersion: '2020-01-01',
      query: { $includeAllTenantCategories: true },
    });
    return { tenants: (data.value ?? []).map(mapTenant) };
  },
});
