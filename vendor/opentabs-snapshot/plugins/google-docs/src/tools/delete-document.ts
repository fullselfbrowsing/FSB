import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApiVoid } from '../google-docs-api.js';

export const deleteDocument = defineTool({
  name: 'delete_document',
  displayName: 'Delete Document',
  description:
    'Permanently delete a Google Doc from Drive. This skips the trash and cannot be undone through the Google Docs plugin.',
  summary: 'Permanently delete a document',
  icon: 'trash-2',
  group: 'Documents',
  input: z.object({
    document_id: z.string().describe('Google Docs document ID to delete permanently'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the delete operation completed'),
  }),
  handle: async params => {
    await driveApiVoid(`/files/${encodeURIComponent(params.document_id)}`, {
      method: 'DELETE',
    });

    return { success: true };
  },
});
