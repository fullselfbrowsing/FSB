import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../posthog-api.js';
import { type RawOrganization, mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description: 'Get details about the current PostHog organization including name and membership level.',
  summary: 'Get current organization info',
  icon: 'building-2',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    organization: organizationSchema.describe('The organization details'),
  }),
  handle: async () => {
    const data = await api<RawOrganization>('/api/organizations/@current/');
    return { organization: mapOrganization(data) };
  },
});
