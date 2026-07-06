import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { formSchema, mapForm } from './schemas.js';
import type { RawForm } from './schemas.js';

interface FormsResponse {
  forms?: RawForm[];
}

export const listSiteForms = defineTool({
  name: 'list_site_forms',
  displayName: 'List Site Forms',
  description: 'List all forms for a Webflow site including form names and submission counts.',
  summary: 'List forms on a site',
  icon: 'file-input',
  group: 'Sites',
  input: z.object({
    site_short_name: z.string().describe('Site short name / URL slug'),
  }),
  output: z.object({
    forms: z.array(formSchema),
  }),
  handle: async params => {
    const data = await api<FormsResponse>(`/sites/${params.site_short_name}/forms`);
    return {
      forms: (data.forms ?? []).map(mapForm),
    };
  },
});
