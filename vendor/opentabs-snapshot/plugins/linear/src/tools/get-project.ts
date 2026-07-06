import { graphql } from '../linear-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapProject, projectSchema } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a single Linear project by its UUID.',
  summary: 'Get details of a project',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('Project UUID'),
  }),
  output: z.object({
    project: projectSchema.describe('The requested project'),
  }),
  handle: async params => {
    const data = await graphql<{ project: Record<string, unknown> }>(
      `query GetProject($id: String!) {
        project(id: $id) {
          id name description url createdAt updatedAt
          targetDate startDate
          status { name }
          lead { name displayName }
        }
      }`,
      { id: params.project_id },
    );

    return { project: mapProject(data.project as Parameters<typeof mapProject>[0]) };
  },
});
