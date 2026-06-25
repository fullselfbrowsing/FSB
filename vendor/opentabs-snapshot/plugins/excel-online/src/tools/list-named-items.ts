import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { GraphListResponse, RawNamedItem } from './schemas.js';
import { namedItemSchema, mapNamedItem } from './schemas.js';

export const listNamedItems = defineTool({
  name: 'list_named_items',
  displayName: 'List Named Items',
  description:
    'List all named items (named ranges, constants) in the workbook. Named items are user-defined names that refer to ranges, values, or formulas.',
  summary: 'List named ranges and constants',
  icon: 'tag',
  group: 'Workbook',
  input: z.object({}),
  output: z.object({ items: z.array(namedItemSchema) }),
  handle: async () => {
    const data = await workbookApi<GraphListResponse<RawNamedItem>>('/names');
    return { items: (data.value ?? []).map(mapNamedItem) };
  },
});
