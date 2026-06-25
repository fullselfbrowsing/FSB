import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import {
  downloadPptx,
  extractNotesText,
  extractSlideText,
  getNotesForSlide,
  getSlideList,
  TEXT_DECODER,
} from '../pptx-utils.js';

export const getSlideContent = defineTool({
  name: 'get_slide_content',
  displayName: 'Get Slide Content',
  description:
    'Get detailed text content and speaker notes for a specific slide by number (1-indexed). Downloads the PPTX file and extracts all text and notes.',
  summary: 'Get text and notes for a specific slide',
  icon: 'file-text',
  group: 'Slides',
  input: z.object({
    item_id: z.string().describe('Item ID of the PowerPoint file'),
    slide_number: z.number().int().min(1).describe('Slide number (1-indexed)'),
  }),
  output: z.object({
    number: z.number().int().describe('Slide number'),
    texts: z.array(z.string()).describe('Text content from the slide'),
    notes: z.string().describe('Speaker notes text (empty if no notes)'),
    file: z.string().describe('Internal file path within the PPTX archive'),
  }),
  handle: async params => {
    const entries = await downloadPptx(params.item_id);
    const slideFiles = getSlideList(entries);

    if (params.slide_number > slideFiles.length || params.slide_number < 1) {
      throw ToolError.notFound(`Slide ${params.slide_number} not found — presentation has ${slideFiles.length} slides`);
    }

    const file = slideFiles[params.slide_number - 1];
    if (!file) throw ToolError.notFound(`Slide ${params.slide_number} not found`);
    const slideData = entries.get(file);
    const slideXml = slideData ? TEXT_DECODER.decode(slideData) : '';
    const texts = slideXml ? extractSlideText(slideXml) : [];

    let notes = '';
    const notesFile = getNotesForSlide(entries, file);
    if (notesFile) {
      const notesData = entries.get(notesFile);
      if (notesData) {
        notes = extractNotesText(TEXT_DECODER.decode(notesData));
      }
    }

    return { number: params.slide_number, texts, notes, file };
  },
});
