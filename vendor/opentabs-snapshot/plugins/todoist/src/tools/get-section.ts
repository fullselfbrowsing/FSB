import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawSection, mapSection, sectionSchema } from './schemas.js';

export const getSection = defineTool({
  name: 'get_section',
  displayName: 'Get Section',
  description: 'Get detailed information about a specific section by its ID.',
  summary: 'Get a section by ID',
  icon: 'layout-list',
  group: 'Sections',
  input: z.object({
    section_id: z.string().describe('Section ID to retrieve'),
  }),
  output: z.object({
    section: sectionSchema.describe('Section details'),
  }),
  handle: async params => {
    const data = await api<RawSection>(`/sections/${params.section_id}`);
    return { section: mapSection(data) };
  },
});
