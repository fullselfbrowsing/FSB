import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../retool-api.js';
import {
  blobToBase64,
  downloadBlob,
  ensureZipFileName,
  getCurrentSourceControlBranchName,
  serializeToolscriptArchive,
} from '../toolscript.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const getExportPageName = (page: unknown): string | null => {
  if (!isRecord(page)) return null;
  const name = page.name;
  return typeof name === 'string' && name.trim() ? name : null;
};

export const exportToolscriptArchive = defineTool({
  name: 'export_toolscript_archive',
  displayName: 'Export Toolscript Archive',
  description:
    "Export a Retool app as a Toolscript ZIP archive using Retool's own browser-side archive serializer. Returns the ZIP as base64 so callers can save, unzip, edit, and later pass it to create_app_from_toolscript_archive or update_app_from_toolscript_archive. Optionally also starts a normal browser download.",
  summary: 'Export a Retool app as a Toolscript ZIP',
  icon: 'download',
  group: 'Apps',
  input: z.object({
    page_uuid: z.string().describe('App UUID to export'),
    file_name: z.string().optional().describe('Optional ZIP file name. Defaults to the Retool app name.'),
    branch_name: z
      .string()
      .optional()
      .describe(
        'Optional source-control branch name to export. Defaults to the branch in the targeted editor URL, if present.',
      ),
    per_page_position_json_files: z
      .boolean()
      .optional()
      .describe('Whether to emit per-page position JSON files in the archive (default true).'),
    download_to_browser: z
      .boolean()
      .optional()
      .describe('Whether to also start a browser download of the ZIP archive (default false).'),
  }),
  output: z.object({
    file_name: z.string().describe('ZIP file name for the exported archive'),
    mime_type: z.string().describe('MIME type of the returned archive'),
    size_bytes: z.number().int().describe('Size of the ZIP archive in bytes'),
    base64_zip: z.string().describe('Base64-encoded ZIP archive'),
    download_started: z.boolean().describe('Whether a browser download was started'),
  }),
  handle: async (params, context) => {
    context?.reportProgress({ progress: 1, total: 3, message: 'Fetching Retool export data...' });

    const branchName = params.branch_name ?? getCurrentSourceControlBranchName() ?? undefined;
    const data = await api<{
      uuid?: string;
      page?: unknown;
      modules?: Record<string, unknown>;
    }>(`/api/pages/uuids/${params.page_uuid}/export`, {
      method: 'POST',
      query: { branch: branchName },
    });

    if (!data.page) throw ToolError.internal('Retool export response did not include page data.');

    context?.reportProgress({ progress: 2, total: 3, message: 'Serializing Toolscript ZIP...' });

    const fileName = ensureZipFileName(params.file_name ?? getExportPageName(data.page) ?? params.page_uuid);
    const archive = await serializeToolscriptArchive({
      pageUuid: params.page_uuid,
      exportData: {
        uuid: data.uuid ?? params.page_uuid,
        page: data.page,
        modules: data.modules ?? {},
      },
      perPagePositionJsonFiles: params.per_page_position_json_files ?? true,
    });

    if (params.download_to_browser) downloadBlob(archive, fileName);

    context?.reportProgress({ progress: 3, total: 3, message: 'Encoding ZIP...' });

    return {
      file_name: fileName,
      mime_type: 'application/zip',
      size_bytes: archive.size,
      base64_zip: await blobToBase64(archive),
      download_started: params.download_to_browser ?? false,
    };
  },
});
