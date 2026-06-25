import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';
import type { RawNamedItem } from './schemas.js';
import { namedItemSchema, mapNamedItem } from './schemas.js';

export const addNamedItem = defineTool({
  name: 'add_named_item',
  displayName: 'Add Named Item',
  description:
    'Add a named range or named value to the workbook. For a range, provide a reference like "Sheet1!A1:C10". For a value or formula, provide the value directly.',
  summary: 'Create a named range or constant',
  icon: 'tag',
  group: 'Workbook',
  input: z.object({
    name: z.string().describe('Name for the named item (must be unique in the workbook)'),
    reference: z.string().describe('Range reference (e.g., "Sheet1!A1:C10") or value/formula'),
    comment: z.string().optional().describe('Optional comment for the named item'),
  }),
  output: z.object({ item: namedItemSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {
      name: params.name,
      reference: params.reference,
    };
    if (params.comment) body.comment = params.comment;
    const data = await workbookApi<RawNamedItem>('/names/add', { method: 'POST', body });
    return { item: mapNamedItem(data) };
  },
});
