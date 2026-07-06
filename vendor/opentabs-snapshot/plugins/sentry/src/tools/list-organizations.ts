import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { sentryApi } from '../sentry-api.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const listOrganizations = defineTool({
  name: 'list_organizations',
  displayName: 'List Organizations',
  description: 'List all Sentry organizations the current user belongs to. Returns org name, slug, and status.',
  summary: 'List organizations the user belongs to',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    organizations: z.array(organizationSchema).describe('List of organizations'),
  }),
  handle: async params => {
    const { data } = await sentryApi<Record<string, unknown>[]>('/organizations/', {
      query: { cursor: params.cursor },
    });
    return {
      organizations: (Array.isArray(data) ? data : []).map(o => mapOrganization(o)),
    };
  },
});
