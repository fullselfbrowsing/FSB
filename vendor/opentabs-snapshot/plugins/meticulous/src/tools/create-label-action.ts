import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, mutations } from '../meticulous-api.js';
import { labelActionSchema, mapLabelAction } from './schemas.js';

export const createLabelAction = defineTool({
  name: 'create_label_action',
  displayName: 'Create Label Action',
  description:
    'Label a specific screenshot diff as approved or rejected. Use this to approve or reject individual visual differences within a test run.',
  summary: 'Label a screenshot diff',
  icon: 'tag',
  group: 'Test Runs',
  input: z.object({
    test_run_id: z.string().describe('Test run ID'),
    replay_diff_id: z.string().optional().describe('Replay diff ID'),
    screenshot_file_name: z.string().optional().describe('Screenshot filename'),
    label: z.string().describe('Label to apply (e.g., approved, rejected)'),
  }),
  output: z.object({ label_action: labelActionSchema }),
  handle: async ({ test_run_id, replay_diff_id, screenshot_file_name, label }) => {
    const data = await graphql<{ createLabelAction: Record<string, unknown> }>(mutations.CREATE_LABEL_ACTION, {
      testRunId: test_run_id,
      replayDiffId: replay_diff_id,
      screenshotFileName: screenshot_file_name,
      label,
    });
    return { label_action: mapLabelAction(data.createLabelAction) };
  },
});
