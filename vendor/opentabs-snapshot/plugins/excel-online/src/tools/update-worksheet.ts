import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawWorksheet } from './schemas.js';
import { worksheetSchema, mapWorksheet } from './schemas.js';

export const updateWorksheet = defineTool({
  name: 'update_worksheet',
  displayName: 'Update Worksheet',
  description:
    'Update worksheet properties such as name, position, or visibility. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update worksheet name, position, or visibility',
  icon: 'pencil',
  group: 'Worksheets',
  input: z.object({
    name: z.string().describe('Current name of the worksheet to update'),
    new_name: z.string().optional().describe('New name for the worksheet'),
    position: z.number().int().min(0).optional().describe('New zero-based position'),
    visibility: z.enum(['Visible', 'Hidden', 'VeryHidden']).optional().describe('New visibility state'),
  }),
  output: z.object({ worksheet: worksheetSchema }),
  handle: async params => {
    const body = stripUndefined({
      name: params.new_name,
      position: params.position,
      visibility: params.visibility,
    });
    const data = await workbookApi<RawWorksheet>(`/worksheets('${encodeURIComponent(params.name)}')`, {
      method: 'PATCH',
      body,
    });
    return { worksheet: mapWorksheet(data) };
  },
});
