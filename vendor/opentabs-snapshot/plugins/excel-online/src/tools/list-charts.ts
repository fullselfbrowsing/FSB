import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { GraphListResponse, RawChart } from './schemas.js';
import { chartSchema, mapChart } from './schemas.js';

export const listCharts = defineTool({
  name: 'list_charts',
  displayName: 'List Charts',
  description: 'List all charts in a worksheet. Returns chart names, IDs, dimensions, and positions.',
  summary: 'List all charts in a worksheet',
  icon: 'chart-bar',
  group: 'Charts',
  input: z.object({
    worksheet: z.string().describe('Worksheet name (e.g., "Sheet1")'),
  }),
  output: z.object({ charts: z.array(chartSchema) }),
  handle: async params => {
    const data = await workbookApi<GraphListResponse<RawChart>>(
      `/worksheets('${encodeURIComponent(params.worksheet)}')/charts`,
    );
    return { charts: (data.value ?? []).map(mapChart) };
  },
});
