import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapWorkflowState, workflowStateSchema } from './schemas.js';

export const listWorkflowStates = defineTool({
  name: 'list_workflow_states',
  displayName: 'List Workflow States',
  description:
    'List all workflow states for a team. Use this to find state IDs for filtering issues or updating issue state.',
  summary: 'List workflow states for a team',
  icon: 'git-branch',
  group: 'Workflow',
  input: z.object({
    team_id: z.string().describe('Team UUID to list workflow states for (use list_teams to find IDs)'),
  }),
  output: z.object({
    states: z.array(workflowStateSchema).describe('List of workflow states ordered by position'),
  }),
  handle: async params => {
    const data = await graphql<{
      team: {
        states: { nodes: Record<string, unknown>[] };
      };
    }>(
      `query ListWorkflowStates($id: String!) {
        team(id: $id) {
          states {
            nodes {
              id name type color position
            }
          }
        }
      }`,
      { id: params.team_id },
    );

    if (!data.team) throw ToolError.notFound('Team not found');
    const nodes = data.team.states.nodes
      .map(n => mapWorkflowState(n as Parameters<typeof mapWorkflowState>[0]))
      .sort((a, b) => a.position - b.position);

    return { states: nodes };
  },
});
