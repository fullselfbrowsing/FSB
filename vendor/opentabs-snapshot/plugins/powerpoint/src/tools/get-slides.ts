import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { downloadPptx, extractSlideText, getNotesForSlide, getSlideList, TEXT_DECODER } from '../pptx-utils.js';
import { slideSchema } from './schemas.js';

export const getSlides = defineTool({
  name: 'get_slides',
  displayName: 'Get Slides',
  description:
    'Get all slides from a PowerPoint presentation with their text content. Downloads the PPTX file, parses it, and extracts text from each slide.',
  summary: 'List all slides with their text content',
  icon: 'layers',
  group: 'Slides',
  input: z.object({
    item_id: z.string().describe('Item ID of the PowerPoint file'),
  }),
  output: z.object({
    slides: z.array(slideSchema).describe('All slides in the presentation'),
    total: z.number().int().describe('Total number of slides'),
  }),
  handle: async params => {
    const entries = await downloadPptx(params.item_id);
    const slideFiles = getSlideList(entries);

    const slides = slideFiles.map((file, index) => {
      const slideData = entries.get(file);
      const slideXml = slideData ? TEXT_DECODER.decode(slideData) : '';
      const texts = slideXml ? extractSlideText(slideXml) : [];
      const notesFile = getNotesForSlide(entries, file);

      return {
        number: index + 1,
        file,
        texts,
        has_notes: notesFile !== null,
      };
    });

    return { slides, total: slides.length };
  },
});
