import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const createProject = defineTool({
  name: 'create_project',
  displayName: 'Create Project',
  description: 'Create a new project in the current organization.',
  summary: 'Create a new project',
  icon: 'folder-plus',
  group: 'Projects',
  input: z.object({
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
  }),
  output: z.object({
    project: projectSchema.describe('The newly created project'),
  }),
  handle: async ({ name, description }) => {
    const data = await orgApi<RawProject>('/projects', {
      method: 'POST',
      body: stripUndefined({ name, description }),
    });
    return { project: mapProject(data) };
  },
});
