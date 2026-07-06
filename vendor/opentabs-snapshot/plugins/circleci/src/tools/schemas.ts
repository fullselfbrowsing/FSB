import { z } from 'zod';

// --- Shared output schemas ---

export const userSchema = z.object({
  id: z.string().describe('User UUID'),
  login: z.string().describe('Username'),
  name: z.string().describe('Display name'),
  avatar_url: z.string().describe('Avatar image URL'),
});

export const collaborationSchema = z.object({
  id: z.string().describe('Organization UUID'),
  name: z.string().describe('Organization name'),
  slug: z.string().describe('Organization slug (e.g., "gh/org-name")'),
  vcs_type: z.string().describe('VCS provider (e.g., "github", "bitbucket")'),
  avatar_url: z.string().describe('Organization avatar URL'),
});

export const triggerActorSchema = z.object({
  login: z.string().describe('Actor username'),
  avatar_url: z.string().describe('Actor avatar URL'),
});

export const vcsInfoSchema = z.object({
  branch: z.string().describe('Branch name'),
  revision: z.string().describe('Git commit SHA'),
  commit_subject: z.string().describe('Commit message subject'),
  provider_name: z.string().describe('VCS provider name'),
  origin_repository_url: z.string().describe('Repository URL'),
});

export const pipelineSchema = z.object({
  id: z.string().describe('Pipeline UUID'),
  number: z.number().describe('Pipeline number'),
  state: z.string().describe('Pipeline state (e.g., "created", "errored")'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
  project_slug: z.string().describe('Project slug (e.g., "gh/org/repo")'),
  trigger_type: z.string().describe('Trigger type (e.g., "webhook", "api")'),
  trigger_actor: triggerActorSchema.describe('User who triggered the pipeline'),
  vcs: vcsInfoSchema.describe('VCS information'),
});

export const workflowSchema = z.object({
  id: z.string().describe('Workflow UUID'),
  name: z.string().describe('Workflow name'),
  status: z.string().describe('Workflow status (e.g., "success", "running", "failed", "canceled")'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  stopped_at: z.string().describe('ISO 8601 stop timestamp, empty if still running'),
  pipeline_id: z.string().describe('Parent pipeline UUID'),
  pipeline_number: z.number().describe('Parent pipeline number'),
  project_slug: z.string().describe('Project slug'),
  started_by: z.string().describe('User UUID who started the workflow'),
});

export const jobSchema = z.object({
  id: z.string().describe('Job UUID'),
  name: z.string().describe('Job name'),
  type: z.string().describe('Job type (e.g., "build", "approval")'),
  status: z.string().describe('Job status (e.g., "success", "running", "failed", "queued")'),
  job_number: z.number().describe('Job number within the project'),
  started_at: z.string().describe('ISO 8601 start timestamp'),
  stopped_at: z.string().describe('ISO 8601 stop timestamp, empty if still running'),
  project_slug: z.string().describe('Project slug'),
});

export const jobDetailSchema = jobSchema.extend({
  duration: z.number().describe('Job duration in milliseconds'),
  web_url: z.string().describe('URL to view the job in CircleCI'),
  parallelism: z.number().describe('Parallelism level'),
  organization_name: z.string().describe('Organization name'),
  pipeline_number: z.number().describe('Pipeline number'),
  workflow_name: z.string().describe('Workflow name'),
  workflow_id: z.string().describe('Workflow UUID'),
});

export const projectSchema = z.object({
  id: z.string().describe('Project UUID'),
  slug: z.string().describe('Project slug (e.g., "gh/org/repo")'),
  name: z.string().describe('Project name'),
  organization_name: z.string().describe('Organization name'),
  organization_id: z.string().describe('Organization UUID'),
  organization_slug: z.string().describe('Organization slug'),
});

export const artifactSchema = z.object({
  path: z.string().describe('Artifact file path'),
  url: z.string().describe('Download URL'),
  node_index: z.number().describe('Node index for parallel runs'),
});

export const testSchema = z.object({
  name: z.string().describe('Test name'),
  classname: z.string().describe('Test class name'),
  result: z.string().describe('Test result (e.g., "success", "failure")'),
  message: z.string().describe('Failure message, empty on success'),
  run_time: z.number().describe('Test run time in seconds'),
  source: z.string().describe('Test source/file'),
});

export const contextSchema = z.object({
  id: z.string().describe('Context UUID'),
  name: z.string().describe('Context name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export const contextEnvVarSchema = z.object({
  variable: z.string().describe('Environment variable name'),
  context_id: z.string().describe('Parent context UUID'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export const envVarSchema = z.object({
  name: z.string().describe('Environment variable name'),
  value: z.string().describe('Environment variable value (masked with xxxx)'),
});

export const workflowMetricSchema = z.object({
  name: z.string().describe('Workflow name'),
  window_start: z.string().describe('Metrics window start ISO 8601 timestamp'),
  window_end: z.string().describe('Metrics window end ISO 8601 timestamp'),
  total_runs: z.number().describe('Total number of runs in the window'),
  successful_runs: z.number().describe('Number of successful runs'),
  failed_runs: z.number().describe('Number of failed runs'),
  success_rate: z.number().describe('Success rate (0-1)'),
  throughput: z.number().describe('Average runs per day'),
  mttr: z.number().describe('Mean time to recovery in seconds'),
  duration_p50: z.number().describe('Median duration in seconds'),
  duration_p95: z.number().describe('95th percentile duration in seconds'),
});

export const workflowRunSchema = z.object({
  id: z.string().describe('Workflow run UUID'),
  status: z.string().describe('Run status'),
  duration: z.number().describe('Duration in seconds'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  stopped_at: z.string().describe('ISO 8601 stop timestamp'),
  branch: z.string().describe('Branch name'),
});

export const jobMetricSchema = z.object({
  name: z.string().describe('Job name'),
  window_start: z.string().describe('Metrics window start ISO 8601 timestamp'),
  window_end: z.string().describe('Metrics window end ISO 8601 timestamp'),
  total_runs: z.number().describe('Total number of runs in the window'),
  successful_runs: z.number().describe('Number of successful runs'),
  failed_runs: z.number().describe('Number of failed runs'),
  success_rate: z.number().describe('Success rate (0-1)'),
  throughput: z.number().describe('Average runs per day'),
  duration_p50: z.number().describe('Median duration in seconds'),
  duration_p95: z.number().describe('95th percentile duration in seconds'),
});

export const flakyTestSchema = z.object({
  test_name: z.string().describe('Test name'),
  classname: z.string().describe('Test class name'),
  pipeline_number: z.number().describe('Pipeline number where flaky test was detected'),
  workflow_name: z.string().describe('Workflow name'),
  job_name: z.string().describe('Job name'),
  times_flaked: z.number().describe('Number of times this test flaked'),
});

export const scheduleSchema = z.object({
  id: z.string().describe('Schedule UUID'),
  name: z.string().describe('Schedule name'),
  description: z.string().describe('Schedule description'),
  timetable: z
    .object({
      per_hour: z.number().describe('Runs per hour'),
      hours_of_day: z.array(z.number()).describe('Hours of day to run (0-23)'),
      days_of_week: z.array(z.string()).describe('Days of week (e.g., "MON", "TUE")'),
      days_of_month: z.array(z.number()).describe('Days of month (1-31)'),
      months: z.array(z.string()).describe('Months (e.g., "JAN", "FEB")'),
    })
    .describe('Schedule timetable'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

// --- Raw interfaces ---

export interface RawUser {
  id?: string;
  login?: string;
  name?: string;
  avatar_url?: string;
}

export interface RawCollaboration {
  id?: string;
  name?: string;
  slug?: string;
  vcs_type?: string;
  avatar_url?: string;
}

export interface RawPipeline {
  id?: string;
  number?: number;
  state?: string;
  created_at?: string;
  updated_at?: string;
  project_slug?: string;
  trigger?: { type?: string; actor?: { login?: string; avatar_url?: string }; received_at?: string };
  vcs?: {
    branch?: string;
    revision?: string;
    commit?: { subject?: string; body?: string };
    provider_name?: string;
    origin_repository_url?: string;
  };
}

export interface RawWorkflow {
  id?: string;
  name?: string;
  status?: string;
  created_at?: string;
  stopped_at?: string;
  pipeline_id?: string;
  pipeline_number?: number;
  project_slug?: string;
  started_by?: string;
}

export interface RawJob {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
  job_number?: number;
  started_at?: string;
  stopped_at?: string;
  project_slug?: string;
}

export interface RawJobDetail extends RawJob {
  number?: number;
  duration?: number;
  web_url?: string;
  parallelism?: number;
  organization?: { name?: string };
  pipeline?: { id?: string; number?: number };
  latest_workflow?: { id?: string; name?: string };
  project?: { slug?: string; id?: string; name?: string };
}

export interface RawProject {
  id?: string;
  slug?: string;
  name?: string;
  organization_name?: string;
  organization_id?: string;
  organization_slug?: string;
}

export interface RawArtifact {
  path?: string;
  url?: string;
  node_index?: number;
}

export interface RawTest {
  name?: string;
  classname?: string;
  result?: string;
  message?: string;
  run_time?: number;
  source?: string;
}

export interface RawContext {
  id?: string;
  name?: string;
  created_at?: string;
}

export interface RawContextEnvVar {
  variable?: string;
  context_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RawEnvVar {
  name?: string;
  value?: string;
}

export interface RawWorkflowMetric {
  name?: string;
  window_start?: string;
  window_end?: string;
  metrics?: {
    total_runs?: number;
    successful_runs?: number;
    failed_runs?: number;
    success_rate?: number;
    throughput?: number;
    mttr?: number;
    duration_metrics?: { min?: number; mean?: number; median?: number; p95?: number; max?: number };
  };
}

export interface RawWorkflowRun {
  id?: string;
  status?: string;
  duration?: number;
  created_at?: string;
  stopped_at?: string;
  branch?: { name?: string };
}

export interface RawJobMetric {
  name?: string;
  window_start?: string;
  window_end?: string;
  metrics?: {
    total_runs?: number;
    successful_runs?: number;
    failed_runs?: number;
    success_rate?: number;
    throughput?: number;
    duration_metrics?: { min?: number; mean?: number; median?: number; p95?: number; max?: number };
  };
}

export interface RawFlakyTest {
  test_name?: string;
  classname?: string;
  pipeline_number?: number;
  workflow_name?: string;
  job_name?: string;
  times_flaked?: number;
}

export interface RawSchedule {
  id?: string;
  name?: string;
  description?: string;
  timetable?: {
    per_hour?: number;
    hours_of_day?: number[];
    days_of_week?: string[];
    days_of_month?: number[];
    months?: string[];
  };
  created_at?: string;
  updated_at?: string;
}

// --- Paginated response envelope ---

export interface Paginated<T> {
  items?: T[];
  next_page_token?: string | null;
}

// --- Defensive mappers ---

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  login: u.login ?? '',
  name: u.name ?? '',
  avatar_url: u.avatar_url ?? '',
});

export const mapCollaboration = (c: RawCollaboration) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  slug: c.slug ?? '',
  vcs_type: c.vcs_type ?? '',
  avatar_url: c.avatar_url ?? '',
});

export const mapPipeline = (p: RawPipeline) => ({
  id: p.id ?? '',
  number: p.number ?? 0,
  state: p.state ?? '',
  created_at: p.created_at ?? '',
  updated_at: p.updated_at ?? '',
  project_slug: p.project_slug ?? '',
  trigger_type: p.trigger?.type ?? '',
  trigger_actor: {
    login: p.trigger?.actor?.login ?? '',
    avatar_url: p.trigger?.actor?.avatar_url ?? '',
  },
  vcs: {
    branch: p.vcs?.branch ?? '',
    revision: p.vcs?.revision ?? '',
    commit_subject: p.vcs?.commit?.subject ?? '',
    provider_name: p.vcs?.provider_name ?? '',
    origin_repository_url: p.vcs?.origin_repository_url ?? '',
  },
});

export const mapWorkflow = (w: RawWorkflow) => ({
  id: w.id ?? '',
  name: w.name ?? '',
  status: w.status ?? '',
  created_at: w.created_at ?? '',
  stopped_at: w.stopped_at ?? '',
  pipeline_id: w.pipeline_id ?? '',
  pipeline_number: w.pipeline_number ?? 0,
  project_slug: w.project_slug ?? '',
  started_by: w.started_by ?? '',
});

export const mapJob = (j: RawJob & { number?: number; project?: { slug?: string } }) => ({
  id: j.id ?? '',
  name: j.name ?? '',
  type: j.type ?? '',
  status: j.status ?? '',
  job_number: j.job_number ?? j.number ?? 0,
  started_at: j.started_at ?? '',
  stopped_at: j.stopped_at ?? '',
  project_slug: j.project_slug ?? j.project?.slug ?? '',
});

export const mapJobDetail = (j: RawJobDetail) => ({
  ...mapJob(j),
  job_number: j.job_number ?? j.number ?? 0,
  duration: j.duration ?? 0,
  web_url: j.web_url ?? '',
  parallelism: j.parallelism ?? 1,
  organization_name: j.organization?.name ?? '',
  pipeline_number: j.pipeline?.number ?? 0,
  workflow_name: j.latest_workflow?.name ?? '',
  workflow_id: j.latest_workflow?.id ?? '',
});

export const mapProject = (p: RawProject) => ({
  id: p.id ?? '',
  slug: p.slug ?? '',
  name: p.name ?? '',
  organization_name: p.organization_name ?? '',
  organization_id: p.organization_id ?? '',
  organization_slug: p.organization_slug ?? '',
});

export const mapArtifact = (a: RawArtifact) => ({
  path: a.path ?? '',
  url: a.url ?? '',
  node_index: a.node_index ?? 0,
});

export const mapTest = (t: RawTest) => ({
  name: t.name ?? '',
  classname: t.classname ?? '',
  result: t.result ?? '',
  message: t.message ?? '',
  run_time: t.run_time ?? 0,
  source: t.source ?? '',
});

export const mapContext = (c: RawContext) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  created_at: c.created_at ?? '',
});

export const mapContextEnvVar = (e: RawContextEnvVar) => ({
  variable: e.variable ?? '',
  context_id: e.context_id ?? '',
  created_at: e.created_at ?? '',
  updated_at: e.updated_at ?? '',
});

export const mapEnvVar = (e: RawEnvVar) => ({
  name: e.name ?? '',
  value: e.value ?? '',
});

export const mapWorkflowMetric = (m: RawWorkflowMetric) => ({
  name: m.name ?? '',
  window_start: m.window_start ?? '',
  window_end: m.window_end ?? '',
  total_runs: m.metrics?.total_runs ?? 0,
  successful_runs: m.metrics?.successful_runs ?? 0,
  failed_runs: m.metrics?.failed_runs ?? 0,
  success_rate: m.metrics?.success_rate ?? 0,
  throughput: m.metrics?.throughput ?? 0,
  mttr: m.metrics?.mttr ?? 0,
  duration_p50: m.metrics?.duration_metrics?.median ?? 0,
  duration_p95: m.metrics?.duration_metrics?.p95 ?? 0,
});

export const mapWorkflowRun = (r: RawWorkflowRun) => ({
  id: r.id ?? '',
  status: r.status ?? '',
  duration: r.duration ?? 0,
  created_at: r.created_at ?? '',
  stopped_at: r.stopped_at ?? '',
  branch: r.branch?.name ?? '',
});

export const mapJobMetric = (m: RawJobMetric) => ({
  name: m.name ?? '',
  window_start: m.window_start ?? '',
  window_end: m.window_end ?? '',
  total_runs: m.metrics?.total_runs ?? 0,
  successful_runs: m.metrics?.successful_runs ?? 0,
  failed_runs: m.metrics?.failed_runs ?? 0,
  success_rate: m.metrics?.success_rate ?? 0,
  throughput: m.metrics?.throughput ?? 0,
  duration_p50: m.metrics?.duration_metrics?.median ?? 0,
  duration_p95: m.metrics?.duration_metrics?.p95 ?? 0,
});

export const mapFlakyTest = (t: RawFlakyTest) => ({
  test_name: t.test_name ?? '',
  classname: t.classname ?? '',
  pipeline_number: t.pipeline_number ?? 0,
  workflow_name: t.workflow_name ?? '',
  job_name: t.job_name ?? '',
  times_flaked: t.times_flaked ?? 0,
});

export const mapSchedule = (s: RawSchedule) => ({
  id: s.id ?? '',
  name: s.name ?? '',
  description: s.description ?? '',
  timetable: {
    per_hour: s.timetable?.per_hour ?? 0,
    hours_of_day: s.timetable?.hours_of_day ?? [],
    days_of_week: s.timetable?.days_of_week ?? [],
    days_of_month: s.timetable?.days_of_month ?? [],
    months: s.timetable?.months ?? [],
  },
  created_at: s.created_at ?? '',
  updated_at: s.updated_at ?? '',
});
