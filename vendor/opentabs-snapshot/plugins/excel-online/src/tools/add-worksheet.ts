import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawWorksheet } from './schemas.js';
import { worksheetSchema, mapWorksheet } from './schemas.js';

export const addWorksheet = defineTool({
  name: 'add_worksheet',
  displayName: 'Add Worksheet',
  description:
    'Add a new worksheet to the currently open Excel workbook. Optionally specify a name for the new worksheet.',
  summary: 'Add a new worksheet',
  icon: 'plus',
  group: 'Worksheets',
  input: z.object({
    name: z.string().optional().describe('Name for the new worksheet. Auto-generated if omitted.'),
  }),
  output: z.object({ worksheet: worksheetSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name) body.name = params.name;
    const data = await workbookApi<RawWorksheet>('/worksheets', { method: 'POST', body });
    return { worksheet: mapWorksheet(data) };
  },
});
