import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orgApi } from '../claude-api.js';
import { type RawProject, mapProject, projectSchema } from './schemas.js';

export const updateProject = defineTool({
  name: 'update_project',
  displayName: 'Update Project',
  description:
    'Update a project name or description. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update a project',
  icon: 'folder-pen',
  group: 'Projects',
  input: z.object({
    project_uuid: z.string().describe('Project UUID to update'),
    name: z.string().optional().describe('New project name'),
    description: z.string().optional().describe('New project description'),
  }),
  output: z.object({
    project: projectSchema.describe('The updated project'),
  }),
  handle: async ({ project_uuid, name, description }) => {
    const data = await orgApi<RawProject>(`/projects/${project_uuid}`, {
      method: 'PUT',
      body: stripUndefined({ name, description }),
    });
    return { project: mapProject(data) };
  },
});
