import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawSectionGroup, mapSectionGroup, sectionGroupSchema } from './schemas.js';

export const getSectionGroup = defineTool({
  name: 'get_section_group',
  displayName: 'Get Section Group',
  description:
    'Get detailed information about a specific OneNote section group by its ID. Section groups are folders that organize sections within a notebook.',
  summary: 'Get a section group by ID',
  icon: 'folder',
  group: 'Section Groups',
  input: z.object({
    section_group_id: z.string().min(1).describe('Section group ID'),
  }),
  output: z.object({
    section_group: sectionGroupSchema.describe('Section group details'),
  }),
  handle: async params => {
    const data = await api<RawSectionGroup>(`/me/onenote/sectionGroups/${params.section_group_id}`);
    return { section_group: mapSectionGroup(data) };
  },
});
