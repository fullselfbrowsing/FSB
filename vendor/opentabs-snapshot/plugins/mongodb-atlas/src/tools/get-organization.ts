import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../atlas-api.js';
import { type RawOrganization, mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description:
    'Get detailed information about the current MongoDB Atlas organization including name, plan type, MFA status, and payment status.',
  summary: 'Get current organization details',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({}),
  output: z.object({ organization: organizationSchema.describe('The organization') }),
  handle: async () => {
    const orgId = getOrgId();
    const raw = await api<RawOrganization>(`/orgs/${orgId}`);
    return { organization: mapOrganization(raw) };
  },
});
