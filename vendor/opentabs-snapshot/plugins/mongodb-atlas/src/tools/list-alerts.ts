import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawAlert, alertSchema, mapAlert } from './schemas.js';

export const listAlerts = defineTool({
  name: 'list_alerts',
  displayName: 'List Alerts',
  description:
    'List all active alerts for the current MongoDB Atlas project including event type, status, and affected cluster.',
  summary: 'List project alerts',
  icon: 'bell',
  group: 'Alerts',
  input: z.object({}),
  output: z.object({ alerts: z.array(alertSchema).describe('Project alerts') }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawAlert[]>(`/user/shared/alerts/project/${groupId}`);
    return { alerts: (raw ?? []).map(mapAlert) };
  },
});
