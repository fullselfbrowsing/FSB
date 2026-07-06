import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawLimit, limitSchema, mapLimit } from './schemas.js';

export const getUserLimits = defineTool({
  name: 'get_user_limits',
  displayName: 'Get User Limits',
  description:
    'Get the current rate limits for the authenticated user including daily posting, photo, video, audio, and follow limits.',
  summary: 'Get your Tumblr rate limits',
  icon: 'gauge',
  group: 'Account',
  input: z.object({}),
  output: z.object({ limits: z.record(z.string(), limitSchema) }),
  handle: async () => {
    const data = await api<Record<string, RawLimit>>('/user/limits');
    const limits: Record<string, z.infer<typeof limitSchema>> = {};
    for (const [key, raw] of Object.entries(data)) {
      if (raw && typeof raw === 'object') {
        limits[key] = mapLimit(raw);
      }
    }
    return { limits };
  },
});
