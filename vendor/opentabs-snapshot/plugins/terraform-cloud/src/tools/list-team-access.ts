import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import type { RawTeamAccess } from './schemas.js';
import { mapTeamAccess, teamAccessSchema } from './schemas.js';

export const listTeamAccess = defineTool({
  name: 'list_team_access',
  displayName: 'List Team Access',
  description:
    'List team access permissions for a workspace. Shows which teams have access and their permission levels.',
  summary: 'List team access for a workspace',
  icon: 'shield',
  group: 'Teams',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
  }),
  output: z.object({
    team_access: z.array(teamAccessSchema).describe('List of team access entries'),
  }),
  handle: async params => {
    const res = await api<JsonApiListResponse<RawTeamAccess>>('/team-workspaces', {
      query: {
        'filter[workspace][id]': params.workspace_id,
      },
    });

    return {
      team_access: res.data.map(r => {
        const teamData = r.relationships?.team?.data;
        const workspaceData = r.relationships?.workspace?.data;
        const teamId = teamData && !Array.isArray(teamData) ? teamData.id : '';
        const workspaceId = workspaceData && !Array.isArray(workspaceData) ? workspaceData.id : '';
        return mapTeamAccess(r.id, r.attributes, teamId, workspaceId);
      }),
    };
  },
});
