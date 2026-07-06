import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../asana-api.js';

export const addTaskToSection = defineTool({
  name: 'add_task_to_section',
  displayName: 'Add Task to Section',
  description:
    'Add a task to a specific section. The task will appear at the top of the section. A task can only be in one section of a given project at a time.',
  summary: 'Move a task into a section',
  icon: 'arrow-right',
  group: 'Sections',
  input: z.object({
    section_gid: z.string().min(1).describe('Section GID to add the task to'),
    task_gid: z.string().min(1).describe('Task GID to add to the section'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the task was successfully added to the section'),
  }),
  handle: async params => {
    await api<Record<string, unknown>>(`/sections/${params.section_gid}/addTask`, {
      method: 'POST',
      body: { data: { task: params.task_gid } },
    });
    return { success: true };
  },
});
