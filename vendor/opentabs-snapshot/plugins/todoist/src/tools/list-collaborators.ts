import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawCollaborator, type TodoistList, collaboratorSchema, mapCollaborator } from './schemas.js';

export const listCollaborators = defineTool({
  name: 'list_collaborators',
  displayName: 'List Collaborators',
  description: 'List all collaborators on a shared project.',
  summary: 'List project collaborators',
  icon: 'users',
  group: 'Projects',
  input: z.object({
    project_id: z.string().describe('The ID of the project to list collaborators for'),
  }),
  output: z.object({
    collaborators: z.array(collaboratorSchema).describe('List of project collaborators'),
  }),
  handle: async params => {
    const data = await api<TodoistList<RawCollaborator>>(`/projects/${params.project_id}/collaborators`);
    return { collaborators: data.results.map(mapCollaborator) };
  },
});
