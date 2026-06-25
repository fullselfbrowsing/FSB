import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../shortcut-api.js';
import { type RawTeam, mapTeam, teamSchema } from './schemas.js';

export const listTeams = defineTool({
  name: 'list_teams',
  displayName: 'List Teams',
  description: 'List all teams (groups) in the workspace. Teams organize members and are associated with workflows.',
  summary: 'List all teams',
  icon: 'users',
  group: 'Teams',
  input: z.object({}),
  output: z.object({ teams: z.array(teamSchema).describe('All teams') }),
  handle: async () => {
    const data = await api<RawTeam[]>('/groups');
    return { teams: (data ?? []).map(mapTeam) };
  },
});
