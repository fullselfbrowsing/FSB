import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { logEntrySchema, mapLogEntry } from './schemas.js';
import type { RawLogEntry } from './schemas.js';

export const listLogEntries = defineTool({
  name: 'list_log_entries',
  displayName: 'List Log Entries',
  description:
    "List log entries from Cloud Logging. Supports advanced log filters (e.g., 'severity>=ERROR', 'resource.type=\"gce_instance\"').",
  summary: 'List Cloud Logging entries',
  icon: 'scroll-text',
  group: 'Logging',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    filter: z.string().optional().describe("Cloud Logging filter expression (e.g., 'severity>=ERROR')"),
    page_size: z.number().int().min(1).max(1000).optional().describe('Max results per page (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
    order_by: z.string().optional().describe('Sort order: "timestamp desc" (default) or "timestamp asc"'),
  }),
  output: z.object({
    entries: z.array(logEntrySchema).describe('List of log entries'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ entries?: RawLogEntry[]; nextPageToken?: string }>(
      'https://logging.googleapis.com/v2/entries:list',
      {
        method: 'POST',
        body: {
          resourceNames: [`projects/${projectId}`],
          filter: params.filter,
          pageSize: params.page_size ?? 50,
          pageToken: params.page_token,
          orderBy: params.order_by ?? 'timestamp desc',
        },
      },
    );
    return {
      entries: (data.entries ?? []).map(mapLogEntry),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
