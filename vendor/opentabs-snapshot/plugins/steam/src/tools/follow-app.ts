import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getSessionId } from '../steam-api.js';

export const followApp = defineTool({
  name: 'follow_app',
  displayName: 'Follow App',
  description:
    'Follow a Steam app to receive notifications about updates, news, and events. The app will appear in your followed apps list.',
  summary: 'Follow an app for update notifications',
  icon: 'bell',
  group: 'Library',
  input: z.object({
    appid: z.number().int().describe('Steam app ID to follow'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    // Steam returns HTTP 500 with body "false" when the app is already followed
    // or already owned, so we cannot use fetchFromPage (which throws on 500).
    const sessionId = getSessionId();
    const body = new URLSearchParams();
    body.set('sessionid', sessionId);
    body.set('appid', String(params.appid));
    const response = await fetch('https://store.steampowered.com/explore/followgame/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: body.toString(),
    });
    const text = await response.text();
    return { success: text.trim() === 'true' };
  },
});
