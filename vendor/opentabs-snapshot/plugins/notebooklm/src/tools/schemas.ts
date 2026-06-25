import { z } from 'zod';

// --- Notebook (Project) ---

export const notebookSchema = z.object({
  id: z.string().describe('Notebook UUID'),
  title: z.string().describe('Notebook title'),
  is_owner: z.boolean().describe('Whether the current user owns this notebook'),
  has_sources: z.boolean().describe('Whether the notebook has sources'),
  source_count: z.number().int().describe('Number of sources in the notebook'),
  created_at_seconds: z.number().describe('Creation timestamp (Unix seconds)'),
  updated_at_seconds: z.number().describe('Last update timestamp (Unix seconds)'),
});

export interface RawNotebook {
  0?: string;
  1?: unknown;
  2?: string;
  3?: string;
  4?: unknown;
  5?: unknown[];
}

export const mapNotebook = (n: unknown[]): z.infer<typeof notebookSchema> => {
  const meta = (n[5] as unknown[]) ?? [];
  const createdAt = (meta[8] as number[] | undefined) ?? [];
  const updatedAt = (meta[5] as number[] | undefined) ?? [];
  return {
    id: (n[2] as string) ?? '',
    title: (n[3] as string) ?? '',
    is_owner: (meta[0] as number) === 1,
    has_sources: (meta[2] as boolean) ?? false,
    source_count: (meta[6] as number) ?? 0,
    created_at_seconds: createdAt[0] ?? 0,
    updated_at_seconds: updatedAt[0] ?? 0,
  };
};

// --- Source ---

export const sourceSchema = z.object({
  id: z.string().describe('Source UUID'),
  title: z.string().describe('Source title'),
  type: z.string().describe('Source type (e.g., WEBSITE, PDF, TEXT)'),
  status: z.string().describe('Processing status'),
  url: z.string().describe('Source URL (if applicable)'),
  content_preview: z.string().describe('First few lines of content'),
});

export const mapSource = (s: unknown[]): z.infer<typeof sourceSchema> => ({
  id: (s[0] as string) ?? '',
  title: (s[1] as string) ?? '',
  type: (s[2] as string) ?? '',
  status: (s[3] as string) ?? '',
  url: (s[4] as string) ?? '',
  content_preview: (s[5] as string) ?? '',
});

// --- Note ---

export const noteSchema = z.object({
  id: z.string().describe('Note UUID'),
  content: z.string().describe('Note content (markdown)'),
  created_at_seconds: z.number().describe('Creation timestamp (Unix seconds)'),
});

export const mapNote = (n: unknown[]): z.infer<typeof noteSchema> => {
  const noteData = Array.isArray(n[1]) ? (n[1] as unknown[]) : n;
  const versionInfo = (noteData[2] as unknown[] | undefined) ?? [];
  const timestamp = (versionInfo[2] as number[] | undefined) ?? [];
  return {
    id: (noteData[0] as string) ?? '',
    content: (noteData[1] as string) ?? '',
    created_at_seconds: timestamp[0] ?? 0,
  };
};

// --- Chat Session ---

export const chatSessionSchema = z.object({
  id: z.string().describe('Chat session UUID'),
});

export const mapChatSession = (s: unknown[]): z.infer<typeof chatSessionSchema> => ({
  id: (s[0] as string) ?? '',
});

// --- Account ---

export const accountUserSchema = z.object({
  email: z.string().describe('User email address'),
  name: z.string().describe('User display name'),
  avatar_url: z.string().describe('User avatar URL'),
});
