import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { subnetSchema, mapSubnet, normalizeList } from './schemas.js';
import type { RawSubnet } from './schemas.js';

export const listSubnets = defineTool({
  name: 'list_subnets',
  displayName: 'List Subnets',
  description:
    'List VPC subnets in the current region. Optionally filter by VPC ID. Returns subnet ID, CIDR block, availability zone, and available IP count.',
  summary: 'List VPC subnets in the current region',
  icon: 'git-branch',
  group: 'EC2',
  input: z.object({
    vpc_id: z.string().optional().describe('Filter by VPC ID'),
  }),
  output: z.object({
    subnets: z.array(subnetSchema).describe('List of subnets'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {};
    if (params.vpc_id) {
      queryParams['Filter.1.Name'] = 'vpc-id';
      queryParams['Filter.1.Value.1'] = params.vpc_id;
    }
    const data = await awsApi('ec2', 'DescribeSubnets', queryParams, { version: '2016-11-15' });
    const subnetSet = (data as Record<string, unknown>).subnetSet as Record<string, unknown> | undefined;
    const items = normalizeList(subnetSet?.item as RawSubnet[]);
    return { subnets: items.map(mapSubnet) };
  },
});
