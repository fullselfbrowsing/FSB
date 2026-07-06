import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description: 'Get detailed information about the current Sentry organization including name, slug, and status.',
  summary: 'Get details for the current organization',
  icon: 'building-2',
  group: 'Organizations',
  input: z.object({}),
  output: z.object({
    organization: organizationSchema.describe('The organization details'),
  }),
  handle: async () => {
    const orgSlug = getOrgSlug();
    const { data } = await sentryApi<Record<string, unknown>>(`/organizations/${orgSlug}/`);
    return { organization: mapOrganization(data) };
  },
});
