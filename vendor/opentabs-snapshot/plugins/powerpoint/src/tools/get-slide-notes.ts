import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { downloadPptx, extractNotesText, getNotesForSlide, getSlideList, TEXT_DECODER } from '../pptx-utils.js';

export const getSlideNotes = defineTool({
  name: 'get_slide_notes',
  displayName: 'Get Slide Notes',
  description: 'Get the speaker notes for a specific slide by number. Downloads the PPTX and extracts the notes text.',
  summary: 'Read speaker notes from a slide',
  icon: 'sticky-note',
  group: 'Slides',
  input: z.object({
    item_id: z.string().describe('Item ID of the PowerPoint file'),
    slide_number: z.number().int().min(1).describe('Slide number (1-indexed)'),
  }),
  output: z.object({
    notes: z.string().describe('Speaker notes text (empty if no notes exist)'),
    has_notes: z.boolean().describe('Whether this slide has a notes file'),
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
      return { notes: '', has_notes: false };
    }

    const notesData = entries.get(notesFile);
    if (!notesData) return { notes: '', has_notes: false };

    const notes = extractNotesText(TEXT_DECODER.decode(notesData));
    return { notes, has_notes: true };
  },
});
