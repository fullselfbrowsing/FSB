import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getViewerId } from '../medium-api.js';

export const unfollowTag = defineTool({
  name: 'unfollow_tag',
  displayName: 'Unfollow Tag',
  description: 'Unfollow a Medium tag/topic to stop seeing posts about it in your feed.',
  summary: 'Unfollow a tag',
  icon: 'minus-circle',
  group: 'Tags',
  input: z.object({
    tag_slug: z.string().describe('Tag slug to unfollow (e.g., "javascript", "data-science")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const viewerId = getViewerId();
    await gql<{ unfollowTag: { id: string } }>(
      'UnfollowTagMutation',
      `mutation UnfollowTagMutation($tagSlug: ID!, $userId: ID!) {
        unfollowTag(tagSlug: $tagSlug, userId: $userId) { id displayTitle }
      }`,
      { tagSlug: params.tag_slug, userId: viewerId },
      true,
    );
    return { success: true };
  },
});
