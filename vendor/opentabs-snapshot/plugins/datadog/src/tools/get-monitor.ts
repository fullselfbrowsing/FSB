// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../datadog-api.js';

export const getMonitor = defineTool({
  name: 'get_monitor',
  displayName: 'Get Monitor',
  description: 'Get detailed information about a single Datadog monitor by its monitor ID.',
  summary: 'Get a monitor by id',
  icon: 'bell',
  group: 'Monitors',
  input: z.object({
    monitor_id: z.number().int().describe('Datadog monitor ID'),
  }),
  output: z.object({
    id: z.number().describe('Monitor ID'),
    name: z.string().describe('Monitor name'),
    overall_state: z.string().optional().describe('Monitor overall state'),
  }),
  handle: async (params: { monitor_id: number }) => {
    // NEVER executed by the importer. Upstream: api GET /monitor/:id (default method).
    const data = await api<{ id: number; name: string }>(`/monitor/${params.monitor_id}`);
    return data;
  },
});
