import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConsoleProto, grpc } from '../cockroachdb-api.js';
import type { RawMember } from './schemas.js';
import { mapMember, memberSchema } from './schemas.js';

export const listOrgUsers = defineTool({
  name: 'list_org_users',
  displayName: 'List Organization Members',
  description: 'List all members of the current CockroachDB Cloud organization with their email addresses and names.',
  summary: 'List organization members',
  icon: 'users',
  group: 'Organization',
  input: z.object({}),
  output: z.object({ members: z.array(memberSchema).describe('List of organization members') }),
  handle: async () => {
    const p = getConsoleProto();
    const data = await grpc<{ usersList?: RawMember[] }>('ListOrgUsers', p.ListOrgUsersResponse);
    return { members: (data.usersList ?? []).map(mapMember) };
  },
});
