import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';
import { streamSchema, mapStream } from './schemas.js';
import type { RawStream } from './schemas.js';

export const getStream = defineTool({
  name: 'get_stream',
  displayName: 'Get Stream',
  description:
    'Get the current live stream for a channel by login name. Returns stream title, viewer count, game, and start time. Returns null stream if the channel is offline.',
  summary: 'Get live stream info for a channel',
  icon: 'radio',
  group: 'Streams',
  input: z.object({
    login: z.string().describe('Channel login name (e.g., "shroud")'),
  }),
  output: z.object({
    stream: streamSchema.nullable().describe('Current stream info, or null if offline'),
    isLive: z.boolean().describe('Whether the channel is currently live'),
  }),
  handle: async params => {
    const data = await gql<{
      user: {
        id?: string;
        stream?: RawStream | null;
      } | null;
    }>(`{
      user(login: "${params.login}") {
        id
        stream {
          id title viewersCount type createdAt
          broadcaster { id login displayName profileImageURL(width: 70) }
          game { id name }
        }
      }
    }`);
    if (!data.user) throw ToolError.notFound(`Channel "${params.login}" not found`);
    const stream = data.user.stream ? mapStream(data.user.stream) : null;
    return { stream, isLive: !!data.user.stream };
  },
});
