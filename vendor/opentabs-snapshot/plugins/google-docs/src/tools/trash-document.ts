import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import { DOCUMENT_FIELDS, documentSchema, mapDocument, type RawDriveFile } from './schemas.js';

export const trashDocument = defineTool({
  name: 'trash_document',
  displayName: 'Trash Document',
  description: 'Move a Google Doc to the Drive trash. The document can still be restored later with restore_document.',
  summary: 'Move a document to the trash',
  icon: 'trash-2',
  group: 'Documents',
  input: z.object({
    document_id: z.string().describe('Google Docs document ID to move to the trash'),
  }),
  output: z.object({
    document: documentSchema,
  }),
  handle: async params => {
    const file = await driveApi<RawDriveFile>(`/files/${encodeURIComponent(params.document_id)}`, {
      method: 'PATCH',
      params: { fields: DOCUMENT_FIELDS },
      body: { trashed: true },
    });

    return { document: mapDocument(file) };
  },
});
