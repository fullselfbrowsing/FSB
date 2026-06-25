import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';

export const getUserThumbnail = defineTool({
  name: 'get_user_thumbnail',
  displayName: 'Get User Thumbnail',
  description:
    'Get a user thumbnail image URL by their numeric user ID. Returns both standard and medium-sized thumbnails.',
  summary: 'Get a user thumbnail image by user ID',
  icon: 'image',
  group: 'User',
  input: z.object({
    user_id: z.string().min(1).describe('Numeric user ID'),
  }),
  output: z.object({
    thumbnail_url: z.string().nullable().describe('Standard thumbnail image URL'),
    thumbnail_url_medium: z.string().nullable().describe('Medium-sized thumbnail image URL'),
  }),
  handle: async params => {
    const encodedId = btoa(`User:${params.user_id}`);

    const data = await graphql<{
      userBlock: {
        users: Array<{
          userRepresentationUrl?: {
            thumbnailUrl?: string | null;
            thumbnailUrlMedium?: string | null;
          };
        }>;
      };
    }>('GetThumbnailPicQuery', QUERY_HASHES.GetThumbnailPicQuery, {
      ids: [encodedId],
    });

    const user = data.userBlock?.users?.[0];

    return {
      thumbnail_url: user?.userRepresentationUrl?.thumbnailUrl ?? null,
      thumbnail_url_medium: user?.userRepresentationUrl?.thumbnailUrlMedium ?? null,
    };
  },
});
