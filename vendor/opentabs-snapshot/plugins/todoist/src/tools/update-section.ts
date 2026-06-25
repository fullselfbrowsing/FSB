import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawSection, mapSection, sectionSchema } from './schemas.js';

export const updateSection = defineTool({
  name: 'update_section',
  displayName: 'Update Section',
  description: 'Update the name of an existing section.',
  summary: 'Update a section',
  icon: 'layout-list',
  group: 'Sections',
  input: z.object({
    section_id: z.string().describe('Section ID to update'),
    name: z.string().describe('New name for the section'),
  }),
  output: z.object({
    section: sectionSchema.describe('The updated section'),
  }),
  handle: async params => {
    const data = await api<RawSection>(`/sections/${params.section_id}`, {
      method: 'POST',
      body: { name: params.name },
    });
    return { section: mapSection(data) };
  },
});
