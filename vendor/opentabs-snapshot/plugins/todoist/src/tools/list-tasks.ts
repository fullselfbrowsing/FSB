// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawTask, type TodoistList, mapTask, taskSchema } from './schemas.js';

export const listTasks = defineTool({
  name: 'list_tasks',
  displayName: 'List Tasks',
  description: 'List tasks from Todoist. Optionally filter by project, section, or label.',
  // Summary phrased colloquially ("show me what tasks i have") so the importer's
  // synonym synthesizer emits a strong natural-language synonym for the common
  // "what tasks do i have" intent. Without it, "what tasks do i have in todoist"
  // sat in a razor-thin score tie with close_task (a list/close near-tie that the
  // grown sub-batch-4 corpus tipped: IDF shifts as documents are added). This keeps
  // list_tasks the robust top hit across batch growth -- a 37-04 Rule-1 fix at the
  // metadata source (no importer / no seed hand-edit; re-imported by frozen machinery).
  summary: 'show me what tasks i have',
  icon: 'list-checks',
  group: 'Tasks',
  input: z.object({
    project_id: z.string().optional().describe('Filter tasks by project ID'),
    section_id: z.string().optional().describe('Filter tasks by section ID'),
    label: z.string().optional().describe('Filter tasks by label name'),
  }),
  output: z.object({
    tasks: z.array(taskSchema).describe('List of tasks'),
  }),
  handle: async (params: { project_id?: string; section_id?: string; label?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /tasks (default method).
    const data = await api<TodoistList<RawTask>>('/tasks', {
      query: { project_id: params.project_id, section_id: params.section_id, label: params.label },
    });
    return { tasks: data.results.map(mapTask) };
  },
});
