import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listEmailAddresses = defineTool({
  name: 'list_email_addresses',
  displayName: 'List Email Addresses',
  description:
    'List email routing destination addresses for the account. These are the verified email addresses that incoming emails can be forwarded to.',
  summary: 'List email routing destinations',
  icon: 'at-sign',
  group: 'Email',
  input: z.object({}),
  output: z.object({
    addresses: z
      .array(
        z.object({
          id: z.string().describe('Address ID'),
          email: z.string().describe('Email address'),
          verified: z.string().nullable().describe('Verification timestamp, or null if not verified'),
          created: z.string().describe('ISO 8601 creation timestamp'),
          modified: z.string().describe('ISO 8601 last modification timestamp'),
        }),
      )
      .describe('List of destination email addresses'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/email/routing/addresses`,
    );
    const addresses = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      addresses: addresses.map(a => ({
        id: (a.id as string) ?? '',
        email: (a.email as string) ?? '',
        verified: (a.verified as string) ?? null,
        created: (a.created as string) ?? '',
        modified: (a.modified as string) ?? '',
      })),
    };
  },
});
