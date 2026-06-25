import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { mapOrgStatistics, orgStatisticsSchema } from './schemas.js';

export const getOrganizationStatistics = defineTool({
  name: 'get_organization_statistics',
  displayName: 'Get Organization Statistics',
  description:
    'Get seat usage statistics for the current Calendly organization including available seats, active users, pending invitations, and occupancy ratio.',
  summary: 'Get organization seat statistics',
  icon: 'bar-chart-3',
  group: 'Organization',
  input: z.object({}),
  output: z.object({ statistics: orgStatisticsSchema }),
  handle: async () => {
    const data = await api<Record<string, unknown>>('/organization/statistics');
    return { statistics: mapOrgStatistics(data) };
  },
});
