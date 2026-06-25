import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getViewerId } from '../medium-api.js';

interface FollowTagData {
  followTag: { id: string; displayTitle: string };
}

export const followTag = defineTool({
  name: 'follow_tag',
  displayName: 'Follow Tag',
  description: 'Follow a Medium tag/topic to see more posts about it in your feed.',
  summary: 'Follow a tag',
  icon: 'plus-circle',
  group: 'Tags',
  input: z.object({
    tag_slug: z.string().describe('Tag slug to follow (e.g., "javascript", "data-science")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
    tag_id: z.string().describe('Followed tag ID'),
    tag_title: z.string().describe('Followed tag display title'),
  }),
  handle: async params => {
    const viewerId = getViewerId();
    const data = await gql<FollowTagData>(
      'FollowTagMutation',
      `mutation FollowTagMutation($tagSlug: ID!, $userId: ID!) {
        followTag(tagSlug: $tagSlug, userId: $userId) { id displayTitle }
      }`,
      { tagSlug: params.tag_slug, userId: viewerId },
      true,
    );
    return {
      success: true,
      tag_id: data.followTag?.id ?? params.tag_slug,
      tag_title: data.followTag?.displayTitle ?? '',
    };
  },
});
