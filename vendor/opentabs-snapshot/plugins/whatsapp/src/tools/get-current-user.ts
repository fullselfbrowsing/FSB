import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getConn, getMeUser } from '../whatsapp-api.js';
import { currentUserSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently logged-in WhatsApp user profile including phone number ID, display name, and platform.',
  summary: 'Get the current WhatsApp user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: currentUserSchema }),
  handle: async () => {
    const conn = getConn();
    const me = getMeUser();
    return {
      user: {
        id: me.pn ?? '',
        lid: me.lid ?? '',
        display_name: conn?.pushname ?? me.displayName ?? '',
        platform: conn?.platform ?? '',
      },
    };
  },
});
