import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { formSchema, type RawForm, mapForm } from './schemas.js';

export const listForms = defineTool({
  name: 'list_forms',
  displayName: 'List Forms',
  description:
    'List all forms for a Netlify site. Returns form name, page paths, field names, submission count, and creation timestamp.',
  summary: 'List site forms',
  icon: 'file-text',
  group: 'Forms',
  input: z.object({
    site_id: z.string().describe('The site ID to list forms for'),
  }),
  output: z.object({
    items: z.array(formSchema).describe('List of forms'),
  }),
  handle: async params => {
    const raw = await api<RawForm[]>(`/sites/${params.site_id}/forms`);
    return { items: raw.map(mapForm) };
  },
});
