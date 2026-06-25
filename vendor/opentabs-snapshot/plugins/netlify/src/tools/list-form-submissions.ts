import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { formSubmissionSchema, type RawFormSubmission, mapFormSubmission } from './schemas.js';

export const listFormSubmissions = defineTool({
  name: 'list_form_submissions',
  displayName: 'List Form Submissions',
  description:
    'List submissions for a specific Netlify form. Returns submitter name, email, body text, full data key-value pairs, and timestamps. Supports pagination.',
  summary: 'List form submissions',
  icon: 'list',
  group: 'Forms',
  input: z.object({
    form_id: z.string().describe('The form ID to list submissions for'),
    page: z.number().optional().describe('Page number for pagination (starts at 1)'),
    per_page: z.number().optional().describe('Number of submissions per page (default 20)'),
  }),
  output: z.object({
    items: z.array(formSubmissionSchema).describe('List of form submissions'),
  }),
  handle: async params => {
    const raw = await api<RawFormSubmission[]>(`/forms/${params.form_id}/submissions`, {
      query: {
        page: params.page,
        per_page: params.per_page,
      },
    });
    return { items: raw.map(mapFormSubmission) };
  },
});
