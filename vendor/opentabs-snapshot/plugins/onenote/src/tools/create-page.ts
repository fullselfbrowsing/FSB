import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawPage, mapPage, pageSchema } from './schemas.js';

export const createPage = defineTool({
  name: 'create_page',
  displayName: 'Create Page',
  description:
    'Create a new page in a OneNote section. The page content is specified as HTML. ' +
    'The HTML must include a <title> element inside <head> for the page title. ' +
    'Supports standard HTML elements: headings (h1-h6), paragraphs (p), lists (ul/ol/li), ' +
    'tables (table/tr/td), images (img with src), links (a), and text formatting (b, i, u, strike). ' +
    'Example: <!DOCTYPE html><html><head><title>My Page</title></head><body><h1>Hello</h1><p>Content here</p></body></html>',
  summary: 'Create a new page in a section with HTML content',
  icon: 'file-plus',
  group: 'Pages',
  input: z.object({
    section_id: z.string().min(1).describe('Section ID to create the page in'),
    html: z
      .string()
      .min(1)
      .describe(
        'Page content as HTML. Must include <!DOCTYPE html><html><head><title>Page Title</title></head><body>...</body></html>',
      ),
  }),
  output: z.object({
    page: pageSchema.describe('Created page'),
  }),
  handle: async params => {
    const data = await api<RawPage>(`/me/onenote/sections/${params.section_id}/pages`, {
      method: 'POST',
      body: params.html,
      contentType: 'text/html',
    });
    return { page: mapPage(data) };
  },
});
