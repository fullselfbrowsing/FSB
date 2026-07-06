import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { dataApi } from '../ga-api.js';
import {
  reportRowSchema,
  reportHeaderSchema,
  mapReportRow,
  mapReportHeader,
  type RawReportRow,
  type RawReportHeader,
} from './schemas.js';

interface SingleReportResponse {
  dimensionHeaders?: RawReportHeader[];
  metricHeaders?: RawReportHeader[];
  rows?: RawReportRow[];
  rowCount?: number;
  metadata?: { currencyCode?: string; timeZone?: string };
}

interface BatchRunReportsResponse {
  reports?: SingleReportResponse[];
}

const reportResultSchema = z.object({
  dimension_headers: z.array(reportHeaderSchema).describe('Names of dimensions in result rows'),
  metric_headers: z.array(reportHeaderSchema).describe('Names of metrics in result rows'),
  rows: z.array(reportRowSchema).describe('Report data rows'),
  row_count: z.number().describe('Total rows matching the query'),
});

const reportRequestSchema = z.object({
  dimensions: z.array(z.string()).optional().describe('Dimension API names (e.g., ["country", "pagePath"])'),
  metrics: z.array(z.string()).describe('Metric API names (e.g., ["activeUsers", "sessions"])'),
  start_date: z.string().describe('Start date (YYYY-MM-DD, "today", "yesterday", or "NdaysAgo")'),
  end_date: z.string().describe('End date (YYYY-MM-DD, "today", "yesterday", or "NdaysAgo")'),
  limit: z.number().int().min(1).max(10000).optional().describe('Max rows per report (default 100)'),
});

export const runBatchReport = defineTool({
  name: 'run_batch_report',
  displayName: 'Run Batch Report',
  description:
    'Run multiple GA4 reports in a single request. More efficient than calling run_report multiple times — use this when you need several different views of the same property (e.g., traffic by country AND by device in one call). Supports up to 5 reports per batch. Each report can have different dimensions, metrics, and date ranges.',
  summary: 'Run multiple reports in one request',
  icon: 'layers',
  group: 'Reporting',
  input: z.object({
    property_id: z.string().describe('GA4 property ID (numeric string)'),
    reports: z.array(reportRequestSchema).min(1).max(5).describe('Array of report requests (1-5 reports)'),
  }),
  output: z.object({
    reports: z.array(reportResultSchema).describe('Results for each report in the same order as requested'),
  }),
  handle: async params => {
    const requests = params.reports.map(r => {
      const req: Record<string, unknown> = {
        dateRanges: [{ startDate: r.start_date, endDate: r.end_date }],
        metrics: r.metrics.map(name => ({ name })),
        limit: String(r.limit ?? 100),
      };
      if (r.dimensions?.length) {
        req.dimensions = r.dimensions.map(name => ({ name }));
      }
      return req;
    });

    const data = await dataApi<BatchRunReportsResponse>(`/properties/${params.property_id}:batchRunReports`, {
      requests,
    });

    return {
      reports: (data.reports ?? []).map(report => ({
        dimension_headers: (report.dimensionHeaders ?? []).map(mapReportHeader),
        metric_headers: (report.metricHeaders ?? []).map(mapReportHeader),
        rows: (report.rows ?? []).map(mapReportRow),
        row_count: report.rowCount ?? 0,
      })),
    };
  },
});
