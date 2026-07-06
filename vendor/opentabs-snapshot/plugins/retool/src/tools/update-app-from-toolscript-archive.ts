import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';
import {
  compileToolscriptArchive,
  ensureZipFileName,
  getCurrentSourceControlBranchName,
  importToolscriptArchiveThroughEditor,
} from '../toolscript.js';

const warningSchema = z.string().describe('Warning about Retool Toolscript import behavior');

const isCurrentTabEditorForPage = (pageUuid: string): boolean => {
  const encodedPageUuid = encodeURIComponent(pageUuid);
  return location.pathname.includes(`/editor/${encodedPageUuid}`) || location.pathname.includes(`/editor/${pageUuid}`);
};

export const updateAppFromToolscriptArchive = defineTool({
  name: 'update_app_from_toolscript_archive',
  displayName: 'Update App from Toolscript Archive',
  description:
    "Overwrite an existing Retool app with a base64-encoded Toolscript ZIP archive. The tool uses Retool's own browser-side Toolscript compiler to produce a Transit appState string, fetches the latest page save ID for optimistic locking, then calls Retool's save API. The target app type must match the archive type when Retool exposes type metadata.",
  summary: 'Update a Retool app from a Toolscript ZIP',
  icon: 'upload',
  group: 'Apps',
  input: z.object({
    page_uuid: z.string().describe('UUID of the existing Retool app to overwrite'),
    base64_zip: z.string().describe('Base64-encoded Toolscript ZIP archive'),
    file_name: z.string().optional().describe('Optional archive file name used for Retool parser diagnostics'),
    branch_name: z
      .string()
      .optional()
      .describe(
        'Optional source-control branch name for direct saves. Defaults to the branch in the targeted editor URL, if present.',
      ),
  }),
  output: z.object({
    save_id: z.number().describe('ID of the new save record'),
    success: z.boolean().describe('Whether the save succeeded'),
    warnings: z.array(warningSchema).describe('Warnings about Retool Toolscript import limitations'),
  }),
  handle: async (params, context) => {
    context?.reportProgress({ progress: 1, total: 3, message: 'Compiling Toolscript archive...' });

    const compiled = await compileToolscriptArchive(
      params.base64_zip,
      ensureZipFileName(params.file_name ?? `${params.page_uuid}.zip`),
    );

    context?.reportProgress({ progress: 2, total: 3, message: 'Fetching latest Retool save ID...' });

    const branchName = params.branch_name ?? getCurrentSourceControlBranchName() ?? undefined;
    const getResp = await api<{
      page: {
        id: number;
        multiplayerSessionId?: string | null;
        isMobileApp?: boolean | null;
        isGlobalWidget?: boolean | null;
      };
    }>(`/api/pages/uuids/${params.page_uuid}`, { query: { branchName } });

    if (typeof getResp.page.isMobileApp === 'boolean' && getResp.page.isMobileApp !== compiled.isMobileApp) {
      throw ToolError.validation('Toolscript archive app type does not match the target app mobile/web type.');
    }

    if (typeof getResp.page.isGlobalWidget === 'boolean' && getResp.page.isGlobalWidget !== compiled.isGlobalWidget) {
      throw ToolError.validation('Toolscript archive module/app type does not match the target app type.');
    }

    if (isCurrentTabEditorForPage(params.page_uuid)) {
      context?.reportProgress({ progress: 3, total: 3, message: 'Importing through Retool editor...' });

      const editorSave = await importToolscriptArchiveThroughEditor({
        base64Zip: params.base64_zip,
        fileName: ensureZipFileName(params.file_name ?? `${params.page_uuid}.zip`),
        pageUuid: params.page_uuid,
        isMobileApp: compiled.isMobileApp,
      });

      return {
        save_id: editorSave.saveId,
        success: true,
        warnings: compiled.warnings,
      };
    }

    context?.reportProgress({ progress: 3, total: 3, message: 'Saving Retool app...' });

    const saveResp = await api<{ save?: { id?: number } }>(`/api/pages/uuids/${params.page_uuid}/save`, {
      method: 'POST',
      body: {
        appState: compiled.appState,
        branchName: branchName ?? null,
        changesRecordV2: { changes: [], numUntrackedActionsTriggered: 1, isCopilotMode: false },
        saveValidationInfo: {
          multiplayerSessionId: getResp.page.multiplayerSessionId ?? null,
          pageSaveId: getResp.page.id,
        },
        isCopilotGenerated: false,
        subflowsDiff: null,
        saveAppTesting: false,
      },
    });

    return {
      save_id: saveResp.save?.id ?? 0,
      success: true,
      warnings: compiled.warnings,
    };
  },
});
