import { z } from 'zod';

// --- Shared schemas ---

export const projectSchema = z.object({
  id: z.number().describe('Project ID'),
  name: z.string().describe('Project name'),
  path_with_namespace: z.string().describe('Full path including namespace (e.g., "group/project")'),
  description: z.string().describe('Project description'),
  visibility: z.string().describe('Visibility level: private, internal, or public'),
  web_url: z.string().describe('URL to the project on GitLab'),
  default_branch: z.string().describe('Default branch name'),
  star_count: z.number().describe('Number of stars'),
  forks_count: z.number().describe('Number of forks'),
  open_issues_count: z.number().describe('Number of open issues'),
  archived: z.boolean().describe('Whether the project is archived'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  last_activity_at: z.string().describe('Last activity ISO 8601 timestamp'),
});

export const issueSchema = z.object({
  iid: z.number().describe('Issue IID (project-scoped ID)'),
  title: z.string().describe('Issue title'),
  state: z.string().describe('Issue state: opened or closed'),
  description: z.string().describe('Issue description in Markdown'),
  web_url: z.string().describe('URL to the issue on GitLab'),
  author_username: z.string().describe('Username of the author'),
  labels: z.array(z.string()).describe('Label names'),
  assignees: z.array(z.string()).describe('Assignee usernames'),
  milestone_title: z.string().describe('Milestone title or empty string'),
  confidential: z.boolean().describe('Whether the issue is confidential'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  updated_at: z.string().describe('Updated ISO 8601 timestamp'),
  closed_at: z.string().describe('Closed ISO 8601 timestamp or empty string'),
});

export const mergeRequestSchema = z.object({
  iid: z.number().describe('Merge request IID (project-scoped ID)'),
  title: z.string().describe('Merge request title'),
  state: z.string().describe('MR state: opened, closed, merged, or locked'),
  description: z.string().describe('Merge request description in Markdown'),
  web_url: z.string().describe('URL to the MR on GitLab'),
  author_username: z.string().describe('Username of the author'),
  source_branch: z.string().describe('Source branch name'),
  target_branch: z.string().describe('Target branch name'),
  labels: z.array(z.string()).describe('Label names'),
  draft: z.boolean().describe('Whether this is a draft MR'),
  merged_by_username: z.string().describe('Username who merged, or empty string'),
  merge_status: z.string().describe('Merge status (e.g., can_be_merged, cannot_be_merged)'),
  has_conflicts: z.boolean().describe('Whether the MR has merge conflicts'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  updated_at: z.string().describe('Updated ISO 8601 timestamp'),
});

export const noteSchema = z.object({
  id: z.number().describe('Note ID'),
  body: z.string().describe('Note body in Markdown'),
  author_username: z.string().describe('Username of the commenter'),
  system: z.boolean().describe('Whether this is a system-generated note'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  updated_at: z.string().describe('Updated ISO 8601 timestamp'),
});

export const userSchema = z.object({
  id: z.number().describe('User ID'),
  username: z.string().describe('Username'),
  name: z.string().describe('Display name'),
  state: z.string().describe('Account state (e.g., active, blocked)'),
  avatar_url: z.string().describe('Avatar image URL'),
  web_url: z.string().describe('URL to the profile on GitLab'),
  bio: z.string().describe('User bio'),
  location: z.string().describe('Location'),
  public_email: z.string().describe('Public email address'),
});

export const branchSchema = z.object({
  name: z.string().describe('Branch name'),
  protected: z.boolean().describe('Whether the branch is protected'),
  default: z.boolean().describe('Whether this is the default branch'),
  sha: z.string().describe('SHA of the branch HEAD commit'),
  web_url: z.string().describe('URL to the branch on GitLab'),
});

export const pipelineSchema = z.object({
  id: z.number().describe('Pipeline ID'),
  iid: z.number().describe('Pipeline IID (project-scoped)'),
  status: z.string().describe('Pipeline status (e.g., running, success, failed, canceled, pending)'),
  ref: z.string().describe('Branch or tag name'),
  sha: z.string().describe('Commit SHA'),
  source: z.string().describe('Pipeline source (e.g., push, web, schedule, merge_request_event)'),
  web_url: z.string().describe('URL to the pipeline on GitLab'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  updated_at: z.string().describe('Updated ISO 8601 timestamp'),
});

export const jobSchema = z.object({
  id: z.number().describe('Job ID'),
  name: z.string().describe('Job name'),
  stage: z.string().describe('Stage name'),
  status: z.string().describe('Job status (e.g., running, success, failed, canceled, pending)'),
  ref: z.string().describe('Branch or tag name'),
  web_url: z.string().describe('URL to the job on GitLab'),
  duration: z.number().describe('Duration in seconds or 0 if not finished'),
  created_at: z.string().describe('Created ISO 8601 timestamp'),
  finished_at: z.string().describe('Finished ISO 8601 timestamp or empty string'),
});

// --- Defensive mappers ---

interface RawProject {
  id?: number;
  name?: string;
  path_with_namespace?: string;
  description?: string | null;
  visibility?: string;
  web_url?: string;
  default_branch?: string | null;
  star_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  archived?: boolean;
  created_at?: string;
  last_activity_at?: string;
}

export const mapProject = (p: RawProject) => ({
  id: p.id ?? 0,
  name: p.name ?? '',
  path_with_namespace: p.path_with_namespace ?? '',
  description: p.description ?? '',
  visibility: p.visibility ?? '',
  web_url: p.web_url ?? '',
  default_branch: p.default_branch ?? '',
  star_count: p.star_count ?? 0,
  forks_count: p.forks_count ?? 0,
  open_issues_count: p.open_issues_count ?? 0,
  archived: p.archived ?? false,
  created_at: p.created_at ?? '',
  last_activity_at: p.last_activity_at ?? '',
});

interface RawUser {
  username?: string;
}

interface RawMilestone {
  title?: string;
}

interface RawIssue {
  iid?: number;
  title?: string;
  state?: string;
  description?: string | null;
  web_url?: string;
  author?: RawUser | null;
  labels?: string[];
  assignees?: RawUser[];
  milestone?: RawMilestone | null;
  confidential?: boolean;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
}

export const mapIssue = (i: RawIssue) => ({
  iid: i.iid ?? 0,
  title: i.title ?? '',
  state: i.state ?? '',
  description: i.description ?? '',
  web_url: i.web_url ?? '',
  author_username: i.author?.username ?? '',
  labels: i.labels ?? [],
  assignees: (i.assignees ?? []).map(a => a.username ?? ''),
  milestone_title: i.milestone?.title ?? '',
  confidential: i.confidential ?? false,
  created_at: i.created_at ?? '',
  updated_at: i.updated_at ?? '',
  closed_at: i.closed_at ?? '',
});

interface RawMergeRequest {
  iid?: number;
  title?: string;
  state?: string;
  description?: string | null;
  web_url?: string;
  author?: RawUser | null;
  source_branch?: string;
  target_branch?: string;
  labels?: string[];
  draft?: boolean;
  merged_by?: RawUser | null;
  merge_status?: string;
  has_conflicts?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const mapMergeRequest = (mr: RawMergeRequest) => ({
  iid: mr.iid ?? 0,
  title: mr.title ?? '',
  state: mr.state ?? '',
  description: mr.description ?? '',
  web_url: mr.web_url ?? '',
  author_username: mr.author?.username ?? '',
  source_branch: mr.source_branch ?? '',
  target_branch: mr.target_branch ?? '',
  labels: mr.labels ?? [],
  draft: mr.draft ?? false,
  merged_by_username: mr.merged_by?.username ?? '',
  merge_status: mr.merge_status ?? '',
  has_conflicts: mr.has_conflicts ?? false,
  created_at: mr.created_at ?? '',
  updated_at: mr.updated_at ?? '',
});

interface RawNote {
  id?: number;
  body?: string;
  author?: RawUser | null;
  system?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const mapNote = (n: RawNote) => ({
  id: n.id ?? 0,
  body: n.body ?? '',
  author_username: n.author?.username ?? '',
  system: n.system ?? false,
  created_at: n.created_at ?? '',
  updated_at: n.updated_at ?? '',
});

interface RawUserProfile {
  id?: number;
  username?: string;
  name?: string;
  state?: string;
  avatar_url?: string;
  web_url?: string;
  bio?: string | null;
  location?: string | null;
  public_email?: string | null;
}

export const mapUser = (u: RawUserProfile) => ({
  id: u.id ?? 0,
  username: u.username ?? '',
  name: u.name ?? '',
  state: u.state ?? '',
  avatar_url: u.avatar_url ?? '',
  web_url: u.web_url ?? '',
  bio: u.bio ?? '',
  location: u.location ?? '',
  public_email: u.public_email ?? '',
});

interface RawBranch {
  name?: string;
  protected?: boolean;
  default?: boolean;
  commit?: { id?: string };
  web_url?: string;
}

export const mapBranch = (b: RawBranch) => ({
  name: b.name ?? '',
  protected: b.protected ?? false,
  default: b.default ?? false,
  sha: b.commit?.id ?? '',
  web_url: b.web_url ?? '',
});

interface RawPipeline {
  id?: number;
  iid?: number;
  status?: string;
  ref?: string;
  sha?: string;
  source?: string;
  web_url?: string;
  created_at?: string;
  updated_at?: string;
}

export const mapPipeline = (p: RawPipeline) => ({
  id: p.id ?? 0,
  iid: p.iid ?? 0,
  status: p.status ?? '',
  ref: p.ref ?? '',
  sha: p.sha ?? '',
  source: p.source ?? '',
  web_url: p.web_url ?? '',
  created_at: p.created_at ?? '',
  updated_at: p.updated_at ?? '',
});

interface RawJob {
  id?: number;
  name?: string;
  stage?: string;
  status?: string;
  ref?: string;
  web_url?: string;
  duration?: number | null;
  created_at?: string;
  finished_at?: string | null;
}

export const mapJob = (j: RawJob) => ({
  id: j.id ?? 0,
  name: j.name ?? '',
  stage: j.stage ?? '',
  status: j.status ?? '',
  ref: j.ref ?? '',
  web_url: j.web_url ?? '',
  duration: j.duration ?? 0,
  created_at: j.created_at ?? '',
  finished_at: j.finished_at ?? '',
});

export const commitSchema = z.object({
  id: z.string().describe('Full commit SHA'),
  short_id: z.string().describe('Short commit SHA'),
  title: z.string().describe('Commit title (first line of the message)'),
  message: z.string().describe('Full commit message'),
  author_name: z.string().describe('Author name'),
  author_email: z.string().describe('Author email'),
  authored_date: z.string().describe('Authored ISO 8601 timestamp'),
  web_url: z.string().describe('URL to the commit on GitLab'),
});

interface RawCommit {
  id?: string;
  short_id?: string;
  title?: string;
  message?: string;
  author_name?: string;
  author_email?: string;
  authored_date?: string;
  web_url?: string;
}

export const mapCommit = (c: RawCommit) => ({
  id: c.id ?? '',
  short_id: c.short_id ?? '',
  title: c.title ?? '',
  message: c.message ?? '',
  author_name: c.author_name ?? '',
  author_email: c.author_email ?? '',
  authored_date: c.authored_date ?? '',
  web_url: c.web_url ?? '',
});
