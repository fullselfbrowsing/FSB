import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawSection, type TodoistList, mapSection, sectionSchema } from './schemas.js';

export const listSections = defineTool({
  name: 'list_sections',
  displayName: 'List Sections',
  description:
    'List sections in a Todoist project. If no project ID is provided, returns sections across all projects.',
  summary: 'List sections',
  icon: 'layout-list',
  group: 'Sections',
  input: z.object({
    project_id: z.string().optional().describe('Filter sections by project ID'),
  }),
  output: z.object({
    sections: z.array(sectionSchema).describe('List of sections'),
  }),
  handle: async params => {
    const data = await api<TodoistList<RawSection>>('/sections', {
      query: { project_id: params.project_id },
    });
    return { sections: data.results.map(mapSection) };
  },
});
