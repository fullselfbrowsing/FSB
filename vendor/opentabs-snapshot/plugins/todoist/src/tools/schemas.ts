import { z } from 'zod';

// --- Todoist API response envelope ---

export interface TodoistList<T> {
  results: T[];
  next_cursor: string | null;
}

// --- Due date ---

export const dueSchema = z
  .object({
    string: z.string().describe('Human-readable due date string'),
    date: z.string().describe('Due date in YYYY-MM-DD format'),
    is_recurring: z.boolean().describe('Whether the due date is recurring'),
    datetime: z.string().nullable().describe('Due datetime in RFC3339 format'),
    timezone: z.string().nullable().describe('Timezone for the due date'),
  })
  .describe('Due date information');

interface RawDue {
  string?: string;
  date?: string;
  is_recurring?: boolean;
  datetime?: string | null;
  timezone?: string | null;
}

export const mapDue = (d: RawDue) => ({
  string: d.string ?? '',
  date: d.date ?? '',
  is_recurring: d.is_recurring ?? false,
  datetime: d.datetime ?? null,
  timezone: d.timezone ?? null,
});

// --- Duration ---

export const durationSchema = z
  .object({
    amount: z.number().describe('Duration amount'),
    unit: z.string().describe('Duration unit: "minute" or "day"'),
  })
  .describe('Task duration');

interface RawDuration {
  amount?: number;
  unit?: string;
}

export const mapDuration = (d: RawDuration) => ({
  amount: d.amount ?? 0,
  unit: d.unit ?? 'minute',
});

// --- Deadline ---

export const deadlineSchema = z
  .object({
    date: z.string().describe('Deadline date in YYYY-MM-DD format'),
  })
  .describe('Task deadline');

// --- Project ---

export const projectSchema = z.object({
  id: z.string().describe('Project ID'),
  name: z.string().describe('Project name'),
  color: z.string().describe('Project color name'),
  description: z.string().describe('Project description'),
  parent_id: z.string().nullable().describe('Parent project ID for nested projects'),
  child_order: z.number().describe('Position among sibling projects'),
  is_favorite: z.boolean().describe('Whether the project is a favorite'),
  is_archived: z.boolean().describe('Whether the project is archived'),
  is_shared: z.boolean().describe('Whether the project is shared'),
  view_style: z.string().describe('View style: "list" or "board"'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
  inbox_project: z.boolean().describe('Whether this is the inbox project'),
});

export interface RawProject {
  id?: string;
  name?: string;
  color?: string;
  description?: string;
  parent_id?: string | null;
  child_order?: number;
  is_favorite?: boolean;
  is_archived?: boolean;
  is_shared?: boolean;
  view_style?: string;
  created_at?: string;
  updated_at?: string;
  inbox_project?: boolean;
}

export const mapProject = (p: RawProject) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  color: p.color ?? '',
  description: p.description ?? '',
  parent_id: p.parent_id ?? null,
  child_order: p.child_order ?? 0,
  is_favorite: p.is_favorite ?? false,
  is_archived: p.is_archived ?? false,
  is_shared: p.is_shared ?? false,
  view_style: p.view_style ?? 'list',
  created_at: p.created_at ?? '',
  updated_at: p.updated_at ?? '',
  inbox_project: p.inbox_project ?? false,
});

// --- Task ---

export const taskSchema = z.object({
  id: z.string().describe('Task ID'),
  content: z.string().describe('Task content/title'),
  description: z.string().describe('Task description'),
  project_id: z.string().describe('Project ID the task belongs to'),
  section_id: z.string().nullable().describe('Section ID within the project'),
  parent_id: z.string().nullable().describe('Parent task ID for subtasks'),
  labels: z.array(z.string()).describe('List of label names'),
  priority: z.number().int().describe('Priority from 1 (normal) to 4 (urgent)'),
  due: dueSchema.nullable().describe('Due date information'),
  deadline: deadlineSchema.nullable().describe('Deadline date'),
  duration: durationSchema.nullable().describe('Task duration'),
  is_completed: z.boolean().describe('Whether the task is completed'),
  order: z.number().int().describe('Position among sibling tasks'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  creator_id: z.string().describe('User ID of the task creator'),
  assignee_id: z.string().nullable().describe('User ID of the assignee'),
  comment_count: z.number().int().describe('Number of comments on the task'),
  url: z.string().describe('URL to view the task in Todoist'),
});

export interface RawTask {
  id?: string;
  content?: string;
  description?: string;
  project_id?: string;
  section_id?: string | null;
  parent_id?: string | null;
  labels?: string[];
  priority?: number;
  due?: RawDue | null;
  deadline?: { date?: string } | null;
  duration?: RawDuration | null;
  checked?: boolean;
  child_order?: number;
  added_at?: string;
  user_id?: string;
  responsible_uid?: string | null;
  note_count?: number;
}

export const mapTask = (t: RawTask) => ({
  id: t.id ?? '',
  content: t.content ?? '',
  description: t.description ?? '',
  project_id: t.project_id ?? '',
  section_id: t.section_id ?? null,
  parent_id: t.parent_id ?? null,
  labels: t.labels ?? [],
  priority: t.priority ?? 1,
  due: t.due ? mapDue(t.due) : null,
  deadline: t.deadline?.date ? { date: t.deadline.date } : null,
  duration: t.duration ? mapDuration(t.duration) : null,
  is_completed: t.checked ?? false,
  order: t.child_order ?? 0,
  created_at: t.added_at ?? '',
  creator_id: t.user_id ?? '',
  assignee_id: t.responsible_uid ?? null,
  comment_count: t.note_count ?? 0,
  url: t.id ? `https://app.todoist.com/app/task/${t.id}` : '',
});

// --- Section ---

export const sectionSchema = z.object({
  id: z.string().describe('Section ID'),
  name: z.string().describe('Section name'),
  project_id: z.string().describe('Project ID the section belongs to'),
  order: z.number().int().describe('Position among sections in the project'),
  is_archived: z.boolean().describe('Whether the section is archived'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export interface RawSection {
  id?: string;
  name?: string;
  project_id?: string;
  section_order?: number;
  is_archived?: boolean;
  added_at?: string;
  updated_at?: string;
}

export const mapSection = (s: RawSection) => ({
  id: s.id ?? '',
  name: s.name ?? '',
  project_id: s.project_id ?? '',
  order: s.section_order ?? 0,
  is_archived: s.is_archived ?? false,
  created_at: s.added_at ?? '',
  updated_at: s.updated_at ?? '',
});

// --- Comment ---

export const commentSchema = z.object({
  id: z.string().describe('Comment ID'),
  content: z.string().describe('Comment content in markdown'),
  task_id: z.string().describe('Task ID the comment belongs to'),
  posted_at: z.string().describe('ISO 8601 timestamp when the comment was posted'),
  poster_id: z.string().describe('User ID of the comment author'),
});

export interface RawComment {
  id?: string;
  content?: string;
  item_id?: string;
  posted_at?: string;
  posted_uid?: string;
}

export const mapComment = (c: RawComment) => ({
  id: c.id ?? '',
  content: c.content ?? '',
  task_id: c.item_id ?? '',
  posted_at: c.posted_at ?? '',
  poster_id: c.posted_uid ?? '',
});

// --- Label ---

export const labelSchema = z.object({
  id: z.string().describe('Label ID'),
  name: z.string().describe('Label name'),
  color: z.string().describe('Label color name'),
  order: z.number().int().describe('Position among labels'),
  is_favorite: z.boolean().describe('Whether the label is a favorite'),
});

export interface RawLabel {
  id?: string;
  name?: string;
  color?: string;
  order?: number;
  is_favorite?: boolean;
}

export const mapLabel = (l: RawLabel) => ({
  id: l.id ?? '',
  name: l.name ?? '',
  color: l.color ?? '',
  order: l.order ?? 0,
  is_favorite: l.is_favorite ?? false,
});

// --- Collaborator ---

export const collaboratorSchema = z.object({
  id: z.string().describe('User ID'),
  name: z.string().describe('User display name'),
  email: z.string().describe('User email address'),
});

export interface RawCollaborator {
  id?: string;
  name?: string;
  email?: string;
}

export const mapCollaborator = (c: RawCollaborator) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  email: c.email ?? '',
});
