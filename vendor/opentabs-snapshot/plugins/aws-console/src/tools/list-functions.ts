import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { lambdaFunctionSchema, mapLambdaFunction, normalizeList } from './schemas.js';
import type { RawLambdaFunction } from './schemas.js';

export const listFunctions = defineTool({
  name: 'list_functions',
  displayName: 'List Lambda Functions',
  description:
    'List Lambda functions in the current region. Returns function name, ARN, runtime, memory, timeout, and state. Supports pagination via marker.',
  summary: 'List Lambda functions in the current region',
  icon: 'zap',
  group: 'Lambda',
  input: z.object({
    max_items: z.number().int().min(1).max(50).optional().describe('Maximum functions to return (default 50)'),
    marker: z.string().optional().describe('Pagination marker from a previous response'),
  }),
  output: z.object({
    functions: z.array(lambdaFunctionSchema).describe('List of Lambda functions'),
    next_marker: z.string().describe('Pagination marker for next page (empty if no more)'),
  }),
  handle: async params => {
    const queryParts: string[] = [];
    if (params.max_items) queryParts.push(`MaxItems=${params.max_items}`);
    if (params.marker) queryParts.push(`Marker=${encodeURIComponent(params.marker)}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    const data = await awsApi<{ Functions?: RawLambdaFunction[]; NextMarker?: string }>(
      'lambda',
      '',
      {},
      {
        method: 'GET',
        path: `/2015-03-31/functions${qs}`,
        rawBody: '',
      },
    );

    return {
      functions: normalizeList(data.Functions).map(mapLambdaFunction),
      next_marker: data.NextMarker ?? '',
    };
  },
});
