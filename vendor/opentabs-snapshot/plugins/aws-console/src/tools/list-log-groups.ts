import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { logGroupSchema, mapLogGroup, normalizeList } from './schemas.js';
import type { RawLogGroup } from './schemas.js';

export const listLogGroups = defineTool({
  name: 'list_log_groups',
  displayName: 'List CloudWatch Log Groups',
  description:
    'List CloudWatch Logs log groups in the current region. Optionally filter by name prefix. Returns log group name, ARN, retention, and stored bytes.',
  summary: 'List CloudWatch Logs log groups',
  icon: 'scroll-text',
  group: 'CloudWatch',
  input: z.object({
    prefix: z.string().optional().describe('Filter by log group name prefix (e.g., /aws/lambda/)'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum log groups to return (default 50)'),
  }),
  output: z.object({
    log_groups: z.array(logGroupSchema).describe('List of CloudWatch Logs log groups'),
    next_token: z.string().describe('Pagination token for next page (empty if no more)'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.prefix) body.logGroupNamePrefix = params.prefix;
    if (params.limit) body.limit = params.limit;

    const data = await awsApi<{ logGroups?: RawLogGroup[]; nextToken?: string }>(
      'logs',
      'Logs_20140328.DescribeLogGroups',
      {},
      {
        jsonBody: body,
        contentType: 'application/x-amz-json-1.1',
      },
    );

    return {
      log_groups: normalizeList(data.logGroups).map(mapLogGroup),
      next_token: data.nextToken ?? '',
    };
  },
});
