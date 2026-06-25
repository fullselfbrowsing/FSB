import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getFromCache, getOrgId } from '../clickhouse-api.js';
import type { RawMember, RawOrganization } from './schemas.js';
import { mapMember, memberSchema } from './schemas.js';

interface RawOrganizationWithUsers extends RawOrganization {
  users?: Record<string, RawMember>;
}

export const listOrganizationMembers = defineTool({
  name: 'list_organization_members',
  displayName: 'List Members',
  description: 'List all members of the current ClickHouse Cloud organization with their roles and email addresses.',
  summary: 'List organization members',
  icon: 'users',
  group: 'Organization',
  input: z.object({}),
  output: z.object({
    members: z.array(memberSchema),
  }),
  handle: async () => {
    const orgId = getOrgId();
    if (!orgId) throw ToolError.auth('No organization selected — please open ClickHouse Cloud console.');

    const orgs = getFromCache<RawOrganizationWithUsers[]>('organizations');
    if (!orgs) throw ToolError.notFound('Organization data not found in cache — please reload the console.');

    const org = orgs.find(o => o.id === orgId);
    if (!org) throw ToolError.notFound(`Organization ${orgId} not found in cache.`);

    const users = org.users ?? {};
    const members = Object.values(users).map(mapMember);

    return { members };
  },
});
