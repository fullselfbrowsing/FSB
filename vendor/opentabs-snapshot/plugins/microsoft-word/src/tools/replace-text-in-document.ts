import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { replaceTextInXml } from '../docx-utils.js';
import { downloadDocxEntries, uploadModifiedDocx } from './docx-edit-helpers.js';

export const replaceTextInDocument = defineTool({
  name: 'replace_text_in_document',
  displayName: 'Replace Text in Document',
  description:
    'Find and replace text in an existing Word document (.docx). This is the recommended way to edit documents because it preserves all formatting (bold, italic, headings, styles). Replaces all occurrences of the search text with the replacement text within existing paragraph runs. The search is case-sensitive and matches exact strings.',
  summary: 'Find and replace text in a Word document',
  icon: 'replace',
  group: 'Documents',
  input: z.object({
    item_id: z.string().describe('File ID of the .docx document'),
    find: z.string().min(1).describe('Text to search for (case-sensitive, exact match)'),
    replace: z.string().describe('Replacement text (use empty string to delete matches)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether replacements were made'),
    replacements: z.number().int().describe('Number of replacements made'),
  }),
  handle: async params => {
    const { entries, documentXml, documentXmlIndex } = await downloadDocxEntries(params.item_id);

    const { xml: newXml, count } = replaceTextInXml(documentXml, params.find, params.replace);

    if (count === 0) {
      throw ToolError.notFound(`Text "${params.find}" not found in the document.`);
    }

    await uploadModifiedDocx(params.item_id, entries, documentXmlIndex, newXml);

    return { success: true, replacements: count };
  },
});
