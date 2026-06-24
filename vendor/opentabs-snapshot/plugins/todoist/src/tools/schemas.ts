// Metadata-slice schemas for the vendored todoist plugin (SHA 4b170216).
//
// Tool modules reference `taskSchema` / `mapTask` / the Raw* types at module-eval
// time (in `output: z.object({ task: taskSchema })` and inside the never-executed
// handle bodies). The importer reads only `.input` schemas, but these symbols must
// RESOLVE for the module to import cleanly. taskSchema is a real (small) zod schema
// matching the upstream task shape; mapTask is an inert identity stub (never run).

import { z } from 'zod';

export const taskSchema = z.object({
  id: z.string(),
  content: z.string(),
  description: z.string().optional(),
  project_id: z.string().optional(),
  section_id: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  priority: z.number().optional(),
  is_completed: z.boolean().optional(),
  url: z.string().optional(),
});

export type Task = z.infer<typeof taskSchema>;

// Upstream RawTask is the API wire shape; the importer never touches it.
export interface RawTask {
  id: string;
  content: string;
  [k: string]: unknown;
}

export interface TodoistList<T> {
  results: T[];
  next_cursor?: string | null;
}

// Inert mapper -- referenced in never-executed handle bodies only.
export const mapTask = (raw: RawTask): Task => raw as unknown as Task;
