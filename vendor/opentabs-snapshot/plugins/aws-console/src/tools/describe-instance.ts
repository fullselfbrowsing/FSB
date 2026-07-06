import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { instanceSchema, mapInstance, extractInstances } from './schemas.js';

export const describeInstance = defineTool({
  name: 'describe_instance',
  displayName: 'Describe EC2 Instance',
  description:
    'Get detailed information about a specific EC2 instance by ID. Returns instance type, state, IPs, VPC, tags, key pair, and availability zone.',
  summary: 'Get details of a specific EC2 instance',
  icon: 'server',
  group: 'EC2',
  input: z.object({
    instance_id: z.string().min(1).describe('EC2 instance ID (e.g., i-1234567890abcdef0)'),
  }),
  output: z.object({ instance: instanceSchema }),
  handle: async params => {
    const data = await awsApi(
      'ec2',
      'DescribeInstances',
      { 'InstanceId.1': params.instance_id },
      { version: '2016-11-15' },
    );
    const instances = extractInstances(data as Record<string, unknown>);
    const first = instances[0];
    if (!first) throw ToolError.notFound(`Instance ${params.instance_id} not found.`);
    return { instance: mapInstance(first) };
  },
});
