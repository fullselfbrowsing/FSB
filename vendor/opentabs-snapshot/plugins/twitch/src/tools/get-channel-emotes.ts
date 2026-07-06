import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../twitch-api.js';

const emoteSchema = z.object({
  id: z.string().describe('Emote ID'),
  token: z.string().describe('Emote name/token used in chat'),
});

export const getChannelEmotes = defineTool({
  name: 'get_channel_emotes',
  displayName: 'Get Channel Emotes',
  description:
    'Get subscription emotes for a Twitch channel. Returns the emote name (token) and ID for each emote across all subscription tiers.',
  summary: 'Get subscription emotes for a channel',
  icon: 'smile',
  group: 'Chat',
  input: z.object({
    login: z.string().describe('Channel login name (e.g., "shroud")'),
  }),
  output: z.object({ emotes: z.array(emoteSchema) }),
  handle: async params => {
    interface RawEmote {
      id?: string;
      token?: string;
    }
    interface RawProduct {
      emotes?: RawEmote[];
    }
    const data = await gql<{
      user: { subscriptionProducts: RawProduct[] } | null;
    }>(`{
      user(login: "${params.login}") {
        subscriptionProducts {
          emotes { id token }
        }
      }
    }`);
    if (!data.user) throw ToolError.notFound(`Channel "${params.login}" not found`);
    const allEmotes = (data.user.subscriptionProducts ?? []).flatMap(p => p.emotes ?? []);
    return {
      emotes: allEmotes.map(e => ({
        id: e.id ?? '',
        token: e.token ?? '',
      })),
    };
  },
});
