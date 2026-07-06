import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared API response types
// ---------------------------------------------------------------------------

export interface AsanaResponse<T> {
  data: T;
}

export interface AsanaList<T> {
  data: T[];
  next_page: { offset: string } | null;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const taskSchema = z.object({
  gid: z.string().describe('Task GID'),
  name: z.string().describe('Task name'),
  completed: z.boolean().describe('Whether the task is completed'),
  assignee_gid: z.string().describe('Assignee user GID, or empty if unassigned'),
  assignee_name: z.string().describe('Assignee display name, or empty if unassigned'),
  due_on: z.string().describe('Due date (YYYY-MM-DD), or empty if none'),
  due_at: z.string().describe('Due datetime (ISO 8601), or empty if none'),
  start_on: z.string().describe('Start date (YYYY-MM-DD), or empty if none'),
  notes: z.string().describe('Plain-text task description'),
  html_notes: z.string().describe('HTML task description (truncated to 2000 chars)'),
  projects: z
    .array(z.object({ gid: z.string().describe('Project GID'), name: z.string().describe('Project name') }))
    .describe('Projects this task belongs to'),
  tags: z
    .array(z.object({ gid: z.string().describe('Tag GID'), name: z.string().describe('Tag name') }))
    .describe('Tags applied to this task'),
  parent_gid: z.string().describe('Parent task GID, or empty if top-level'),
  num_subtasks: z.number().describe('Number of subtasks'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  modified_at: z.string().describe('ISO 8601 last modified timestamp'),
  permalink_url: z.string().describe('Permanent URL to the task in Asana'),
  resource_subtype: z.string().describe('Task subtype (default_task, milestone, section, approval)'),
});

export interface RawTask {
  gid?: string;
  name?: string | null;
  completed?: boolean | null;
  assignee?: { gid?: string; name?: string } | null;
  due_on?: string | null;
  due_at?: string | null;
  start_on?: string | null;
  notes?: string | null;
  html_notes?: string | null;
  projects?: Array<{ gid?: string; name?: string }> | null;
  tags?: Array<{ gid?: string; name?: string }> | null;
  parent?: { gid?: string } | null;
  num_subtasks?: number | null;
  created_at?: string | null;
  modified_at?: string | null;
  permalink_url?: string | null;
  resource_subtype?: string | null;
}

const MAX_HTML_NOTES = 2000;

export const mapTask = (t: RawTask | undefined): z.infer<typeof taskSchema> => ({
  gid: t?.gid ?? '',
  name: t?.name ?? '',
  completed: t?.completed ?? false,
  assignee_gid: t?.assignee?.gid ?? '',
  assignee_name: t?.assignee?.name ?? '',
  due_on: t?.due_on ?? '',
  due_at: t?.due_at ?? '',
  start_on: t?.start_on ?? '',
  notes: t?.notes ?? '',
  html_notes: (t?.html_notes ?? '').slice(0, MAX_HTML_NOTES),
  projects: (t?.projects ?? []).map(p => ({ gid: p?.gid ?? '', name: p?.name ?? '' })),
  tags: (t?.tags ?? []).map(tag => ({ gid: tag?.gid ?? '', name: tag?.name ?? '' })),
  parent_gid: t?.parent?.gid ?? '',
  num_subtasks: t?.num_subtasks ?? 0,
  created_at: t?.created_at ?? '',
  modified_at: t?.modified_at ?? '',
  permalink_url: t?.permalink_url ?? '',
  resource_subtype: t?.resource_subtype ?? 'default_task',
});

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const projectSchema = z.object({
  gid: z.string().describe('Project GID'),
  name: z.string().describe('Project name'),
  archived: z.boolean().describe('Whether the project is archived'),
  color: z.string().describe('Project color name, or empty if none'),
  notes: z.string().describe('Plain-text project description'),
  owner_gid: z.string().describe('Owner user GID, or empty if none'),
  owner_name: z.string().describe('Owner display name, or empty if none'),
  team_gid: z.string().describe('Team GID, or empty if none'),
  team_name: z.string().describe('Team name, or empty if none'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  modified_at: z.string().describe('ISO 8601 last modified timestamp'),
  due_on: z.string().describe('Project due date (YYYY-MM-DD), or empty if none'),
  start_on: z.string().describe('Project start date (YYYY-MM-DD), or empty if none'),
  permalink_url: z.string().describe('Permanent URL to the project in Asana'),
  public: z.boolean().describe('Whether the project is public to the workspace'),
});

export interface RawProject {
  gid?: string;
  name?: string | null;
  archived?: boolean | null;
  color?: string | null;
  notes?: string | null;
  owner?: { gid?: string; name?: string } | null;
  team?: { gid?: string; name?: string } | null;
  created_at?: string | null;
  modified_at?: string | null;
  due_on?: string | null;
  start_on?: string | null;
  permalink_url?: string | null;
  public?: boolean | null;
}

export const mapProject = (p: RawProject | undefined): z.infer<typeof projectSchema> => ({
  gid: p?.gid ?? '',
  name: p?.name ?? '',
  archived: p?.archived ?? false,
  color: p?.color ?? '',
  notes: p?.notes ?? '',
  owner_gid: p?.owner?.gid ?? '',
  owner_name: p?.owner?.name ?? '',
  team_gid: p?.team?.gid ?? '',
  team_name: p?.team?.name ?? '',
  created_at: p?.created_at ?? '',
  modified_at: p?.modified_at ?? '',
  due_on: p?.due_on ?? '',
  start_on: p?.start_on ?? '',
  permalink_url: p?.permalink_url ?? '',
  public: p?.public ?? false,
});

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export const sectionSchema = z.object({
  gid: z.string().describe('Section GID'),
  name: z.string().describe('Section name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  project_gid: z.string().describe('Parent project GID'),
});

export interface RawSection {
  gid?: string;
  name?: string | null;
  created_at?: string | null;
  project?: { gid?: string } | null;
}

export const mapSection = (s: RawSection | undefined): z.infer<typeof sectionSchema> => ({
  gid: s?.gid ?? '',
  name: s?.name ?? '',
  created_at: s?.created_at ?? '',
  project_gid: s?.project?.gid ?? '',
});

// ---------------------------------------------------------------------------
// Story (comment / activity)
// ---------------------------------------------------------------------------

export const storySchema = z.object({
  gid: z.string().describe('Story GID'),
  text: z.string().describe('Story text content'),
  created_by_gid: z.string().describe('Creator user GID'),
  created_by_name: z.string().describe('Creator display name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  resource_subtype: z.string().describe('Story subtype (e.g. comment_added, assigned, etc.)'),
  type: z.string().describe('Story type (comment or system)'),
});

export interface RawStory {
  gid?: string;
  text?: string | null;
  created_by?: { gid?: string; name?: string } | null;
  created_at?: string | null;
  resource_subtype?: string | null;
  type?: string | null;
}

export const mapStory = (s: RawStory | undefined): z.infer<typeof storySchema> => ({
  gid: s?.gid ?? '',
  text: s?.text ?? '',
  created_by_gid: s?.created_by?.gid ?? '',
  created_by_name: s?.created_by?.name ?? '',
  created_at: s?.created_at ?? '',
  resource_subtype: s?.resource_subtype ?? '',
  type: s?.type ?? '',
});

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const userSchema = z.object({
  gid: z.string().describe('User GID'),
  name: z.string().describe('User display name'),
  email: z.string().describe('User email address'),
});

export interface RawUser {
  gid?: string;
  name?: string | null;
  email?: string | null;
}

export const mapUser = (u: RawUser | undefined): z.infer<typeof userSchema> => ({
  gid: u?.gid ?? '',
  name: u?.name ?? '',
  email: u?.email ?? '',
});

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export const workspaceSchema = z.object({
  gid: z.string().describe('Workspace GID'),
  name: z.string().describe('Workspace name'),
});

export interface RawWorkspace {
  gid?: string;
  name?: string | null;
}

export const mapWorkspace = (w: RawWorkspace | undefined): z.infer<typeof workspaceSchema> => ({
  gid: w?.gid ?? '',
  name: w?.name ?? '',
});

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

export const tagSchema = z.object({
  gid: z.string().describe('Tag GID'),
  name: z.string().describe('Tag name'),
  color: z.string().describe('Tag color name, or empty if none'),
});

export interface RawTag {
  gid?: string;
  name?: string | null;
  color?: string | null;
}

export const mapTag = (t: RawTag | undefined): z.infer<typeof tagSchema> => ({
  gid: t?.gid ?? '',
  name: t?.name ?? '',
  color: t?.color ?? '',
});

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export const teamSchema = z.object({
  gid: z.string().describe('Team GID'),
  name: z.string().describe('Team name'),
  description: z.string().describe('Team description'),
});

export interface RawTeam {
  gid?: string;
  name?: string | null;
  description?: string | null;
}

export const mapTeam = (t: RawTeam | undefined): z.infer<typeof teamSchema> => ({
  gid: t?.gid ?? '',
  name: t?.name ?? '',
  description: t?.description ?? '',
});

// ---------------------------------------------------------------------------
// Opt-in field lists for API requests
// ---------------------------------------------------------------------------

export const TASK_OPT_FIELDS = [
  'name',
  'completed',
  'assignee.gid',
  'assignee.name',
  'due_on',
  'due_at',
  'start_on',
  'notes',
  'html_notes',
  'projects.gid',
  'projects.name',
  'tags.gid',
  'tags.name',
  'parent.gid',
  'num_subtasks',
  'created_at',
  'modified_at',
  'permalink_url',
  'resource_subtype',
].join(',');

export const PROJECT_OPT_FIELDS = [
  'name',
  'archived',
  'color',
  'notes',
  'owner.gid',
  'owner.name',
  'team.gid',
  'team.name',
  'created_at',
  'modified_at',
  'due_on',
  'start_on',
  'permalink_url',
  'public',
].join(',');

export const SECTION_OPT_FIELDS = ['name', 'created_at', 'project.gid'].join(',');

export const STORY_OPT_FIELDS = [
  'text',
  'created_by.gid',
  'created_by.name',
  'created_at',
  'resource_subtype',
  'type',
].join(',');
