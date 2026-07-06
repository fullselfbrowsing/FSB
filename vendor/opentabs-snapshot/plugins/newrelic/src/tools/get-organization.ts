import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { mapOrganization, organizationSchema } from './schemas.js';
import type { RawOrganization } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description: 'Get the current New Relic organization details including ID and name.',
  summary: 'Get organization details',
  icon: 'landmark',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    organization: organizationSchema.describe('Organization details'),
  }),
  handle: async () => {
    const data = await graphql<{
      actor: { organization: RawOrganization };
    }>(`{ actor { organization { id name } } }`);
    return { organization: mapOrganization(data.actor.organization ?? {}) };
  },
});
