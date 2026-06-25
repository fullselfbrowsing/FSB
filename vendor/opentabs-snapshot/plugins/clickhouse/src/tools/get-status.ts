import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapStatusSummary, statusSummarySchema } from './schemas.js';

interface RawStatusPage {
  ongoing_incidents?: unknown[];
  in_progress_maintenances?: unknown[];
  status?: { indicator?: string };
}

export const getStatus = defineTool({
  name: 'get_status',
  displayName: 'Get Platform Status',
  description:
    'Get the current ClickHouse Cloud platform status from the status page, including active incidents and maintenances.',
  summary: 'Get platform status',
  icon: 'shield-check',
  group: 'Monitoring',
  input: z.object({}),
  output: z.object({
    status: statusSummarySchema,
  }),
  handle: async () => {
    let response: Response;
    try {
      response = await fetch('https://statuspage.incident.io/clickhousecloud/api/v1/summary', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw ToolError.timeout('Status page request timed out.');
      }
      throw ToolError.internal(`Failed to fetch status page: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!response.ok) {
      throw ToolError.internal(`Status page returned ${response.status}.`);
    }

    const data = (await response.json()) as RawStatusPage;
    return { status: mapStatusSummary(data) };
  },
});
