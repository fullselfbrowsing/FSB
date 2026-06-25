import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { driveApi } from '../google-docs-api.js';
import {
  DOCUMENT_LIST_FIELDS,
  DOCUMENT_MIME_TYPE,
  documentSchema,
  escapeDriveQueryValue,
  mapDocument,
  type RawDriveFile,
} from './schemas.js';

export const searchDocuments = defineTool({
  name: 'search_documents',
  displayName: 'Search Documents',
  description:
    'Search Google Docs by title and full-text content using the authenticated Drive search index. Trashed documents are excluded by default.',
  summary: 'Search Google Docs by title or content',
  icon: 'search',
  group: 'Library',
  input: z.object({
    query: z.string().min(1).describe('Search text to match against document titles and indexed document content'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of documents to return (default 20, max 100)'),
    page_token: z.string().optional().describe('Page token from a previous search_documents call'),
    include_trashed: z.boolean().optional().describe('Include documents that are currently in the trash'),
  }),
  output: z.object({
    documents: z.array(documentSchema).describe('Matching Google Docs documents'),
    next_page_token: z.string().describe('Token for the next page, empty if there are no more results'),
  }),
  handle: async params => {
    const escapedQuery = escapeDriveQueryValue(params.query);
    const clauses = [
      `mimeType = '${DOCUMENT_MIME_TYPE}'`,
      `(name contains '${escapedQuery}' or fullText contains '${escapedQuery}')`,
    ];
    if (!params.include_trashed) {
      clauses.push('trashed = false');
    }

    const data = await driveApi<{ nextPageToken?: string; files?: RawDriveFile[] }>('/files', {
      params: {
        q: clauses.join(' and '),
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
