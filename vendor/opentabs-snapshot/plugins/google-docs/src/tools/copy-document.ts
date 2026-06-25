import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import { DOCUMENT_FIELDS, documentSchema, mapDocument, type RawDriveFile } from './schemas.js';

export const copyDocument = defineTool({
  name: 'copy_document',
  displayName: 'Copy Document',
  description:
    'Create a copy of an existing Google Doc. You can optionally rename the new copy, move it into a folder, and set a Drive description.',
  summary: 'Copy a Google Doc',
  icon: 'copy',
  group: 'Documents',
  input: z.object({
    document_id: z.string().describe('Google Docs document ID to copy'),
    name: z.string().optional().describe('Optional title for the copied document'),
    folder_id: z.string().optional().describe('Optional Drive folder ID where the copy should be created'),
    description: z.string().optional().describe('Optional Drive file description for the new copy'),
  }),
  output: z.object({
    document: documentSchema,
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name) {
      body.name = params.name;
    }
    if (params.folder_id) {
      body.parents = [params.folder_id];
    }
    if (params.description) {
      body.description = params.description;
    }

    const file = await driveApi<RawDriveFile>(`/files/${encodeURIComponent(params.document_id)}/copy`, {
      method: 'POST',
      params: { fields: DOCUMENT_FIELDS },
      body,
    });

    return { document: mapDocument(file) };
  },
});
