import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawSection, mapSection, sectionSchema } from './schemas.js';

export const createSection = defineTool({
  name: 'create_section',
  displayName: 'Create Section',
  description:
    'Create a new section in a OneNote notebook. Sections contain pages and are the primary organizational unit within a notebook.',
  summary: 'Create a new section in a notebook',
  icon: 'layers-3',
  group: 'Sections',
  input: z.object({
    notebook_id: z.string().min(1).describe('Notebook ID to create the section in'),
    display_name: z.string().min(1).describe('Name for the new section'),
  }),
  output: z.object({
    section: sectionSchema.describe('Created section'),
  }),
  handle: async params => {
    const data = await api<RawSection>(`/me/onenote/notebooks/${params.notebook_id}/sections`, {
      method: 'POST',
      body: { displayName: params.display_name },
    });
    return { section: mapSection(data) };
  },
});
