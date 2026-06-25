import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { galleryCategorySchema, mapGalleryCategory } from './schemas.js';
import type { RawGalleryCategory } from './schemas.js';

export const listGalleryCategories = defineTool({
  name: 'list_gallery_categories',
  displayName: 'List Gallery Categories',
  description: 'List all available gallery categories. Returns the full category tree including subcategories.',
  summary: 'List gallery categories',
  icon: 'layout-grid',
  group: 'Gallery',
  input: z.object({}),
  output: z.object({
    categories: z.array(galleryCategorySchema).describe('List of gallery categories'),
  }),
  handle: async () => {
    const data = await apiPost<{
      gallery_categories: RawGalleryCategory[];
      base_resp: unknown;
    }>('/matrix/api/v1/gallery/list_category', {});
    return {
      categories: (data.gallery_categories ?? []).map(mapGalleryCategory),
    };
  },
});
