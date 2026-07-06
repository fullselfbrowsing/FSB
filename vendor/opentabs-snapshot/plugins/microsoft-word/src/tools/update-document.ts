import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { replaceBodyContent } from '../docx-utils.js';
import { downloadDocxEntries, uploadModifiedDocx } from './docx-edit-helpers.js';

export const updateDocument = defineTool({
  name: 'update_document',
  displayName: 'Update Document',
  description:
    'Replace the entire text content of an existing Word document (.docx). Downloads the document, replaces all body content with the new paragraphs, and re-uploads. WARNING: This removes all existing formatting (bold, italic, headings, etc.) — use replace_text_in_document for formatting-safe edits.',
  summary: 'Replace all text in a Word document',
  icon: 'file-pen',
  group: 'Documents',
  input: z.object({
    item_id: z.string().describe('File ID of the .docx document to update'),
    paragraphs: z.array(z.string()).min(1).describe('New text paragraphs to replace the document body content'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the document was updated'),
  }),
  handle: async params => {
    const { entries, documentXml, documentXmlIndex } = await downloadDocxEntries(params.item_id);

    const newXml = replaceBodyContent(documentXml, params.paragraphs);

    await uploadModifiedDocx(params.item_id, entries, documentXmlIndex, newXml);

    return { success: true };
  },
});
