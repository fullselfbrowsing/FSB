import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { spiferack, getUsername } from '../npm-api.js';
import { tokenSchema, mapToken } from './schemas.js';
import type { RawToken } from './schemas.js';

interface TokensResponse {
  list?: { objects?: RawToken[] };
}

export const list_tokens = defineTool({
  name: 'list_tokens',
  displayName: 'List Tokens',
  description:
    "List the authenticated user's access tokens. Shows token prefixes and read-only status. Requires authentication.",
  summary: 'List your npm access tokens',
  icon: 'key',
  group: 'Settings',
  input: z.object({}),
  output: z.object({
    tokens: z.array(tokenSchema).describe('Access tokens'),
  }),
  handle: async () => {
    const username = getUsername();
    const data = await spiferack<TokensResponse>(`/settings/${username}/tokens`);
    return {
      tokens: (data.list?.objects ?? []).map(mapToken),
    };
  },
});
