import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type NextResponse, type RawCommentEntity, commentSchema } from './schemas.js';

const mapCommentEntity = (c: RawCommentEntity) => {
  const likeText = c.toolbar?.likeCountA11y ?? '0';
  return {
    comment_id: c.properties?.commentId ?? '',
    text: c.properties?.content?.content ?? '',
    author: c.author?.displayName ?? '',
    author_channel_id: c.author?.channelId ?? '',
    like_count: likeText,
    published_time: c.properties?.publishedTime ?? '',
    reply_count: Number.parseInt(c.toolbar?.replyCount ?? '0', 10) || 0,
  };
};

export const getVideoComments = defineTool({
  name: 'get_video_comments',
  displayName: 'Get Video Comments',
  description:
    'Get comments on a YouTube video. Returns the top-level comments with author, text, likes, and reply count.',
  summary: 'Get comments on a video',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    video_id: z.string().describe('YouTube video ID'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('List of comments'),
  }),
  handle: async params => {
    // Step 1: Get the continuation token from the next endpoint
    const nextData = await api<NextResponse>('next', {
      videoId: params.video_id,
    });

    const watchContents = nextData.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    const commentSection = watchContents?.find(
      c => c.itemSectionRenderer?.sectionIdentifier === 'comment-item-section',
    );
    const continuationToken =
      commentSection?.itemSectionRenderer?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint
        ?.continuationCommand?.token;

    if (!continuationToken) {
      return { comments: [] };
    }

    // Step 2: Fetch comments using the continuation token
    const commentsData = await api<NextResponse>('next', {
      continuation: continuationToken,
    });

    // Comment data is in frameworkUpdates.entityBatchUpdate.mutations (commentEntityPayload)
    const mutations = commentsData.frameworkUpdates?.entityBatchUpdate?.mutations;
    const comments = (mutations ?? []).flatMap(m => {
      const entity = m.payload?.commentEntityPayload;
      return entity ? [mapCommentEntity(entity)] : [];
    });

    return { comments };
  },
});
