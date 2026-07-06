import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, mutations } from '../meticulous-api.js';

export const upsertDiffApproval = defineTool({
  name: 'upsert_diff_approval',
  displayName: 'Upsert Diff Approval',
  description:
    'Approve or reject one or more screenshot diffs in bulk. Updates the approval state of diffs for a test run.',
  summary: 'Bulk approve/reject diffs',
  icon: 'check-square',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    approvals: z
      .array(
        z.object({
          replay_diff_id: z.string().describe('Replay diff ID'),
          screenshot_file_name: z.string().describe('Screenshot filename'),
          approved: z.boolean().describe('Whether to approve (true) or reject (false)'),
        }),
      )
      .describe('List of diff approval states to set'),
  }),
  output: z.object({ success: z.boolean() }),
  handle: async ({ test_run_id, approvals }) => {
    const data = await graphql<{ upsertDiffApprovalStates: { success: boolean } }>(
      mutations.UPSERT_DIFF_APPROVAL_STATES,
      {
        input: {
          testRunId: test_run_id,
          diffApprovalStates: approvals.map(a => ({
            replayDiffId: a.replay_diff_id,
            screenshotFileName: a.screenshot_file_name,
            approved: a.approved,
          })),
        },
      },
    );
    return { success: data.upsertDiffApprovalStates.success };
  },
});
