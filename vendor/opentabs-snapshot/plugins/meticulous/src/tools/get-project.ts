import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { projectSchema, mapProject } from './schemas.js';

export const getProject = defineTool({
  name: 'get_project',
  displayName: 'Get Project',
  description: 'Get detailed information about a specific project including tokens, settings, and configuration.',
  summary: 'Get project details',
  icon: 'folder-open',
  group: 'Projects',
  input: z.object({
    organization_name: z.string().describe('Organization name'),
    project_name: z.string().describe('Project name'),
  }),
  output: z.object({ project: projectSchema }),
  handle: async ({ organization_name, project_name }) => {
    const data = await graphql<{ project: Record<string, unknown> }>(queries.GET_PROJECT, {
      organizationName: organization_name,
      projectName: project_name,
    });
    return { project: mapProject(data.project) };
  },
});
