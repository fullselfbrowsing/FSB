import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

const serviceHealthSchema = z.object({
  name: z.string().describe('Service name (e.g., "database", "realtime", "auth")'),
  status: z.string().describe('Health status (e.g., "HEALTHY", "UNHEALTHY", "COMING_UP")'),
});

export const getProjectHealth = defineTool({
  name: 'get_project_health',
  displayName: 'Get Project Health',
  description:
    'Get the health status of all services in a Supabase project ' + '(database, auth, realtime, storage, etc.).',
  summary: 'Check project service health',
  icon: 'heart-pulse',
  group: 'Projects',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    services: z.array(serviceHealthSchema).describe('Health status of each service'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/health`, {
      query: { services: 'auth,realtime,rest,storage,db' },
    });
    const services = Array.isArray(data)
      ? data.map(s => ({
          name: (s.name as string) ?? '',
          status: (s.status as string) ?? '',
        }))
      : [];
    return { services };
  },
});
