import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';
import { securityGroupSchema, mapSecurityGroup, normalizeList } from './schemas.js';
import type { RawSecurityGroup } from './schemas.js';

export const listSecurityGroups = defineTool({
  name: 'list_security_groups',
  displayName: 'List Security Groups',
  description: 'List EC2 security groups in the current region. Returns group ID, name, description, and VPC ID.',
  summary: 'List EC2 security groups',
  icon: 'shield',
  group: 'EC2',
  input: z.object({
    max_results: z.number().int().min(5).max(1000).optional().describe('Maximum results (default 100)'),
  }),
  output: z.object({
    security_groups: z.array(securityGroupSchema).describe('List of security groups'),
  }),
  handle: async params => {
    const data = await awsApi(
      'ec2',
      'DescribeSecurityGroups',
      { MaxResults: String(params.max_results ?? 100) },
      { version: '2016-11-15' },
    );
    const sgSet = (data as Record<string, unknown>).securityGroupInfo as Record<string, unknown> | undefined;
    const items = normalizeList(sgSet?.item as RawSecurityGroup[]);
    return { security_groups: items.map(mapSecurityGroup) };
  },
});
