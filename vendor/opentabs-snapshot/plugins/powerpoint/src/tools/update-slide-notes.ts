import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import {
  downloadPptx,
  getNotesForSlide,
  getSlideList,
  replaceNotesText,
  TEXT_DECODER,
  TEXT_ENCODER,
  uploadPptx,
} from '../pptx-utils.js';

export const updateSlideNotes = defineTool({
  name: 'update_slide_notes',
  displayName: 'Update Slide Notes',
  description:
    'Update the speaker notes for a specific slide. Downloads the PPTX, modifies the notes XML, and re-uploads. The slide must already have a notes file.',
  summary: 'Modify speaker notes on a slide',
  icon: 'notebook-pen',
  group: 'Slides',
  input: z.object({
    item_id: z.string().describe('Item ID of the PowerPoint file'),
    slide_number: z.number().int().min(1).describe('Slide number (1-indexed)'),
    notes: z.string().describe('New speaker notes text'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the update succeeded'),
  }),
  handle: async params => {
    const entries = await downloadPptx(params.item_id);
    const slideFiles = getSlideList(entries);

    if (params.slide_number > slideFiles.length || params.slide_number < 1) {
      throw ToolError.notFound(`Slide ${params.slide_number} not found — presentation has ${slideFiles.length} slides`);
    }

    const file = slideFiles[params.slide_number - 1];
    if (!file) throw ToolError.notFound(`Slide ${params.slide_number} not found`);
    const notesFile = getNotesForSlide(entries, file);

    if (!notesFile) {
      throw ToolError.notFound(
        `Slide ${params.slide_number} has no speaker notes file — add notes in PowerPoint first, then use this tool to update them`,
      );
    }

    const notesData = entries.get(notesFile);
    if (!notesData) throw ToolError.internal(`Notes file not found in archive: ${notesFile}`);

    const notesXml = TEXT_DECODER.decode(notesData);
    const updatedXml = replaceNotesText(notesXml, params.notes);
    entries.set(notesFile, TEXT_ENCODER.encode(updatedXml));

    await uploadPptx(params.item_id, entries);
    return { success: true };
  },
});
