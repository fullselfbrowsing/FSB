import { z } from 'zod';

// --- Shared output schemas ---

export const storySchema = z.object({
  id: z.number().int().describe('Story numeric ID'),
  name: z.string().describe('Story title'),
  app_url: z.string().describe('Web URL to the story'),
  story_type: z.string().describe('Story type: feature, bug, or chore'),
  description: z.string().describe('Story description in Markdown'),
  archived: z.boolean().describe('Whether the story is archived'),
  started: z.boolean().describe('Whether the story has been started'),
  completed: z.boolean().describe('Whether the story is completed'),
  blocker: z.boolean().describe('Whether the story is a blocker'),
  blocked: z.boolean().describe('Whether the story is blocked'),
  workflow_state_id: z.number().int().describe('Workflow state ID'),
  workflow_id: z.number().int().describe('Workflow ID'),
  epic_id: z.number().int().nullable().describe('Epic ID, or null'),
  iteration_id: z.number().int().nullable().describe('Iteration ID, or null'),
  group_id: z.string().describe('Team (group) ID, or empty'),
  estimate: z.number().nullable().describe('Story point estimate, or null'),
  deadline: z.string().describe('Deadline in ISO 8601, or empty'),
  owner_ids: z.array(z.string()).describe('Member IDs of story owners'),
  label_ids: z.array(z.number().int()).describe('Label IDs attached to the story'),
  requested_by_id: z.string().describe('Member ID of the requester'),
  project_id: z.number().int().nullable().describe('Project ID, or null'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last-updated timestamp'),
});

export const storyDetailSchema = storySchema.extend({
  labels: z.array(z.object({ id: z.number().int(), name: z.string() })).describe('Attached labels'),
  story_links: z
    .array(
      z.object({
        id: z.number().int().describe('Story link ID'),
        type: z.string().describe('Relationship type'),
        subject_id: z.number().int().describe('Subject story ID'),
        object_id: z.number().int().describe('Object story ID'),
      }),
    )
    .describe('Relationships to other stories'),
  comment_ids: z.array(z.number().int()).describe('IDs of comments on this story'),
  task_ids: z.array(z.number().int()).describe('IDs of tasks in this story'),
});

export const epicSchema = z.object({
  id: z.number().int().describe('Epic numeric ID'),
  name: z.string().describe('Epic name'),
  app_url: z.string().describe('Web URL to the epic'),
  description: z.string().describe('Epic description in Markdown'),
  archived: z.boolean().describe('Whether the epic is archived'),
  started: z.boolean().describe('Whether the epic has been started'),
  completed: z.boolean().describe('Whether the epic is completed'),
  state: z.string().describe('Epic state: to do, in progress, or done'),
  deadline: z.string().describe('Deadline in ISO 8601, or empty'),
  owner_ids: z.array(z.string()).describe('Member IDs of epic owners'),
  label_ids: z.array(z.number().int()).describe('Label IDs attached'),
  objective_ids: z.array(z.number().int()).describe('Objective IDs linked'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last-updated timestamp'),
});

export const memberSchema = z.object({
  id: z.string().describe('Member UUID'),
  role: z.string().describe('Role: admin, member, or observer'),
  disabled: z.boolean().describe('Whether the member is disabled'),
  name: z.string().describe('Display name from profile'),
  mention_name: z.string().describe('@mention handle'),
  email: z.string().describe('Email address'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export const labelSchema = z.object({
  id: z.number().int().describe('Label numeric ID'),
  name: z.string().describe('Label name'),
  color: z.string().describe('Hex color code'),
  description: z.string().describe('Label description'),
  archived: z.boolean().describe('Whether the label is archived'),
});

export const workflowSchema = z.object({
  id: z.number().int().describe('Workflow numeric ID'),
  name: z.string().describe('Workflow name'),
  team_id: z.number().int().describe('Associated team ID'),
  default_state_id: z.number().int().describe('Default state ID'),
  states: z
    .array(
      z.object({
        id: z.number().int().describe('State ID'),
        name: z.string().describe('State name'),
        type: z.string().describe('State type: unstarted, started, or done'),
        position: z.number().int().describe('Display position'),
      }),
    )
    .describe('Workflow states in order'),
});

export const teamSchema = z.object({
  id: z.number().int().describe('Team numeric ID'),
  name: z.string().describe('Team name'),
  description: z.string().describe('Team description'),
  workflow_id: z.number().int().describe('Associated workflow ID'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export const iterationSchema = z.object({
  id: z.number().int().describe('Iteration numeric ID'),
  name: z.string().describe('Iteration name'),
  app_url: z.string().describe('Web URL to the iteration'),
  status: z.string().describe('Iteration status: unstarted, started, or done'),
  start_date: z.string().describe('Start date in YYYY-MM-DD format'),
  end_date: z.string().describe('End date in YYYY-MM-DD format'),
  label_ids: z.array(z.number().int()).describe('Label IDs attached'),
  group_ids: z.array(z.string()).describe('Team IDs associated'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last-updated timestamp'),
});

export const commentSchema = z.object({
  id: z.number().int().describe('Comment numeric ID'),
  text: z.string().describe('Comment body in Markdown'),
  author_id: z.string().describe('Member ID of the author'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last-updated timestamp'),
});

export const objectiveSchema = z.object({
  id: z.number().int().describe('Objective numeric ID'),
  name: z.string().describe('Objective name'),
  app_url: z.string().describe('Web URL'),
  description: z.string().describe('Objective description'),
  archived: z.boolean().describe('Whether the objective is archived'),
  state: z.string().describe('Objective state'),
  completed: z.boolean().describe('Whether the objective is completed'),
  started: z.boolean().describe('Whether the objective has been started'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last-updated timestamp'),
});

export const searchResultSchema = z.object({
  data: z.array(storySchema).describe('Matching stories'),
  total: z.number().int().describe('Total number of results'),
  next: z.string().describe('Cursor token for next page, or empty'),
});

// --- Raw interfaces ---

export interface RawStory {
  id?: number;
  name?: string;
  app_url?: string;
  description?: string;
  story_type?: string;
  archived?: boolean;
  started?: boolean;
  completed?: boolean;
  blocker?: boolean;
  blocked?: boolean;
  workflow_state_id?: number;
  workflow_id?: number;
  epic_id?: number | null;
  iteration_id?: number | null;
  group_id?: string | null;
  estimate?: number | null;
  deadline?: string | null;
  owner_ids?: string[];
  label_ids?: number[];
  requested_by_id?: string;
  project_id?: number | null;
  created_at?: string;
  updated_at?: string;
  labels?: RawLabel[];
  story_links?: RawStoryLink[];
  comment_ids?: number[];
  task_ids?: number[];
}

interface RawStoryLink {
  id?: number;
  type?: string;
  subject_id?: number;
  object_id?: number;
}

export interface RawEpic {
  id?: number;
  name?: string;
  app_url?: string;
  description?: string;
  archived?: boolean;
  started?: boolean;
  completed?: boolean;
  state?: string;
  deadline?: string | null;
  owner_ids?: string[];
  label_ids?: number[];
  objective_ids?: number[];
  created_at?: string;
  updated_at?: string;
}

export interface RawMember {
  id?: string;
  role?: string;
  disabled?: boolean;
  profile?: { name?: string; mention_name?: string; email_address?: string };
  created_at?: string;
}

export interface RawLabel {
  id?: number;
  name?: string;
  color?: string;
  description?: string;
  archived?: boolean;
}

export interface RawWorkflow {
  id?: number;
  name?: string;
  team_id?: number;
  default_state_id?: number;
  states?: RawWorkflowState[];
}

interface RawWorkflowState {
  id?: number;
  name?: string;
  type?: string;
  position?: number;
}

export interface RawTeam {
  id?: number;
  name?: string;
  description?: string;
  workflow?: { id?: number };
  created_at?: string;
}

export interface RawIteration {
  id?: number;
  name?: string;
  app_url?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  label_ids?: number[];
  group_ids?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface RawComment {
  id?: number;
  text?: string;
  author_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RawObjective {
  id?: number;
  name?: string;
  app_url?: string;
  description?: string;
  archived?: boolean;
  state?: string;
  completed?: boolean;
  started?: boolean;
  created_at?: string;
  updated_at?: string;
}

// --- Defensive mappers ---

export const mapStory = (s: RawStory) => ({
  id: s.id ?? 0,
  name: s.name ?? '',
  app_url: s.app_url ?? '',
  story_type: s.story_type ?? '',
  description: s.description ?? '',
  archived: s.archived ?? false,
  started: s.started ?? false,
  completed: s.completed ?? false,
  blocker: s.blocker ?? false,
  blocked: s.blocked ?? false,
  workflow_state_id: s.workflow_state_id ?? 0,
  workflow_id: s.workflow_id ?? 0,
  epic_id: s.epic_id ?? null,
  iteration_id: s.iteration_id ?? null,
  group_id: s.group_id ?? '',
  estimate: s.estimate ?? null,
  deadline: s.deadline ?? '',
  owner_ids: s.owner_ids ?? [],
  label_ids: s.label_ids ?? [],
  requested_by_id: s.requested_by_id ?? '',
  project_id: s.project_id ?? null,
  created_at: s.created_at ?? '',
  updated_at: s.updated_at ?? '',
});

export const mapStoryDetail = (s: RawStory) => ({
  ...mapStory(s),
  labels: (s.labels ?? []).map(l => ({ id: l.id ?? 0, name: l.name ?? '' })),
  story_links: (s.story_links ?? []).map(l => ({
    id: l.id ?? 0,
    type: l.type ?? '',
    subject_id: l.subject_id ?? 0,
    object_id: l.object_id ?? 0,
  })),
  comment_ids: s.comment_ids ?? [],
  task_ids: s.task_ids ?? [],
});

export const mapEpic = (e: RawEpic) => ({
  id: e.id ?? 0,
  name: e.name ?? '',
  app_url: e.app_url ?? '',
  description: e.description ?? '',
  archived: e.archived ?? false,
  started: e.started ?? false,
  completed: e.completed ?? false,
  state: e.state ?? '',
  deadline: e.deadline ?? '',
  owner_ids: e.owner_ids ?? [],
  label_ids: e.label_ids ?? [],
  objective_ids: e.objective_ids ?? [],
  created_at: e.created_at ?? '',
  updated_at: e.updated_at ?? '',
});

export const mapMember = (m: RawMember) => ({
  id: m.id ?? '',
  role: m.role ?? '',
  disabled: m.disabled ?? false,
  name: m.profile?.name ?? '',
  mention_name: m.profile?.mention_name ?? '',
  email: m.profile?.email_address ?? '',
  created_at: m.created_at ?? '',
});

export const mapLabel = (l: RawLabel) => ({
  id: l.id ?? 0,
  name: l.name ?? '',
  color: l.color ?? '',
  description: l.description ?? '',
  archived: l.archived ?? false,
});

export const mapWorkflow = (w: RawWorkflow) => ({
  id: w.id ?? 0,
  name: w.name ?? '',
  team_id: w.team_id ?? 0,
  default_state_id: w.default_state_id ?? 0,
  states: (w.states ?? []).map(s => ({
    id: s.id ?? 0,
    name: s.name ?? '',
    type: s.type ?? '',
    position: s.position ?? 0,
  })),
});

export const mapTeam = (t: RawTeam) => ({
  id: t.id ?? 0,
  name: t.name ?? '',
  description: t.description ?? '',
  workflow_id: t.workflow?.id ?? 0,
  created_at: t.created_at ?? '',
});

export const mapIteration = (i: RawIteration) => ({
  id: i.id ?? 0,
  name: i.name ?? '',
  app_url: i.app_url ?? '',
  status: i.status ?? '',
  start_date: i.start_date ?? '',
  end_date: i.end_date ?? '',
  label_ids: i.label_ids ?? [],
  group_ids: i.group_ids ?? [],
  created_at: i.created_at ?? '',
  updated_at: i.updated_at ?? '',
});

export const mapComment = (c: RawComment) => ({
  id: c.id ?? 0,
  text: c.text ?? '',
  author_id: c.author_id ?? '',
  created_at: c.created_at ?? '',
  updated_at: c.updated_at ?? '',
});

export const mapObjective = (o: RawObjective) => ({
  id: o.id ?? 0,
  name: o.name ?? '',
  app_url: o.app_url ?? '',
  description: o.description ?? '',
  archived: o.archived ?? false,
  state: o.state ?? '',
  completed: o.completed ?? false,
  started: o.started ?? false,
  created_at: o.created_at ?? '',
  updated_at: o.updated_at ?? '',
});
