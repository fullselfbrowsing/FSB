import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';
import {
  type AsanaResponse,
  type RawUser,
  type RawWorkspace,
  mapUser,
  mapWorkspace,
  userSchema,
  workspaceSchema,
} from './schemas.js';

interface RawCurrentUser extends RawUser {
  workspaces?: RawWorkspace[] | null;
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated Asana user, including their workspaces.',
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('The current user'),
    workspaces: z.array(workspaceSchema).describe('Workspaces the user belongs to'),
  }),
  handle: async () => {
    const data = await api<AsanaResponse<RawCurrentUser>>('/users/me', {
      query: {
        opt_fields: 'name,email,workspaces.gid,workspaces.name',
      },
    });
    const raw = data.data;
    return {
      user: mapUser(raw),
      workspaces: (raw?.workspaces ?? []).map(mapWorkspace),
    };
  },
});
