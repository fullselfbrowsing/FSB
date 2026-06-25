import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawSectionGroup, mapSectionGroup, sectionGroupSchema } from './schemas.js';

interface ListSectionGroupsResponse {
  value?: RawSectionGroup[];
}

export const listSectionGroups = defineTool({
  name: 'list_section_groups',
  displayName: 'List Section Groups',
  description:
    'List OneNote section groups. When a notebook_id is provided, returns section groups in that notebook. Otherwise returns all section groups across all notebooks. Section groups are folders that organize sections within a notebook.',
  summary: 'List section groups in a notebook or across all notebooks',
  icon: 'folder',
  group: 'Section Groups',
  input: z.object({
    notebook_id: z
      .string()
      .optional()
      .describe('Notebook ID to list section groups for. Omit to list all section groups.'),
    top: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of section groups to return (default 20, max 100)'),
  }),
  output: z.object({
    section_groups: z.array(sectionGroupSchema).describe('List of section groups'),
  }),
  handle: async params => {
    const endpoint = params.notebook_id
      ? `/me/onenote/notebooks/${params.notebook_id}/sectionGroups`
      : '/me/onenote/sectionGroups';

    const data = await api<ListSectionGroupsResponse>(endpoint, {
      query: { $top: params.top ?? 20 },
    });
    return { section_groups: (data.value ?? []).map(mapSectionGroup) };
  },
});
