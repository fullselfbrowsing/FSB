import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { forceEditorSave } from '../toolscript.js';

export const forceEditorSaveTool = defineTool({
  name: 'force_editor_save',
  displayName: 'Force Editor Save',
  description:
    "Trigger Retool's own editor save pipeline for the currently targeted editor tab. Use this after a Toolscript import or backend app-state update has been loaded in the editor and you need Retool to reconcile editor-only/server-side state without making a manual dummy edit. Requires targeting an open editor tab for the requested page UUID with tabId.",
  summary: 'Force-save the open Retool editor state',
  icon: 'save',
  group: 'Apps',
  input: z.object({
    page_uuid: z.string().describe('UUID of the app currently open in the targeted Retool editor tab'),
    trigger: z
      .enum(['manual', 'imported', 'forced'])
      .optional()
      .describe('Retool save trigger label to use for the editor save. Defaults to manual.'),
  }),
  output: z.object({
    save_id: z.number().describe("ID of the save record created by Retool's editor save pipeline"),
    previous_save_id: z
      .number()
      .optional()
      .describe('Previous save ID known to the editor before saving, when Retool exposes it'),
    current_page_uuid: z.string().describe('UUID of the app that was open in the targeted editor tab'),
    success: z.boolean().describe('Whether the editor save succeeded'),
  }),
  handle: async params => {
    const result = await forceEditorSave(params.page_uuid, params.trigger ?? 'manual');

    return {
      save_id: result.saveId,
      previous_save_id: result.previousSaveId,
      current_page_uuid: result.currentPageUuid,
      success: true,
    };
  },
});
