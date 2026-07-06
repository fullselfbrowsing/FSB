import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawSectionGroup, mapSectionGroup, sectionGroupSchema } from './schemas.js';

export const createSectionGroup = defineTool({
  name: 'create_section_group',
  displayName: 'Create Section Group',
  description:
    'Create a new section group in a OneNote notebook. Section groups act as folders to organize sections within a notebook.',
  summary: 'Create a section group in a notebook',
  icon: 'folder-plus',
  group: 'Section Groups',
  input: z.object({
    notebook_id: z.string().min(1).describe('Notebook ID to create the section group in'),
    display_name: z.string().min(1).describe('Name for the new section group'),
  }),
  output: z.object({
    section_group: sectionGroupSchema.describe('Created section group'),
  }),
  handle: async params => {
    const data = await api<RawSectionGroup>(`/me/onenote/notebooks/${params.notebook_id}/sectionGroups`, {
      method: 'POST',
      body: { displayName: params.display_name },
    });
    return { section_group: mapSectionGroup(data) };
  },
});
