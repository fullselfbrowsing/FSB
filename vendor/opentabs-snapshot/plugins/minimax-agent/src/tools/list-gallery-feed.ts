import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { galleryItemSchema, mapGalleryItem } from './schemas.js';
import type { RawGalleryItem } from './schemas.js';

export const listGalleryFeed = defineTool({
  name: 'list_gallery_feed',
  displayName: 'List Gallery Feed',
  description: 'Browse the gallery feed with pagination. Optionally filter by category and subcategory.',
  summary: 'Browse gallery feed',
  icon: 'images',
  group: 'Gallery',
  input: z.object({
    page_num: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(50).optional().describe('Results per page (default 20)'),
    category: z.string().optional().describe('Category name to filter by'),
    sub_category: z.string().optional().describe('Subcategory name to filter by'),
  }),
  output: z.object({
    galleries: z.array(galleryItemSchema).describe('List of gallery items'),
    has_more: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const data = await apiPost<{
      galleries: RawGalleryItem[];
      has_more: boolean;
      base_resp: unknown;
    }>('/matrix/api/v1/gallery/feed', {
      page_num: params.page_num ?? 1,
      page_size: params.page_size ?? 20,
      ...(params.category != null && { category: params.category }),
      ...(params.sub_category != null && { sub_category: params.sub_category }),
    });
    return {
      galleries: (data.galleries ?? []).map(mapGalleryItem),
      has_more: data.has_more ?? false,
    };
  },
});
