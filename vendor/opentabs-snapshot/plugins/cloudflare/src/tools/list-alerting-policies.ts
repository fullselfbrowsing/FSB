import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listAlertingPolicies = defineTool({
  name: 'list_alerting_policies',
  displayName: 'List Alerting Policies',
  description:
    'List notification/alerting policies for the account. Policies define triggers (DDoS attacks, certificate expiry, origin health, etc.) and notification destinations (email, webhook, PagerDuty).',
  summary: 'List alerting policies',
  icon: 'bell',
  group: 'Notifications',
  input: z.object({}),
  output: z.object({
    policies: z
      .array(
        z.object({
          id: z.string().describe('Policy ID'),
          name: z.string().describe('Policy name'),
          description: z.string().describe('Policy description'),
          enabled: z.boolean().describe('Whether the policy is enabled'),
          alert_type: z.string().describe('Alert type (e.g., "dos_attack_l7", "expiring_service_token_alert")'),
          created: z.string().describe('ISO 8601 creation timestamp'),
          modified: z.string().describe('ISO 8601 last modification timestamp'),
        }),
      )
      .describe('List of alerting policies'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/alerting/v3/policies`,
    );
    const policies = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      policies: policies.map(p => ({
        id: (p.id as string) ?? '',
        name: (p.name as string) ?? '',
        description: (p.description as string) ?? '',
        enabled: (p.enabled as boolean) ?? false,
        alert_type: (p.alert_type as string) ?? '',
        created: (p.created as string) ?? '',
        modified: (p.modified as string) ?? '',
      })),
    };
  },
});
