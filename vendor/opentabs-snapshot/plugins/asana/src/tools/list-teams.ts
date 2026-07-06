import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawTeam, mapTeam, teamSchema } from './schemas.js';

export const listTeams = defineTool({
  name: 'list_teams',
  displayName: 'List Teams',
  description: 'List all teams in a workspace.',
  summary: 'List teams in a workspace',
  icon: 'users',
  group: 'Teams',
  input: z.object({
    workspace_gid: z.string().min(1).describe('Workspace GID to list teams for'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of teams to return (default 20, max 100)'),
    offset: z.string().optional().describe('Pagination offset token from a previous response'),
  }),
  output: z.object({
    teams: z.array(teamSchema).describe('List of teams in the workspace'),
    next_page: z.string().nullable().describe('Offset token for the next page, or null if no more results'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawTeam>>(`/workspaces/${params.workspace_gid}/teams`, {
      query: {
        opt_fields: 'name,description',
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      teams: (data.data ?? []).map(mapTeam),
      next_page: data.next_page?.offset ?? null,
    };
  },
});
