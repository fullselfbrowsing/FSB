import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, requireContext } from '../carta-api.js';
import { userInfoSchema } from './schemas.js';

interface PendoConfig {
  visitor: {
    id: number;
    email: string;
    name: string;
    user_type: string;
  };
  account: {
    id: number;
    name: string;
  };
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated Carta user profile including name, email, user type, and portfolio info.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'User',
  input: z.object({}),
  output: z.object({ user: userInfoSchema }),
  handle: async () => {
    const ctx = requireContext();
    const data = await api<PendoConfig>(`/api/fe-platform/pendo-config/`, {
      query: { url: `/investors/individual/${ctx.portfolioId}/portfolio/` },
    });
    return {
      user: {
        id: data.visitor.id,
        email: data.visitor.email,
        name: data.visitor.name,
        user_type: data.visitor.user_type,
        account_name: data.account.name,
        portfolio_id: data.account.id,
      },
    };
  },
});
