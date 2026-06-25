import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description:
    'Get details about the current Calendly organization including name, tier, trial status, and owner information.',
  summary: 'Get the current organization details',
  icon: 'building-2',
  group: 'Organization',
  input: z.object({}),
  output: z.object({ organization: organizationSchema }),
  handle: async () => {
    const data = await api<Record<string, unknown>>('/organization');
    return { organization: mapOrganization(data) };
  },
});
