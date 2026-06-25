import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc } from '../cockroachdb-api.js';
import type { RawOrganization } from './schemas.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description:
    'Get details about the current CockroachDB Cloud organization including name, label, billing plan, and creation date.',
  summary: 'Get current organization details',
  icon: 'building-2',
  group: 'Organization',
  input: z.object({}),
  output: z.object({ organization: organizationSchema }),
  handle: async () => {
    const p = getConsoleProto();
    const data = await grpc<{ organization?: RawOrganization }>('GetOrganization', p.GetOrganizationResponse);
    return { organization: mapOrganization(data.organization ?? {}) };
  },
});
