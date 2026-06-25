import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getGroupId } from '../atlas-api.js';
import { type RawAlertConfig, alertConfigSchema, mapAlertConfig } from './schemas.js';

export const listAlertConfigs = defineTool({
  name: 'list_alert_configs',
  displayName: 'List Alert Configurations',
  description:
    'List all alert configurations for the current MongoDB Atlas project including event type, enabled status, and alert type.',
  summary: 'List alert configurations',
  icon: 'bell-ring',
  group: 'Alerts',
  input: z.object({}),
  output: z.object({
    configs: z.array(alertConfigSchema).describe('Alert configurations'),
  }),
  handle: async () => {
    const groupId = getGroupId();
    const raw = await api<RawAlertConfig[]>(`/activity/alertConfigs/${groupId}`);
    return { configs: (raw ?? []).map(mapAlertConfig) };
  },
});
