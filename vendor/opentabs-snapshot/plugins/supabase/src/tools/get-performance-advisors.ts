import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const getPerformanceAdvisors = defineTool({
  name: 'get_performance_advisors',
  displayName: 'Get Performance Advisors',
  description:
    'Get performance advisor recommendations for a Supabase project. ' +
    'Identifies potential performance issues like missing indexes, unused indexes, and slow queries.',
  summary: 'Get performance advisor recommendations',
  icon: 'gauge',
  group: 'Advisors',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    advisors: z.array(z.record(z.string(), z.unknown())).describe('Performance advisories'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/advisors/performance`);
    return { advisors: Array.isArray(data) ? data : [] };
  },
});
