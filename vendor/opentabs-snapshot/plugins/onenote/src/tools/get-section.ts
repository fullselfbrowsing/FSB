import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawSection, mapSection, sectionSchema } from './schemas.js';

export const getSection = defineTool({
  name: 'get_section',
  displayName: 'Get Section',
  description:
    'Get detailed information about a specific OneNote section by its ID. Returns section metadata including name, parent notebook, and creation date.',
  summary: 'Get a section by ID',
  icon: 'layers',
  group: 'Sections',
  input: z.object({
    section_id: z.string().min(1).describe('Section ID'),
  }),
  output: z.object({
    section: sectionSchema.describe('Section details'),
  }),
  handle: async params => {
    const data = await api<RawSection>(`/me/onenote/sections/${params.section_id}`);
    return { section: mapSection(data) };
  },
});
