import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawSection, mapSection, sectionSchema } from './schemas.js';

export const createSection = defineTool({
  name: 'create_section',
  displayName: 'Create Section',
  description: 'Create a new section in a Todoist project. Sections help organize tasks within a project.',
  summary: 'Create a section',
  icon: 'layout-list',
  group: 'Sections',
  input: z.object({
    name: z.string().describe('Name of the section to create'),
    project_id: z.string().describe('Project ID to create the section in'),
    order: z.number().int().optional().describe('Position of the section among other sections in the project'),
  }),
  output: z.object({
    section: sectionSchema.describe('The newly created section'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      name: params.name,
      project_id: params.project_id,
    };
    if (params.order !== undefined) body.order = params.order;

    const data = await api<RawSection>('/sections', {
      method: 'POST',
      body,
    });
    return { section: mapSection(data) };
  },
});
