import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { type RawApp, appSchema, mapApp } from './schemas.js';

const QUERY = `query OrgData($product: String) {
  apps { id name }
  currentUser { loginId email fullName orgRole }
  org { orgId name url plan createdAt }
  orgHasAppWithData
  orgCount
  planInfo { plan planType }
}`;

interface RawOrgData {
  apps?: RawApp[];
  currentUser?: {
    loginId?: string;
    email?: string;
    fullName?: string;
    orgRole?: number;
  };
  org?: {
    orgId?: string | number;
    name?: string;
    url?: string;
    plan?: string;
    createdAt?: number;
  };
  orgHasAppWithData?: boolean;
  orgCount?: number;
  planInfo?: { plan?: string; planType?: string };
}

export const getOrgData = defineTool({
  name: 'get_org_data',
  displayName: 'Get Organization Data',
  description:
    'Get organization overview including apps/projects, current user info, plan details, and usage status. This is the bootstrap data for the Amplitude organization.',
  summary: 'Get org data with apps, user, and plan info',
  icon: 'building-2',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    org_id: z.string().describe('Organization numeric ID'),
    org_name: z.string().describe('Organization display name'),
    org_url: z.string().describe('Organization URL slug'),
    plan: z.string().describe('Subscription plan name'),
    plan_type: z.string().describe('Plan type'),
    has_app_with_data: z.boolean().describe('Whether the org has any app with ingested data'),
    org_count: z.number().int().describe('Number of organizations'),
    apps: z.array(appSchema).describe('List of apps/projects'),
    current_user_email: z.string().describe('Currently authenticated user email'),
    current_user_name: z.string().describe('Currently authenticated user name'),
    current_user_role: z.number().int().describe('Current user org role level'),
  }),
  handle: async () => {
    const data = await gql<RawOrgData>('OrgData', QUERY, {
      product: 'analytics',
    });
    return {
      org_id: String(data.org?.orgId ?? ''),
      org_name: data.org?.name ?? '',
      org_url: data.org?.url ?? '',
      plan: data.planInfo?.plan ?? data.org?.plan ?? '',
      plan_type: data.planInfo?.planType ?? '',
      has_app_with_data: data.orgHasAppWithData ?? false,
      org_count: data.orgCount ?? 0,
      apps: (data.apps ?? []).map(mapApp),
      current_user_email: data.currentUser?.email ?? data.currentUser?.loginId ?? '',
      current_user_name: data.currentUser?.fullName ?? '',
      current_user_role: data.currentUser?.orgRole ?? 0,
    };
  },
});
