import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { projectListItemSchema, mapProjectListItem } from './schemas.js';

export const listProjects = defineTool({
  name: 'list_projects',
  displayName: 'List Projects',
  description: 'List all projects accessible to the current user, including latest test run info.',
  summary: 'List projects',
  icon: 'folder',
  group: 'Projects',
  input: z.object({}),
  output: z.object({ projects: z.array(projectListItemSchema) }),
  handle: async () => {
    const data = await graphql<{ projects: Array<Record<string, unknown>> }>(queries.GET_PROJECTS);
    return { projects: data.projects.map(mapProjectListItem) };
  },
});
