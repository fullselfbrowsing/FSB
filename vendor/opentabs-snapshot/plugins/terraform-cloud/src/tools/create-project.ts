import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawProject } from './schemas.js';
import { mapProject, projectSchema } from './schemas.js';

export const createProject = defineTool({
  name: 'create_project',
  displayName: 'Create Project',
  description: 'Create a new project in an organization.',
  summary: 'Create a new project',
  icon: 'folder-plus',
  group: 'Projects',
  input: z.object({
    organization: z.string().describe('Organization name'),
    name: z.string().describe('Project name'),
    description: z.string().optional().describe('Project description'),
  }),
  output: z.object({
    project: projectSchema.describe('Created project'),
  }),
  handle: async params => {
    const res = await api<JsonApiResponse<RawProject>>(
      `/organizations/${encodeURIComponent(params.organization)}/projects`,
      {
        method: 'POST',
        body: {
          data: {
            type: 'projects',
            attributes: stripUndefined({
              name: params.name,
              description: params.description,
            }),
          },
        },
      },
    );
    return {
      project: mapProject(res.data.id, res.data.attributes),
    };
  },
});
