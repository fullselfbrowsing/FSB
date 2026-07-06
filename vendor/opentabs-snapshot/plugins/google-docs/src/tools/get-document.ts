import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentDocumentContext, getDocumentFile, resolveDocumentId } from '../google-docs-api.js';
import { documentSchema, mapDocument, mapTab, tabSchema, type NormalizedDocumentTab } from './schemas.js';

export const getDocument = defineTool({
  name: 'get_document',
  displayName: 'Get Document',
  description:
    'Get metadata, revision info, and tab details for a Google Doc by ID. If document_id is omitted, the tool reads the document currently open in the editor.',
  summary: 'Get document metadata and tabs',
  icon: 'file-search',
  group: 'Documents',
  input: z.object({
    document_id: z
      .string()
      .optional()
      .describe('Google Docs document ID. Defaults to the document open in the current editor tab.'),
    tab_id: z
      .string()
      .optional()
      .describe('Optional tab ID to mark as the selected tab in the response. Defaults to the current or first tab.'),
  }),
  output: z.object({
    document: documentSchema,
    selected_tab: tabSchema.describe('The selected tab for the response'),
    tabs: z.array(tabSchema).describe('All tabs available in the document'),
  }),
  handle: async params => {
    const documentId = resolveDocumentId(params.document_id);
    const file = await getDocumentFile(documentId);
    const current = getCurrentDocumentContext();
    const isCurrentDocument = current?.documentId === documentId;

    if (isCurrentDocument && params.tab_id && params.tab_id !== current.tabId) {
      throw ToolError.validation(
        `Live Google Docs tab metadata is only available for the active tab (${current.tabId || 'main body'}).`,
      );
    }

    const selectedTab: NormalizedDocumentTab = {
      id: isCurrentDocument ? (current?.tabId ?? '') : (params.tab_id ?? ''),
      title: isCurrentDocument
        ? (current?.tabId ?? '')
          ? 'Current tab'
          : 'Main body'
        : params.tab_id
          ? `Tab ${params.tab_id}`
          : 'Main body',
      index: 0,
      parentId: '',
    };

    return {
      document: mapDocument(file),
      selected_tab: mapTab(selectedTab, selectedTab.id),
      tabs: [mapTab(selectedTab, selectedTab.id)],
    };
  },
});
