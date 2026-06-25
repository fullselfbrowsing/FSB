import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { lambdaFunctionSchema, mapLambdaFunction } from './schemas.js';
import type { RawLambdaFunction } from './schemas.js';

export const getFunction = defineTool({
  name: 'get_function',
  displayName: 'Get Lambda Function',
  description:
    'Get detailed configuration of a specific Lambda function by name or ARN. Returns runtime, handler, memory, timeout, state, and description.',
  summary: 'Get details of a specific Lambda function',
  icon: 'zap',
  group: 'Lambda',
  input: z.object({
    function_name: z.string().min(1).describe('Function name or ARN'),
  }),
  output: z.object({ function: lambdaFunctionSchema }),
  handle: async params => {
    const data = await awsApi<{ Configuration?: RawLambdaFunction }>(
      'lambda',
      '',
      {},
      {
        method: 'GET',
        path: `/2015-03-31/functions/${encodeURIComponent(params.function_name)}`,
        rawBody: '',
      },
    );
    return { function: mapLambdaFunction(data.Configuration ?? (data as unknown as RawLambdaFunction)) };
  },
});
