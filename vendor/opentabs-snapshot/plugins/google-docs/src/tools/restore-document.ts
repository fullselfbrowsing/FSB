import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import { DOCUMENT_FIELDS, documentSchema, mapDocument, type RawDriveFile } from './schemas.js';

export const restoreDocument = defineTool({
  name: 'restore_document',
  displayName: 'Restore Document',
  description: 'Restore a Google Doc from the Drive trash back to its previous location.',
  summary: 'Restore a trashed document',
  icon: 'rotate-ccw',
  group: 'Documents',
  input: z.object({
    document_id: z.string().describe('Google Docs document ID to restore from the trash'),
  }),
  output: z.object({
    document: documentSchema,
  }),
  handle: async params => {
    const file = await driveApi<RawDriveFile>(`/files/${encodeURIComponent(params.document_id)}`, {
      method: 'PATCH',
      params: { fields: DOCUMENT_FIELDS },
      body: { trashed: false },
    });

    return { document: mapDocument(file) };
  },
});
