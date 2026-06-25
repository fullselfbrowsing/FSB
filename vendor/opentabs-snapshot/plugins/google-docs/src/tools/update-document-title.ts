import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import { DOCUMENT_FIELDS, documentSchema, mapDocument, type RawDriveFile } from './schemas.js';

export const updateDocumentTitle = defineTool({
  name: 'update_document_title',
  displayName: 'Update Document Title',
  description: 'Rename a Google Doc in Drive without changing its content.',
  summary: 'Rename a Google Doc',
  icon: 'square-pen',
  group: 'Documents',
  input: z.object({
    document_id: z.string().describe('Google Docs document ID to rename'),
    title: z.string().min(1).describe('New document title'),
  }),
  output: z.object({
    document: documentSchema,
  }),
  handle: async params => {
    const file = await driveApi<RawDriveFile>(`/files/${encodeURIComponent(params.document_id)}`, {
      method: 'PATCH',
      params: { fields: DOCUMENT_FIELDS },
      body: { name: params.title },
    });

    return { document: mapDocument(file) };
  },
});
