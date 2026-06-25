import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../tripadvisor-api.js';

interface SavedResponse {
  isSaved: boolean[];
}

export const checkSaved = defineTool({
  name: 'check_saved',
  displayName: 'Check Saved Status',
  description:
    'Check whether a location (restaurant, hotel, or attraction) is saved/bookmarked by the current user. Requires the location ID.',
  summary: 'Check if a place is saved',
  icon: 'bookmark',
  group: 'Saves',
  input: z.object({
    location_id: z.number().int().describe('Location ID to check'),
  }),
  output: z.object({
    is_saved: z.boolean().describe('Whether the location is saved by the current user'),
    location_id: z.number().int().describe('Location ID that was checked'),
  }),
  handle: async params => {
    const results = await graphql<SavedResponse>([
      {
        variables: {
          request: {
            id: String(params.location_id),
            type: 'location',
          },
        },
        queryId: '25f9ddb1ce629144',
      },
    ]);

    return {
      is_saved: results[0]?.isSaved?.[0] ?? false,
      location_id: params.location_id,
    };
  },
});
