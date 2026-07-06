import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawCollection, collectionSchema, mapCollection } from './schemas.js';

interface CollectionsResponse {
  items?: RawCollection[];
}

export const listCollections = defineTool({
  name: 'list_collections',
  displayName: 'List Collections',
  description:
    'List saved post collections. Collections organize saved posts into custom groups (e.g., "Travel", "Recipes").',
  summary: 'List saved collections',
  icon: 'folders',
  group: 'Saved',
  input: z.object({}),
  output: z.object({
    collections: z.array(collectionSchema).describe('Saved collections'),
  }),
  handle: async () => {
    const data = await api<CollectionsResponse>('/collections/list/', {
      query: {
        collection_types: '["ALL_MEDIA_AUTO_COLLECTION","PRODUCT_AUTO_COLLECTION","MEDIA"]',
      },
    });
    return {
      collections: (data.items ?? []).map(mapCollection),
    };
  },
});
