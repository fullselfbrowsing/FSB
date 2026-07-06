import { redditGet } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface FlairEntry {
  id: string;
  text: string;
  text_editable: boolean;
  type: string;
  background_color: string;
  text_color: string;
}

export const listFlairs = defineTool({
  name: 'list_flairs',
  displayName: 'List Flairs',
  description:
    'List available post flairs for a subreddit. Use the returned flair ID with submit_post to satisfy subreddits that require flair.',
  summary: 'List post flairs for a subreddit',
  icon: 'tag',
  group: 'Subreddits',
  input: z.object({
    subreddit: z.string().min(1).describe('Subreddit name without r/ prefix (e.g., "ClaudeAI")'),
  }),
  output: z.object({
    flairs: z.array(
      z.object({
        id: z.string().describe('Flair ID — pass this as flair_id to submit_post'),
        text: z.string().describe('Flair display text'),
        text_editable: z.boolean().describe('Whether the flair text can be customized'),
      }),
    ),
  }),
  handle: async params => {
    const data = await redditGet<FlairEntry[]>(`/r/${params.subreddit}/api/link_flair_v2.json`);

    const flairs = (Array.isArray(data) ? data : []).map(f => ({
      id: f.id,
      text: f.text,
      text_editable: f.text_editable ?? false,
    }));

    return { flairs };
  },
});
