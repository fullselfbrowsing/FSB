import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';

const QUERY = `query ReportQuota {
  canAddReport
  canSaveChart
  dashboardCount
  savedChartCount
  spaceCount
  maximumReports
}`;

export const getReportQuota = defineTool({
  name: 'get_report_quota',
  displayName: 'Get Report Quota',
  description:
    'Get the current report quota usage and limits for the organization. Shows how many charts, dashboards, and spaces exist relative to plan limits.',
  summary: 'Get report quota usage and limits',
  icon: 'gauge',
  group: 'Billing',
  input: z.object({}),
  output: z.object({
    can_add_report: z.boolean().describe('Whether new reports can be created'),
    can_save_chart: z.boolean().describe('Whether charts can be saved'),
    dashboard_count: z.number().int().describe('Current dashboard count'),
    saved_chart_count: z.number().int().describe('Current saved chart count'),
    space_count: z.number().int().describe('Current space count'),
    maximum_reports: z.number().int().describe('Maximum allowed reports on the plan'),
  }),
  handle: async () => {
    const data = await gql<{
      canAddReport?: boolean;
      canSaveChart?: boolean;
      dashboardCount?: number;
      savedChartCount?: number;
      spaceCount?: number;
      maximumReports?: number;
    }>('ReportQuota', QUERY);
    return {
      can_add_report: data.canAddReport ?? false,
      can_save_chart: data.canSaveChart ?? false,
      dashboard_count: data.dashboardCount ?? 0,
      saved_chart_count: data.savedChartCount ?? 0,
      space_count: data.spaceCount ?? 0,
      maximum_reports: data.maximumReports ?? 0,
    };
  },
});
