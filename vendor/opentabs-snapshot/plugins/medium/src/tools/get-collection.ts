import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { collectionSchema, type RawCollection, mapCollection } from './schemas.js';

interface CollectionData {
  collection: RawCollection | null;
}

export const getCollection = defineTool({
  name: 'get_collection',
  displayName: 'Get Collection',
  description: 'Get detailed information about a Medium publication/collection by its ID.',
  summary: 'Get a publication by ID',
  icon: 'book-open',
  group: 'Collections',
  input: z.object({
    collection_id: z.string().describe('Medium collection/publication ID'),
  }),
  output: z.object({ collection: collectionSchema }),
  handle: async params => {
    const data = await gql<CollectionData>(
      'CollectionQuery',
      `query CollectionQuery($collectionId: ID!) {
        collection(id: $collectionId) {
          id name slug description subscriberCount domain shortDescription
          creator { id name username }
        }
      }`,
      { collectionId: params.collection_id },
    );
    if (!data.collection) throw ToolError.notFound(`Collection not found: ${params.collection_id}`);
    return { collection: mapCollection(data.collection) };
  },
});
