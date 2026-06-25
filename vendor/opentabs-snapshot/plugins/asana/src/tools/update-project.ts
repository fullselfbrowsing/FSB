import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, PROJECT_OPT_FIELDS, type RawProject, mapProject, projectSchema } from './schemas.js';

export const updateProject = defineTool({
  name: 'update_project',
  displayName: 'Update Project',
  description: 'Update an existing project. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an existing project',
  icon: 'pencil',
  group: 'Projects',
  input: z.object({
    project_gid: z.string().min(1).describe('Project GID to update'),
    name: z.string().optional().describe('New project name'),
    notes: z.string().optional().describe('New plain-text project description'),
    color: z.string().optional().describe('New project color name (e.g. "light-green", "dark-blue")'),
    archived: z.boolean().optional().describe('Whether the project is archived'),
    due_on: z.string().optional().describe('New due date in YYYY-MM-DD format'),
    start_on: z.string().optional().describe('New start date in YYYY-MM-DD format'),
    public: z.boolean().optional().describe('Whether the project is public to the workspace'),
  }),
  output: z.object({
    project: projectSchema.describe('The updated project'),
  }),
  handle: async params => {
    const fields: Record<string, unknown> = {};
    if (params.name !== undefined) fields.name = params.name;
    if (params.notes !== undefined) fields.notes = params.notes;
    if (params.color !== undefined) fields.color = params.color;
    if (params.archived !== undefined) fields.archived = params.archived;
    if (params.due_on !== undefined) fields.due_on = params.due_on;
    if (params.start_on !== undefined) fields.start_on = params.start_on;
    if (params.public !== undefined) fields.public = params.public;

    const data = await api<AsanaResponse<RawProject>>(`/projects/${params.project_gid}`, {
      method: 'PUT',
      body: { data: fields },
      query: { opt_fields: PROJECT_OPT_FIELDS },
    });
    return { project: mapProject(data.data) };
  },
});
