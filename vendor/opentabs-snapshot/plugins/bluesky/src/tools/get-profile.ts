// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const getProfile = defineTool({
  name: 'get_profile',
  displayName: 'Get Profile',
  description: 'Get a Bluesky profile by handle or DID, including display name, bio, and follower counts.',
  summary: 'look up a bluesky profile',
  icon: 'user',
  group: 'Profiles',
  input: z.object({
    actor: z.string().min(1).describe('The handle (e.g. alice.bsky.social) or DID of the profile to fetch'),
  }),
  output: z.object({
    profile: z.object({
      did: z.string(),
      handle: z.string(),
      display_name: z.string().optional(),
      followers_count: z.number().optional(),
    }).describe('The profile'),
  }),
  handle: async (params: { actor: string }) => {
    // NEVER executed by the importer. Upstream: api GET app.bsky.actor.getProfile (default method).
    const data = await api<{ profile: { did: string; handle: string; display_name?: string; followers_count?: number } }>(
      '/xrpc/app.bsky.actor.getProfile',
      { query: { actor: params.actor } }
    );
    return { profile: data.profile };
  },
});
