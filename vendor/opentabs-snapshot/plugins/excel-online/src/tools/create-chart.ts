import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawChart } from './schemas.js';
import { chartSchema, mapChart } from './schemas.js';

export const createChart = defineTool({
  name: 'create_chart',
  displayName: 'Create Chart',
  description:
    'Create a new chart in a worksheet from a data range. Supports chart types like ColumnClustered, Line, Pie, Bar, Area, and more. The source_data range should include headers.',
  summary: 'Create a chart from data',
  icon: 'chart-bar',
  group: 'Charts',
  input: z.object({
    worksheet: z.string().describe('Worksheet name to create the chart in'),
    type: z
      .string()
      .describe('Chart type (e.g., "ColumnClustered", "Line", "Pie", "Bar", "Area", "XYScatter", "Doughnut")'),
    source_data: z.string().describe('Source data range in A1 notation (e.g., "A1:C10")'),
    series_by: z
      .enum(['Auto', 'Columns', 'Rows'])
      .optional()
      .describe('How data series are organized (default "Auto")'),
  }),
  output: z.object({ chart: chartSchema }),
  handle: async params => {
    const data = await workbookApi<RawChart>(`/worksheets('${encodeURIComponent(params.worksheet)}')/charts/Add`, {
      method: 'POST',
      body: {
        type: params.type,
        sourceData: params.source_data,
        seriesBy: params.series_by ?? 'Auto',
      },
    });
    return { chart: mapChart(data) };
  },
});
