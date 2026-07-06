import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, queries } from '../meticulous-api.js';
import { userSchema, mapUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the currently authenticated user profile including email, name, and admin status.',
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'User',
  input: z.object({}),
  output: z.object({ user: userSchema, is_signed_in: z.boolean() }),
  handle: async () => {
    const data = await graphql<{ authInfo: { isSignedIn: boolean; user: Record<string, unknown> } }>(
      queries.GET_USER_CONTEXT,
    );
    return {
      user: mapUser(data.authInfo.user),
      is_signed_in: data.authInfo.isSignedIn,
    };
  },
});
