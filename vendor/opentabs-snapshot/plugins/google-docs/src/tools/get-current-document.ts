import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentDocumentContext, getDocumentFile } from '../google-docs-api.js';
import { documentSchema, mapDocument, mapTab, tabSchema, type NormalizedDocumentTab } from './schemas.js';

export const getCurrentDocument = defineTool({
  name: 'get_current_document',
  displayName: 'Get Current Document',
  description:
    'Get metadata, revision info, and available tabs for the Google Doc currently open in the editor. This is the recommended first step before reading or editing the active document.',
  summary: 'Get the document open in the editor',
  icon: 'file-text',
  group: 'Documents',
  input: z.object({}),
  output: z.object({
    document: documentSchema,
    active_tab: tabSchema.describe('The tab currently selected in the Google Docs editor'),
    tabs: z.array(tabSchema).describe('All tabs available in the document'),
  }),
  handle: async () => {
    const current = getCurrentDocumentContext();
    if (!current) {
      throw ToolError.validation('No Google Doc is currently open — navigate to a document editor tab first.');
    }

    const file = await getDocumentFile(current.documentId);
    const activeTab: NormalizedDocumentTab = {
      id: current.tabId,
      title: current.tabId ? 'Current tab' : 'Main body',
      index: 0,
      parentId: '',
    };

    return {
      document: mapDocument(file),
      active_tab: mapTab(activeTab, activeTab.id),
      tabs: [mapTab(activeTab, activeTab.id)],
    };
  },
});
