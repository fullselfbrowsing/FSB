import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getFromCache, getOrgId } from '../clickhouse-api.js';
import type { RawOrganization } from './schemas.js';
import { mapOrganization, organizationSchema } from './schemas.js';

export const getOrganization = defineTool({
  name: 'get_organization',
  displayName: 'Get Organization',
  description:
    'Get details about the current ClickHouse Cloud organization including billing status, tier, and trial info.',
  summary: 'Get organization details',
  icon: 'building-2',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    organization: organizationSchema,
  }),
  handle: async () => {
    const orgId = getOrgId();
    if (!orgId) throw ToolError.auth('No organization selected — please open ClickHouse Cloud console.');

    const orgs = getFromCache<RawOrganization[]>('organizations');
    if (!orgs) throw ToolError.notFound('Organization data not found in cache — please reload the console.');

    const org = orgs.find(o => o.id === orgId);
    if (!org) throw ToolError.notFound(`Organization ${orgId} not found in cache.`);

    return { organization: mapOrganization(org) };
  },
});
