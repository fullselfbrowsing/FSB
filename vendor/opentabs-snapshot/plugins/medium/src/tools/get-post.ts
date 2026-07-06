import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';
import { postSchema, type RawPost, mapPost } from './schemas.js';

export const getPost = defineTool({
  name: 'get_post',
  displayName: 'Get Post',
  description:
    'Get detailed information about a Medium post by its ID. Returns title, author, clap count, tags, and more.',
  summary: 'Get a post by ID',
  icon: 'file-text',
  group: 'Posts',
  input: z.object({
    post_id: z.string().describe('Medium post ID (e.g., "978090b95f93")'),
  }),
  output: z.object({ post: postSchema }),
  handle: async params => {
    const data = await gql<{ post: RawPost | null }>(
      'PostQuery',
      `query PostQuery($id: ID!) {
        post(id: $id) {
          id title uniqueSlug mediumUrl firstPublishedAt latestPublishedAt readingTime
          clapCount voterCount responsesCount isLocked visibility
          creator { id name username imageId }
          collection { id name slug }
          tags { id displayTitle normalizedTagSlug }
          extendedPreviewContent { subtitle }
        }
      }`,
      { id: params.post_id },
    );
    if (!data.post) throw ToolError.notFound(`Post not found: ${params.post_id}`);
    return { post: mapPost(data.post) };
  },
});
