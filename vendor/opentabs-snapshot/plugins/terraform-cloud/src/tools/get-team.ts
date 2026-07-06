import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawTeam } from './schemas.js';
import { mapTeam, teamSchema } from './schemas.js';

export const getTeam = defineTool({
  name: 'get_team',
  displayName: 'Get Team',
  description: 'Get detailed information about a team including member count and visibility.',
  summary: 'Get team details',
  icon: 'users',
  group: 'Teams',
  input: z.object({
    team_id: z.string().describe('Team ID (e.g., "team-...")'),
  }),
  output: z.object({
    team: teamSchema.describe('Team details'),
  }),
  handle: async params => {
    const res = await api<JsonApiResponse<RawTeam>>(`/teams/${encodeURIComponent(params.team_id)}`);
    return { team: mapTeam(res.data.id, res.data.attributes) };
  },
});
