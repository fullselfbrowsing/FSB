import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getTeamId } from '../posthog-api.js';
import { type RawAction, actionSchema, mapAction } from './schemas.js';

export const getAction = defineTool({
  name: 'get_action',
  displayName: 'Get Action',
  description: 'Get detailed information about a specific action including its tags and calculation status.',
  summary: 'Get action details',
  icon: 'zap',
  group: 'Actions',
  input: z.object({
    action_id: z.number().int().describe('Action ID'),
  }),
  output: z.object({
    action: actionSchema.describe('The action details'),
  }),
  handle: async params => {
    const data = await api<RawAction>(`/api/projects/${getTeamId()}/actions/${params.action_id}/`);
    return { action: mapAction(data) };
  },
});
