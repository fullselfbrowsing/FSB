import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';

export const isHost = defineTool({
  name: 'is_host',
  displayName: 'Is Host',
  description: 'Check whether the current user is an Airbnb home host.',
  summary: 'Check if the current user is a host',
  icon: 'badge-check',
  group: 'Navigation',
  input: z.object({}),
  output: z.object({
    is_host: z.boolean().describe('Whether the current user is a home host'),
  }),
  handle: async () => {
    const data = await graphql<{
      viewer: {
        user: {
          isHomeHost?: boolean;
        };
      };
    }>('IsHostQuery', QUERY_HASHES.IsHostQuery);

    return {
      is_host: data.viewer.user.isHomeHost ?? false,
    };
  },
});
