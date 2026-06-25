import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, PROJECT_OPT_FIELDS, type RawProject, mapProject, projectSchema } from './schemas.js';

export const createProject = defineTool({
  name: 'create_project',
  displayName: 'Create Project',
  description:
    'Create a new project in a workspace. Requires a workspace GID and project name. Optionally set notes, color, team, dates, and visibility.',
  summary: 'Create a new project in a workspace',
  icon: 'folder-plus',
  group: 'Projects',
  input: z.object({
    workspace_gid: z.string().min(1).describe('Workspace GID to create the project in'),
    name: z.string().min(1).describe('Project name'),
    notes: z.string().optional().describe('Plain-text project description'),
    color: z.string().optional().describe('Project color name (e.g. "light-green", "dark-blue")'),
    team: z.string().optional().describe('Team GID to associate with the project'),
    due_on: z.string().optional().describe('Project due date in YYYY-MM-DD format'),
    start_on: z.string().optional().describe('Project start date in YYYY-MM-DD format'),
    public: z.boolean().optional().describe('Whether the project is public to the workspace'),
  }),
  output: z.object({
    project: projectSchema.describe('The created project'),
  }),
  handle: async params => {
    const fields: Record<string, unknown> = {
      workspace: params.workspace_gid,
      name: params.name,
    };
    if (params.notes !== undefined) fields.notes = params.notes;
    if (params.color !== undefined) fields.color = params.color;
    if (params.team !== undefined) fields.team = params.team;
    if (params.due_on !== undefined) fields.due_on = params.due_on;
    if (params.start_on !== undefined) fields.start_on = params.start_on;
    if (params.public !== undefined) fields.public = params.public;

    const data = await api<AsanaResponse<RawProject>>('/projects', {
      method: 'POST',
      body: { data: fields },
      query: { opt_fields: PROJECT_OPT_FIELDS },
    });
    return { project: mapProject(data.data) };
  },
});
