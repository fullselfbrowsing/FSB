import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { instanceSchema, mapInstance, extractInstances } from './schemas.js';

export const listInstances = defineTool({
  name: 'list_instances',
  displayName: 'List EC2 Instances',
  description:
    'List EC2 instances in the current region. Returns instance ID, type, state, IPs, VPC, and tags. Supports filtering by instance IDs. Defaults to max 50 results.',
  summary: 'List EC2 instances in the current region',
  icon: 'server',
  group: 'EC2',
  input: z.object({
    instance_ids: z
      .array(z.string())
      .optional()
      .describe('Filter by specific instance IDs (e.g., ["i-1234567890abcdef0"])'),
    max_results: z
      .number()
      .int()
      .min(5)
      .max(1000)
      .optional()
      .describe('Maximum number of instances to return (default 50)'),
  }),
  output: z.object({
    instances: z.array(instanceSchema).describe('List of EC2 instances'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {
      MaxResults: String(params.max_results ?? 50),
    };

    if (params.instance_ids) {
      for (let i = 0; i < params.instance_ids.length; i++) {
        const id = params.instance_ids[i];
        if (id) queryParams[`InstanceId.${i + 1}`] = id;
      }
      // When filtering by ID, remove MaxResults (not supported with InstanceId filter)
      delete queryParams.MaxResults;
    }

    const data = await awsApi('ec2', 'DescribeInstances', queryParams, { version: '2016-11-15' });
    return { instances: extractInstances(data as Record<string, unknown>).map(mapInstance) };
  },
});
