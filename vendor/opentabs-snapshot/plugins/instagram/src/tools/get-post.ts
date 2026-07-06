import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawMedia, mapMedia, mediaSchema } from './schemas.js';

interface MediaInfoResponse {
  items?: RawMedia[];
}

export const getPost = defineTool({
  name: 'get_post',
  displayName: 'Get Post',
  description:
    'Get detailed information about a single Instagram post by its media ID. Returns caption, like/comment counts, author, and image URL.',
  summary: 'Get a post by media ID',
  icon: 'image',
  group: 'Posts',
  input: z.object({
    media_id: z
      .string()
      .describe('Media ID (numeric string, e.g. "3849123669892697076_25025320" or just the numeric pk)'),
  }),
  output: z.object({ post: mediaSchema }),
  handle: async params => {
    const data = await api<MediaInfoResponse>(`/media/${params.media_id}/info/`);
    return { post: mapMedia(data.items?.[0] ?? {}) };
  },
});
