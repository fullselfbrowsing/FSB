import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { videoSchema, mapVideo } from './schemas.js';
import type { RawVideo } from './schemas.js';

export const getUserVideos = defineTool({
  name: 'get_user_videos',
  displayName: 'Get User Videos',
  description:
    'Get videos (VODs, highlights, uploads) from a Twitch channel. Optionally filter by video type and sort order.',
  summary: 'Get videos from a Twitch channel',
  icon: 'video',
  group: 'Videos',
  input: z.object({
    login: z.string().describe('Broadcaster login name (e.g., "shroud")'),
    type: z
      .enum(['ARCHIVE', 'HIGHLIGHT', 'UPLOAD', 'PAST_PREMIERE'])
      .optional()
      .describe('Video type filter (default: all types)'),
    sort: z.enum(['TIME', 'VIEWS']).optional().describe('Sort order (default TIME — most recent first)'),
    first: z.number().int().min(1).max(25).optional().describe('Number of videos to return (default 10, max 25)'),
  }),
  output: z.object({
    videos: z.array(videoSchema),
    totalCount: z.number().describe('Total number of videos available'),
  }),
  handle: async params => {
    const first = params.first ?? 10;
    const sort = params.sort ?? 'TIME';
    const typeArg = params.type ? `, type: ${params.type}` : '';
    const data = await gql<{
      user: { videos: { totalCount: number; edges: Array<{ node: RawVideo }> } } | null;
    }>(`{
      user(login: "${params.login}") {
        videos(first: ${first}, sort: ${sort}${typeArg}) {
          totalCount
          edges {
            node {
              id title viewCount publishedAt lengthSeconds
              game { id name }
              thumbnailURLs(width: 320, height: 180)
            }
          }
        }
      }
    }`);
    if (!data.user) throw ToolError.notFound(`User "${params.login}" not found`);
    interface RawVideoNode extends RawVideo {
      thumbnailURLs?: string[];
    }
    const edges = data.user.videos?.edges ?? [];
    return {
      videos: edges.map(e => {
        const node = e.node as RawVideoNode;
        return mapVideo({
          ...node,
          thumbnailURL: node.thumbnailURLs?.[0] ?? '',
        });
      }),
      totalCount: data.user.videos?.totalCount ?? 0,
    };
  },
});
