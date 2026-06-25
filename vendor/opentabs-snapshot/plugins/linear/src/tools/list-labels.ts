import { graphql } from '../linear-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { labelSchema, mapLabel } from './schemas.js';

export const listLabels = defineTool({
  name: 'list_labels',
  displayName: 'List Labels',
  description:
    'List all issue labels in the Linear workspace. Use this to find label IDs for creating or filtering issues.',
  summary: 'List all issue labels',
  icon: 'tag',
  group: 'Workflow',
  input: z.object({}),
  output: z.object({
    labels: z.array(labelSchema).describe('List of issue labels'),
  }),
  handle: async () => {
    const data = await graphql<{
      issueLabels: { nodes: Record<string, unknown>[] };
    }>(
      `query ListLabels {
        issueLabels {
          nodes {
            id name color description isGroup
            parent { name }
          }
        }
      }`,
    );

    return {
      labels: data.issueLabels.nodes.map(n => mapLabel(n as Parameters<typeof mapLabel>[0])),
    };
  },
});
