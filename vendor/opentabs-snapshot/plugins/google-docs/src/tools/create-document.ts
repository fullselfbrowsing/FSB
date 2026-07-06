import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import { DOCUMENT_FIELDS, DOCUMENT_MIME_TYPE, documentSchema, mapDocument, type RawDriveFile } from './schemas.js';

export const createDocument = defineTool({
  name: 'create_document',
  displayName: 'Create Document',
  description:
    'Create a new blank Google Doc in Drive. Open the new document in Google Docs and call update_document when you want to add or replace its content.',
  summary: 'Create a new Google Doc',
  icon: 'file-plus',
  group: 'Documents',
  input: z.object({
    name: z.string().min(1).describe('Document title'),
    folder_id: z.string().optional().describe('Optional Drive folder ID where the new document should be created'),
    description: z.string().optional().describe('Optional Drive file description'),
  }),
  output: z.object({
    document: documentSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {
      name: params.name,
      mimeType: DOCUMENT_MIME_TYPE,
    };

    if (params.folder_id) {
      body.parents = [params.folder_id];
    }

    if (params.description) {
      body.description = params.description;
    }

    const file = await driveApi<RawDriveFile>('/files', {
      method: 'POST',
      params: { fields: DOCUMENT_FIELDS },
      body,
    });

    const documentId = file.id;
    if (!documentId) {
      throw ToolError.internal('Google Drive created a document without returning an ID.');
    }

    return { document: mapDocument(file) };
  },
});
