import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';

export const invokeFunction = defineTool({
  name: 'invoke_function',
  displayName: 'Invoke Lambda Function',
  description:
    'Invoke a Lambda function synchronously with a JSON payload. Returns the function response payload. For async (fire-and-forget), set invocation_type to "Event".',
  summary: 'Invoke a Lambda function with a JSON payload',
  icon: 'play',
  group: 'Lambda',
  input: z.object({
    function_name: z.string().min(1).describe('Function name or ARN'),
    payload: z.string().optional().describe('JSON payload to pass to the function (default: empty object)'),
    invocation_type: z
      .enum(['RequestResponse', 'Event', 'DryRun'])
      .optional()
      .describe('RequestResponse (sync, default), Event (async), or DryRun (validate only)'),
  }),
  output: z.object({
    response: z.string().describe('Function response payload as a JSON string (empty for async invocations)'),
  }),
  handle: async params => {
    const body = params.payload ?? '{}';
    const extraHeaders: Record<string, string> = {};
    if (params.invocation_type) {
      extraHeaders['x-amz-invocation-type'] = params.invocation_type;
    }

    const data = await awsApi<string>(
      'lambda',
      '',
      {},
      {
        method: 'POST',
        path: `/2015-03-31/functions/${encodeURIComponent(params.function_name)}/invocations`,
        rawBody: body,
        contentType: 'application/json',
        extraHeaders,
      },
    );

    return { response: typeof data === 'string' ? data : JSON.stringify(data) };
  },
});
