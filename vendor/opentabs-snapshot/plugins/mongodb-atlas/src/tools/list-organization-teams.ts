import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../atlas-api.js';
import { type RawTeam, mapTeam, teamSchema } from './schemas.js';

export const listOrganizationTeams = defineTool({
  name: 'list_organization_teams',
  displayName: 'List Organization Teams',
  description: 'List all teams in the current MongoDB Atlas organization with member counts.',
  summary: 'List teams in the organization',
  icon: 'users',
  group: 'Organizations',
  input: z.object({}),
  output: z.object({ teams: z.array(teamSchema).describe('Organization teams') }),
  handle: async () => {
    const orgId = getOrgId();
    const raw = await api<RawTeam[]>(`/orgs/${orgId}/teams`);
    return { teams: (raw ?? []).map(mapTeam) };
  },
});
