import { graphql } from '../linear-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapTeam, teamSchema } from './schemas.js';

export const listTeams = defineTool({
  name: 'list_teams',
  displayName: 'List Teams',
  description: 'List all teams in the Linear workspace that the current user can access.',
  summary: 'List teams in the workspace',
  icon: 'users',
  group: 'Teams & Users',
  input: z.object({}),
  output: z.object({
    teams: z.array(teamSchema).describe('List of teams'),
  }),
  handle: async () => {
    const data = await graphql<{
      teams: { nodes: Record<string, unknown>[] };
    }>(
      `query ListTeams {
        teams {
          nodes {
            id key name description
          }
        }
      }`,
    );

    return {
      teams: data.teams.nodes.map(n => mapTeam(n as Parameters<typeof mapTeam>[0])),
    };
  },
});
