import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { vpcSchema, mapVpc, normalizeList } from './schemas.js';
import type { RawVpc } from './schemas.js';

export const listVpcs = defineTool({
  name: 'list_vpcs',
  displayName: 'List VPCs',
  description: 'List VPCs in the current region. Returns VPC ID, CIDR block, state, and whether it is the default VPC.',
  summary: 'List VPCs in the current region',
  icon: 'network',
  group: 'EC2',
  input: z.object({}),
  output: z.object({
    vpcs: z.array(vpcSchema).describe('List of VPCs'),
  }),
  handle: async () => {
    const data = await awsApi('ec2', 'DescribeVpcs', {}, { version: '2016-11-15' });
    const vpcSet = (data as Record<string, unknown>).vpcSet as Record<string, unknown> | undefined;
    const items = normalizeList(vpcSet?.item as RawVpc[]);
    return { vpcs: items.map(mapVpc) };
  },
});
