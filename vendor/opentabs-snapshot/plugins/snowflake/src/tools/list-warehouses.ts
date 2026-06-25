import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runQuery } from '../snowflake-api.js';
import { mapWarehouse, warehouseSchema } from './schemas.js';

export const listWarehouses = defineTool({
  name: 'list_warehouses',
  displayName: 'List Warehouses',
  description:
    'List all warehouses accessible to the current role. Returns warehouse names, sizes, states (STARTED, SUSPENDED), auto-suspend/resume settings, and running/queued query counts.',
  summary: 'List available warehouses',
  icon: 'server',
  group: 'Schema',
  input: z.object({}),
  output: z.object({
    warehouses: z.array(warehouseSchema).describe('List of accessible warehouses'),
  }),
  handle: async () => {
    const result = await runQuery('SHOW WAREHOUSES');
    const warehouses = result.rows.map(mapWarehouse);
    return { warehouses };
  },
});
