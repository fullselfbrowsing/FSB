import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';

interface RawFileResponse {
  file_name?: string;
  file_path?: string;
  content?: string;
  encoding?: string;
}

export const getFileContent = defineTool({
  name: 'get_file_content',
  displayName: 'Get File Content',
  description:
    'Read a file from a repository. Returns the decoded content as text. Use the ref parameter to read from a specific branch or commit.',
  summary: 'Read a file from a repository',
  icon: 'file-text',
  group: 'Content',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    file_path: z.string().min(1).describe('File path relative to repository root (e.g., "src/index.ts")'),
    ref: z.string().optional().describe('Branch name, tag, or commit SHA (defaults to the default branch)'),
  }),
  output: z.object({
    content: z.string().describe('Decoded file content as text'),
    file_path: z.string().describe('File path'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      ref: params.ref ?? 'HEAD',
    };

    const encodedPath = encodeURIComponent(params.file_path);
    const data = await api<RawFileResponse>(
      `/projects/${encodeURIComponent(params.project)}/repository/files/${encodedPath}`,
      { query },
    );

    let content = data.content ?? '';
    if (data.encoding === 'base64' && content) {
      content = atob(content);
    }

    return { content, file_path: data.file_path ?? params.file_path };
  },
});
