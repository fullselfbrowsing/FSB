import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import { type AsanaResponse, type RawSection, SECTION_OPT_FIELDS, mapSection, sectionSchema } from './schemas.js';

export const createSection = defineTool({
  name: 'create_section',
  displayName: 'Create Section',
  description: 'Create a new section in a project. Sections organize tasks into groups.',
  summary: 'Create a new section in a project',
  icon: 'plus',
  group: 'Sections',
  input: z.object({
    project_gid: z.string().min(1).describe('Project GID to create the section in'),
    name: z.string().min(1).describe('Section name'),
  }),
  output: z.object({
    section: sectionSchema.describe('The created section'),
  }),
  handle: async params => {
    const data = await api<AsanaResponse<RawSection>>(`/projects/${params.project_gid}/sections`, {
      method: 'POST',
      body: { data: { name: params.name } },
      query: { opt_fields: SECTION_OPT_FIELDS },
    });
    return { section: mapSection(data.data) };
  },
});
