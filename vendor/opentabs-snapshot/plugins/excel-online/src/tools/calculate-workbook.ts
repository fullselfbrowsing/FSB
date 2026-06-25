import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { workbookApi } from '../excel-api.js';

export const calculateWorkbook = defineTool({
  name: 'calculate_workbook',
  displayName: 'Calculate Workbook',
  description:
    'Recalculate all formulas in the workbook. Use calculation_type "Recalculate" for normal recalculation, "Full" to force recalculation of all formulas, or "FullRebuild" to rebuild the dependency chain and recalculate.',
  summary: 'Recalculate all formulas',
  icon: 'calculator',
  group: 'Workbook',
  input: z.object({
    calculation_type: z
      .enum(['Recalculate', 'Full', 'FullRebuild'])
      .optional()
      .describe('Calculation type (default "Recalculate")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await workbookApi('/application/calculate', {
      method: 'POST',
      body: { calculationType: params.calculation_type ?? 'Recalculate' },
    });
    return { success: true };
  },
});
