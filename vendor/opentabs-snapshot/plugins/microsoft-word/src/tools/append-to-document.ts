import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { appendParagraphsToXml } from '../docx-utils.js';
import { downloadDocxEntries, uploadModifiedDocx } from './docx-edit-helpers.js';

export const appendToDocument = defineTool({
  name: 'append_to_document',
  displayName: 'Append to Document',
  description:
    'Append paragraphs to the end of an existing Word document (.docx). Downloads the document, adds the new paragraphs after all existing content, and re-uploads. Existing content is preserved.',
  summary: 'Append paragraphs to a Word document',
  icon: 'file-plus-2',
  group: 'Documents',
  input: z.object({
    item_id: z.string().describe('File ID of the .docx document to append to'),
    paragraphs: z.array(z.string()).min(1).describe('Text paragraphs to append at the end of the document'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the paragraphs were appended'),
  }),
  handle: async params => {
    const { entries, documentXml, documentXmlIndex } = await downloadDocxEntries(params.item_id);

    const newXml = appendParagraphsToXml(documentXml, params.paragraphs);

    await uploadModifiedDocx(params.item_id, entries, documentXmlIndex, newXml);

    return { success: true };
  },
});
