import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import { DOCUMENT_LIST_FIELDS, DOCUMENT_MIME_TYPE, documentSchema, mapDocument, type RawDriveFile } from './schemas.js';

export const listRecentDocuments = defineTool({
  name: 'list_recent_documents',
  displayName: 'List Recent Documents',
  description:
    'List recently viewed Google Docs from Drive, ordered by most recently viewed and then most recently modified.',
  summary: 'List recently viewed Google Docs',
  icon: 'history',
  group: 'Library',
  input: z.object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of documents to return (default 20, max 100)'),
    page_token: z.string().optional().describe('Page token from a previous list_recent_documents call'),
    include_trashed: z.boolean().optional().describe('Include documents that are currently in the trash'),
  }),
  output: z.object({
    documents: z.array(documentSchema).describe('Recent Google Docs documents'),
    next_page_token: z.string().describe('Token for the next page, empty if there are no more results'),
  }),
  handle: async params => {
    const clauses = [`mimeType = '${DOCUMENT_MIME_TYPE}'`];
    if (!params.include_trashed) {
      clauses.push('trashed = false');
    }

    const data = await driveApi<{ nextPageToken?: string; files?: RawDriveFile[] }>('/files', {
      params: {
        q: clauses.join(' and '),
        orderBy: 'viewedByMeTime desc,modifiedTime desc',
        pageSize: params.page_size ?? 20,
        pageToken: params.page_token,
        fields: DOCUMENT_LIST_FIELDS,
      },
    });

    return {
      documents: (data.files ?? []).map(mapDocument),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
