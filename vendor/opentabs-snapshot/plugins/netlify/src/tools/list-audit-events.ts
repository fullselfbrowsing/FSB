import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { auditEventSchema, type RawAuditEvent, mapAuditEvent } from './schemas.js';

export const listAuditEvents = defineTool({
  name: 'list_audit_events',
  displayName: 'List Audit Events',
  description:
    'List audit log events for a Netlify account. Returns actions performed by team members such as site creation, deploy locks, and settings changes. Supports text search and pagination.',
  summary: 'List account audit log events',
  icon: 'shield',
  group: 'Account',
  input: z.object({
    account_id: z.string().describe('The account ID to query audit events for'),
    query: z.string().optional().describe('Text search query to filter events'),
    page: z.number().optional().describe('Page number for pagination (starts at 1)'),
    per_page: z.number().optional().describe('Number of events per page (default 20)'),
  }),
  output: z.object({
    items: z.array(auditEventSchema).describe('List of audit events'),
  }),
  handle: async params => {
    const raw = await api<RawAuditEvent[]>(`/accounts/${params.account_id}/audit`, {
      query: {
        query: params.query,
        page: params.page,
        per_page: params.per_page,
      },
    });
    return { items: raw.map(mapAuditEvent) };
  },
});
