import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { galleryItemSchema, mapGalleryItem } from './schemas.js';
import type { RawGalleryItem } from './schemas.js';

export const getGalleryDetail = defineTool({
  name: 'get_gallery_detail',
  displayName: 'Get Gallery Detail',
  description: 'Get detailed information about a specific gallery item by its ID.',
  summary: 'Get gallery item details',
  icon: 'image',
  group: 'Gallery',
  input: z.object({
    id: z.number().int().describe('Gallery item ID'),
  }),
  output: galleryItemSchema,
  handle: async params => {
    const data = await apiPost<{
      galleries: RawGalleryItem[];
      base_resp: unknown;
    }>('/matrix/api/v1/gallery/list_detail', {
      ids: [params.id],
    });
    const item = data.galleries?.[0];
    if (!item) {
      throw ToolError.notFound(`Gallery item ${params.id} not found`);
    }
    return mapGalleryItem(item);
  },
});
