import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaList, type RawSection, SECTION_OPT_FIELDS, mapSection, sectionSchema } from './schemas.js';

export const listSections = defineTool({
  name: 'list_sections',
  displayName: 'List Sections',
  description: 'List all sections in a project. Sections are used to organize tasks into groups within a project.',
  summary: 'List sections in a project',
  icon: 'layout-list',
  group: 'Sections',
  input: z.object({
    project_gid: z.string().min(1).describe('Project GID to list sections from'),
  }),
  output: z.object({
    sections: z.array(sectionSchema).describe('List of sections in the project'),
  }),
  handle: async params => {
    const data = await api<AsanaList<RawSection>>(`/projects/${params.project_gid}/sections`, {
      query: { opt_fields: SECTION_OPT_FIELDS },
    });
    return {
      sections: (data.data ?? []).map(mapSection),
    };
  },
});
