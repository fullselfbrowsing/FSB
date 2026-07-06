import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const deleteSubmission = defineTool({
  name: 'delete_submission',
  displayName: 'Delete Submission',
  description:
    'Delete a form submission by its ID. This permanently removes the submission data. This action cannot be undone.',
  summary: 'Delete a form submission',
  icon: 'trash-2',
  group: 'Forms',
  input: z.object({
    submission_id: z.string().describe('The submission ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/submissions/${params.submission_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
