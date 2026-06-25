import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawSection, mapSection, sectionSchema } from './schemas.js';

interface ListSectionsResponse {
  value?: RawSection[];
}

export const listSections = defineTool({
  name: 'list_sections',
  displayName: 'List Sections',
  description:
    'List OneNote sections. When a notebook_id is provided, returns only sections in that notebook. Otherwise returns all sections across all notebooks.',
  summary: 'List sections in a notebook or across all notebooks',
  icon: 'layers',
  group: 'Sections',
  input: z.object({
    notebook_id: z.string().optional().describe('Notebook ID to list sections for. Omit to list all sections.'),
    top: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of sections to return (default 20, max 100)'),
  }),
  output: z.object({
    sections: z.array(sectionSchema).describe('List of sections'),
  }),
  handle: async params => {
    const endpoint = params.notebook_id
      ? `/me/onenote/notebooks/${params.notebook_id}/sections`
      : '/me/onenote/sections';

    const data = await api<ListSectionsResponse>(endpoint, {
      query: { $top: params.top ?? 20 },
    });
    return { sections: (data.value ?? []).map(mapSection) };
  },
});
