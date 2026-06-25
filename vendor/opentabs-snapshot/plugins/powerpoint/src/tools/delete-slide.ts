import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { downloadPptx, getSlideList, TEXT_DECODER, TEXT_ENCODER, uploadPptx } from '../pptx-utils.js';

export const deleteSlide = defineTool({
  name: 'delete_slide',
  displayName: 'Delete Slide',
  description:
    'Delete a slide from a PowerPoint presentation by number (1-indexed). Downloads the PPTX, removes the slide and updates all references, then re-uploads.',
  summary: 'Remove a slide from a presentation',
  icon: 'trash-2',
  group: 'Slides',
  input: z.object({
    item_id: z.string().describe('Item ID of the PowerPoint file'),
    slide_number: z.number().int().min(1).describe('Slide number to delete (1-indexed)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
    remaining_slides: z.number().int().describe('Number of slides remaining after deletion'),
  }),
  handle: async params => {
    const entries = await downloadPptx(params.item_id);
    const slideFiles = getSlideList(entries);

    if (params.slide_number > slideFiles.length || params.slide_number < 1) {
      throw ToolError.notFound(`Slide ${params.slide_number} not found — presentation has ${slideFiles.length} slides`);
    }

    if (slideFiles.length <= 1) {
      throw ToolError.validation('Cannot delete the only slide in a presentation');
    }

    const slideFile = slideFiles[params.slide_number - 1];
    if (!slideFile) throw ToolError.notFound(`Slide ${params.slide_number} not found`);
    const slideBaseName = slideFile.split('/').pop() ?? '';

    // Remove the slide file
    entries.delete(slideFile);

    // Remove the slide's relationship file
    const relsPath = `ppt/slides/_rels/${slideBaseName}.rels`;
    entries.delete(relsPath);

    // Remove the slide reference from presentation.xml.rels
    const presRelsData = entries.get('ppt/_rels/presentation.xml.rels');
    if (presRelsData) {
      let relsXml = TEXT_DECODER.decode(presRelsData);
      // Remove the Relationship element for this slide
      const targetName = slideBaseName;
      const regex = new RegExp(`<Relationship[^>]*Target="slides/${targetName}"[^>]*/?>`, 'g');
      relsXml = relsXml.replace(regex, '');
      entries.set('ppt/_rels/presentation.xml.rels', TEXT_ENCODER.encode(relsXml));
    }

    // Remove the slide reference from presentation.xml
    const presData = entries.get('ppt/presentation.xml');
    if (presData) {
      let presXml = TEXT_DECODER.decode(presData);
      // Find and remove the <p:sldId> element referencing this slide's relationship
      // The rId is in the presentation.xml.rels and referenced in presentation.xml
      const rIdMatch = TEXT_DECODER.decode(presRelsData ?? new Uint8Array()).match(
        new RegExp(`Id="(rId\\d+)"[^>]*Target="slides/${slideBaseName}"`),
      );
      if (rIdMatch) {
        const rId = rIdMatch[1];
        const sldIdRegex = new RegExp(`<p:sldId[^>]*r:id="${rId}"[^>]*/?>`, 'g');
        presXml = presXml.replace(sldIdRegex, '');
        entries.set('ppt/presentation.xml', TEXT_ENCODER.encode(presXml));
      }
    }

    // Remove from [Content_Types].xml
    const contentTypesData = entries.get('[Content_Types].xml');
    if (contentTypesData) {
      let ctXml = TEXT_DECODER.decode(contentTypesData);
      const ctRegex = new RegExp(`<Override[^>]*PartName="/ppt/slides/${slideBaseName}"[^>]*/?>`, 'g');
      ctXml = ctXml.replace(ctRegex, '');
      entries.set('[Content_Types].xml', TEXT_ENCODER.encode(ctXml));
    }

    await uploadPptx(params.item_id, entries);
    return { success: true, remaining_slides: slideFiles.length - 1 };
  },
});
