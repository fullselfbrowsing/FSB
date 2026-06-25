import { z } from 'zod';

// --- Issue schema ---
export const issueSchema = z.object({
  id: z.string().describe('Issue ID'),
  key: z.string().describe('Issue key (e.g. KAN-1)'),
  summary: z.string().describe('Issue summary/title'),
  status: z.string().describe('Current status name'),
  status_category: z.string().describe('Status category (To Do, In Progress, Done)'),
  issue_type: z.string().describe('Issue type (Task, Story, Bug, Epic, etc.)'),
  priority: z.string().describe('Priority name'),
  assignee_id: z.string().optional().describe('Assignee account ID, if assigned'),
  assignee_name: z.string().optional().describe('Assignee display name, if assigned'),
  reporter_id: z.string().optional().describe('Reporter account ID'),
  reporter_name: z.string().optional().describe('Reporter display name'),
  project_key: z.string().describe('Project key'),
  project_name: z.string().describe('Project name'),
  labels: z.array(z.string()).describe('Issue labels'),
  created: z.string().describe('Creation timestamp'),
  updated: z.string().describe('Last updated timestamp'),
  description_text: z.string().describe('Plain text representation of the description'),
});

export interface JiraIssueFields {
  summary?: string;
  status?: { name?: string; statusCategory?: { name?: string } };
  issuetype?: { name?: string };
  priority?: { name?: string };
  assignee?: { accountId?: string; displayName?: string } | null;
  reporter?: { accountId?: string; displayName?: string } | null;
  project?: { key?: string; name?: string };
  labels?: string[];
  created?: string;
  updated?: string;
  description?: { content?: Array<{ content?: Array<{ text?: string }> }> };
}

const extractText = (doc: JiraIssueFields['description'] | undefined): string => {
  if (!doc?.content) return '';
  return doc.content.map(block => (block.content ?? []).map(inline => inline.text ?? '').join('')).join('\n');
};

export const mapIssue = (issue: Record<string, unknown>): z.infer<typeof issueSchema> => {
  const fields = (issue.fields ?? {}) as JiraIssueFields;
  return {
    id: (issue.id as string) ?? '',
    key: (issue.key as string) ?? '',
    summary: fields.summary ?? '',
    status: fields.status?.name ?? '',
    status_category: fields.status?.statusCategory?.name ?? '',
    issue_type: fields.issuetype?.name ?? '',
    priority: fields.priority?.name ?? '',
    assignee_id: fields.assignee?.accountId ?? undefined,
    assignee_name: fields.assignee?.displayName ?? undefined,
    reporter_id: fields.reporter?.accountId ?? undefined,
    reporter_name: fields.reporter?.displayName ?? undefined,
    project_key: fields.project?.key ?? '',
    project_name: fields.project?.name ?? '',
    labels: fields.labels ?? [],
    created: fields.created ?? '',
    updated: fields.updated ?? '',
    description_text: extractText(fields.description),
  };
};

// --- Project schema ---
export const projectSchema = z.object({
  id: z.string().describe('Project ID'),
  key: z.string().describe('Project key'),
  name: z.string().describe('Project name'),
  project_type: z.string().describe('Project type key (software, business, etc.)'),
  style: z.string().describe('Project style (classic or next-gen)'),
});

interface JiraProject {
  id?: string;
  key?: string;
  name?: string;
  projectTypeKey?: string;
  style?: string;
  simplified?: boolean;
}

export const mapProject = (p: Record<string, unknown>): z.infer<typeof projectSchema> => {
  const proj = p as unknown as JiraProject;
  return {
    id: proj.id ?? '',
    key: proj.key ?? '',
    name: proj.name ?? '',
    project_type: proj.projectTypeKey ?? '',
    style: proj.simplified ? 'next-gen' : (proj.style ?? 'classic'),
  };
};

// --- Comment schema ---
export const commentSchema = z.object({
  id: z.string().describe('Comment ID'),
  author_id: z.string().describe('Author account ID'),
  author_name: z.string().describe('Author display name'),
  body_text: z.string().describe('Plain text representation of the comment'),
  created: z.string().describe('Creation timestamp'),
  updated: z.string().describe('Last updated timestamp'),
});

interface JiraComment {
  id?: string;
  author?: { accountId?: string; displayName?: string };
  body?: { content?: Array<{ content?: Array<{ text?: string }> }> };
  created?: string;
  updated?: string;
}

export const mapComment = (c: Record<string, unknown>): z.infer<typeof commentSchema> => {
  const comment = c as unknown as JiraComment;
  return {
    id: comment.id ?? '',
    author_id: comment.author?.accountId ?? '',
    author_name: comment.author?.displayName ?? '',
    body_text: extractText(comment.body as JiraIssueFields['description'] | undefined),
    created: comment.created ?? '',
    updated: comment.updated ?? '',
  };
};

// --- Transition schema ---
export const transitionSchema = z.object({
  id: z.string().describe('Transition ID'),
  name: z.string().describe('Transition name'),
  to_status: z.string().describe('Target status name'),
  to_status_category: z.string().describe('Target status category (To Do, In Progress, Done)'),
});

interface JiraTransition {
  id?: string;
  name?: string;
  to?: { name?: string; statusCategory?: { name?: string } };
}

export const mapTransition = (t: Record<string, unknown>): z.infer<typeof transitionSchema> => {
  const transition = t as unknown as JiraTransition;
  return {
    id: transition.id ?? '',
    name: transition.name ?? '',
    to_status: transition.to?.name ?? '',
    to_status_category: transition.to?.statusCategory?.name ?? '',
  };
};

// --- User schema ---
export const userSchema = z.object({
  account_id: z.string().describe('Atlassian account ID'),
  display_name: z.string().describe('Display name'),
  email: z.string().describe('Email address'),
  active: z.boolean().describe('Whether the account is active'),
  account_type: z.string().describe('Account type (atlassian, app, etc.)'),
});

interface JiraUser {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
  accountType?: string;
}

export const mapUser = (u: Record<string, unknown>): z.infer<typeof userSchema> => {
  const user = u as unknown as JiraUser;
  return {
    account_id: user.accountId ?? '',
    display_name: user.displayName ?? '',
    email: user.emailAddress ?? '',
    active: user.active ?? true,
    account_type: user.accountType ?? '',
  };
};

// Jira uses Atlassian Document Format for descriptions and comments
export const buildAdfText = (text: string): Record<string, unknown> => ({
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    },
  ],
});

// Standard issue fields for search queries
export const ISSUE_FIELDS = [
  'summary',
  'status',
  'assignee',
  'priority',
  'issuetype',
  'created',
  'updated',
  'project',
  'description',
  'labels',
  'reporter',
];
