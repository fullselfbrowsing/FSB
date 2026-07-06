import { z } from 'zod';

// --- Shared Zod schemas for tool outputs ---

export const organizationSchema = z.object({
  id: z.string().describe('Organization ID'),
  name: z.string().describe('Organization name'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  email: z.string().describe('User email'),
  first_name: z.string().describe('First name'),
  last_name: z.string().describe('Last name'),
  is_admin: z.boolean().describe('Whether user is an admin'),
});

export const membershipSchema = z.object({
  id: z.string().describe('Membership ID'),
  role: z.string().describe('Role (e.g., member, admin)'),
  created_at: z.string().describe('ISO 8601 join timestamp'),
  user: userSchema,
});

export const projectListItemSchema = z.object({
  id: z.string().describe('Project ID'),
  name: z.string().describe('Project name'),
  organization_name: z.string().describe('Organization name'),
  host_kind: z.string().nullable().describe('Hosting provider (e.g., github)'),
  status: z.string().describe('Project status'),
  latest_test_run_at: z.string().nullable().describe('Last successful test run timestamp'),
  total_sessions: z.number().nullable().describe('Total sessions in latest test run'),
  total_screenshots: z.number().nullable().describe('Total screenshots in latest test run'),
});

export const projectSchema = z.object({
  id: z.string().describe('Project ID'),
  name: z.string().describe('Project name'),
  organization_name: z.string().describe('Organization name'),
  host_kind: z.string().nullable().describe('Hosting provider'),
  status: z.string().describe('Project status'),
  recording_token: z.string().nullable().describe('Recording token for SDK'),
  api_token: z.string().nullable().describe('API token'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 update timestamp'),
  enterprise_grade_security: z.boolean().describe('Enterprise security enabled'),
  auto_session_selection: z.boolean().describe('Auto session selection enabled'),
});

export const screenshotSchema = z.object({
  filename: z.string().describe('Screenshot filename'),
  public_url: z.string().describe('Signed URL to screenshot image'),
  replay_id: z.string().optional().describe('Replay ID'),
  route_url: z.string().optional().describe('Page URL'),
  route_group: z.string().optional().describe('Route group'),
  identifier_type: z.string().optional().describe('Screenshot type (e.g., ScreenshotAfterEvent, EndStateScreenshot)'),
  event_number: z.number().optional().describe('Event number for after-event screenshots'),
});

export const diffResultSchema = z.object({
  outcome: z.string().describe('Diff outcome'),
  user_visible_outcome: z.string().describe('User-visible outcome'),
  group_id: z.string().nullable().describe('Group ID'),
  width: z.number().nullable().describe('Screenshot width'),
  mismatch_pixels: z.number().nullable().describe('Number of mismatched pixels'),
  diff_hash: z.string().nullable().describe('Diff hash for deduplication'),
  base_screenshot: screenshotSchema.nullable().describe('Base (expected) screenshot'),
  head_screenshot: screenshotSchema.nullable().describe('Head (actual) screenshot'),
  diff_url_thumb: z.string().nullable().describe('Diff thumbnail URL'),
  diff_url_full: z.string().nullable().describe('Full diff image URL'),
  changed_class_names: z.array(z.string()).describe('CSS class names of changed sections'),
});

export const replayInfoSchema = z.object({
  id: z.string().describe('Replay ID'),
  status: z.string().nullable().describe('Replay status (e.g., Success, Failure)'),
  is_accurate: z.boolean().nullable().describe('Whether replay was accurate'),
  app_url: z.string().nullable().describe('Application URL'),
});

export const testRunStatsSchema = z.object({
  total_screenshots: z.number().describe('Total screenshots compared'),
  total_sessions: z.number().describe('Total sessions'),
  total_sessions_replayed: z.number().nullable().describe('Sessions successfully replayed'),
  sessions_skipped: z.number().nullable().describe('Sessions skipped'),
  screenshots_skipped: z.number().nullable().describe('Screenshots skipped'),
});

export const testRunSchema = z.object({
  id: z.string().describe('Test run ID'),
  status: z.string().describe('Test run status'),
  commit_sha: z.string().nullable().describe('Git commit SHA'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 update timestamp'),
  project_name: z.string().describe('Project name'),
  organization_name: z.string().describe('Organization name'),
  stats: testRunStatsSchema.nullable().describe('Test run statistics'),
  ci_provider: z.string().nullable().describe('CI provider'),
  pr_title: z.string().nullable().describe('Pull request title'),
  pr_number: z.number().nullable().describe('Pull request number'),
  pr_url: z.string().nullable().describe('Pull request URL'),
  approval_state: z.string().nullable().describe('PR approval state'),
  describe_tested: z.string().nullable().describe('Description of what was tested'),
});

export const replaySchema = z.object({
  id: z.string().describe('Replay ID'),
  status: z.string().describe('Replay status'),
  commit_sha: z.string().nullable().describe('Git commit SHA'),
  is_accurate: z.boolean().nullable().describe('Whether replay is accurate'),
  app_url: z.string().nullable().describe('Application URL'),
  session_id: z.string().nullable().describe('Source session ID'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  project_name: z.string().nullable().describe('Project name'),
  organization_name: z.string().nullable().describe('Organization name'),
});

export const sessionSchema = z.object({
  id: z.string().describe('Session ID'),
  project_id: z.string().describe('Project ID'),
  project_name: z.string().describe('Project name'),
  hostname: z.string().nullable().describe('Recording hostname'),
  datetime: z.string().nullable().describe('Session datetime'),
  num_user_events: z.number().nullable().describe('Number of user events'),
  num_bytes: z.number().nullable().describe('Size in bytes'),
  source: z.string().nullable().describe('Recording source'),
  start_url: z.string().nullable().describe('Starting URL'),
  abandoned: z.boolean().nullable().describe('Whether session was abandoned'),
  description: z.string().nullable().describe('Session description'),
});

export const sessionEventSchema = z.object({
  type: z.string().describe('Event type (e.g., click, scroll, input)'),
  timestamp: z.number().nullable().describe('Event timestamp (ms)'),
  selector: z.string().nullable().describe('CSS selector of target element'),
  client_x: z.number().nullable().describe('Mouse X coordinate'),
  client_y: z.number().nullable().describe('Mouse Y coordinate'),
});

export const labelActionSchema = z.object({
  id: z.string().describe('Label action ID'),
  replay_diff_id: z.string().describe('Replay diff ID'),
  screenshot_file_name: z.string().describe('Screenshot filename'),
  label: z.string().describe('Label (e.g., approved, rejected)'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export const coverageSchema = z.object({
  route_group: z.string().nullable().describe('Route group'),
  route_url: z.string().nullable().describe('Route URL'),
  screenshots: z.array(screenshotSchema).describe('Screenshots for this route'),
});

export const pullRequestSchema = z.object({
  id: z.string().describe('Pull request ID'),
  approval_state: z.string().nullable().describe('Approval state'),
  latest_test_run_id: z.string().nullable().describe('Latest test run ID'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export const githubRepoSchema = z.object({
  id: z.string().describe('GitHub repository ID'),
  name: z.string().describe('Repository name'),
  owner: z.string().describe('Repository owner'),
  url: z.string().describe('Repository URL'),
  full_name: z.string().describe('Full repository name (owner/name)'),
});

// --- Defensive mappers ---

interface RawOrg {
  id?: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
}
export const mapOrg = (o: RawOrg) => ({
  id: o.id ?? '',
  name: o.name ?? '',
  created_at: o.createdAt ?? '',
});

interface RawUser {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isAdmin?: boolean;
}
export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  email: u.email ?? '',
  first_name: u.firstName ?? '',
  last_name: u.lastName ?? '',
  is_admin: u.isAdmin ?? false,
});

interface RawMembership {
  id?: string;
  role?: string;
  createdAt?: string;
  user?: RawUser;
}
export const mapMembership = (m: RawMembership) => ({
  id: m.id ?? '',
  role: m.role ?? '',
  created_at: m.createdAt ?? '',
  user: mapUser(m.user ?? {}),
});

interface RawProjectListItem {
  id?: string;
  name?: string;
  hostKind?: string | null;
  status?: string;
  organization?: { name?: string };
  latestSuccessfulTestRun?: {
    createdAt?: string;
    stats?: { totalSessions?: number; totalScreenshots?: number };
  } | null;
}
export const mapProjectListItem = (p: RawProjectListItem) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  organization_name: p.organization?.name ?? '',
  host_kind: p.hostKind ?? null,
  status: p.status ?? '',
  latest_test_run_at: p.latestSuccessfulTestRun?.createdAt ?? null,
  total_sessions: p.latestSuccessfulTestRun?.stats?.totalSessions ?? null,
  total_screenshots: p.latestSuccessfulTestRun?.stats?.totalScreenshots ?? null,
});

interface RawProject {
  id?: string;
  name?: string;
  hostKind?: string | null;
  status?: string;
  organization?: { name?: string };
  recordingToken?: string | null;
  apiToken?: string | null;
  createdAt?: string;
  updatedAt?: string;
  settings?: { enterpriseGradeSecurity?: boolean };
  sessionSelectionConfig?: { autoSessionSelection?: { enabled?: boolean } };
}
export const mapProject = (p: RawProject) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  organization_name: p.organization?.name ?? '',
  host_kind: p.hostKind ?? null,
  status: p.status ?? '',
  recording_token: p.recordingToken ?? null,
  api_token: p.apiToken ?? null,
  created_at: p.createdAt ?? '',
  updated_at: p.updatedAt ?? '',
  enterprise_grade_security: p.settings?.enterpriseGradeSecurity ?? false,
  auto_session_selection: p.sessionSelectionConfig?.autoSessionSelection?.enabled ?? false,
});

interface RawScreenshot {
  filename?: string;
  publicUrl?: string;
  replayId?: string;
  route?: { url?: string; group?: string } | null;
  identifier?: { __typename?: string; type?: string; eventNumber?: number } | null;
}
export const mapScreenshot = (s: RawScreenshot) => ({
  filename: s.filename ?? '',
  public_url: s.publicUrl ?? '',
  replay_id: s.replayId,
  route_url: s.route?.url,
  route_group: s.route?.group,
  identifier_type: s.identifier?.__typename ?? s.identifier?.type,
  event_number: s.identifier?.eventNumber,
});

interface RawDiffResult {
  outcome?: string;
  userVisibleOutcome?: string;
  groupId?: string | null;
  width?: number | null;
  mismatchPixels?: number | null;
  diffHash?: string | null;
  changedSectionsClassNames?: string[];
  baseReplayScreenshot?: RawScreenshot | null;
  headReplayScreenshot?: RawScreenshot | null;
  diffScreenshot?: { publicUrlThumb?: string; publicUrlFull?: string } | null;
}
export const mapDiffResult = (d: RawDiffResult) => ({
  outcome: d.outcome ?? '',
  user_visible_outcome: d.userVisibleOutcome ?? '',
  group_id: d.groupId ?? null,
  width: d.width ?? null,
  mismatch_pixels: d.mismatchPixels ?? null,
  diff_hash: d.diffHash ?? null,
  base_screenshot: d.baseReplayScreenshot ? mapScreenshot(d.baseReplayScreenshot) : null,
  head_screenshot: d.headReplayScreenshot ? mapScreenshot(d.headReplayScreenshot) : null,
  diff_url_thumb: d.diffScreenshot?.publicUrlThumb ?? null,
  diff_url_full: d.diffScreenshot?.publicUrlFull ?? null,
  changed_class_names: d.changedSectionsClassNames ?? [],
});

interface RawReplayInfo {
  id?: string;
  status?: string | null;
  isAccurate?: boolean | null;
  parameters?: { appUrl?: string } | null;
}
export const mapReplayInfo = (r: RawReplayInfo) => ({
  id: r.id ?? '',
  status: r.status ?? null,
  is_accurate: r.isAccurate ?? null,
  app_url: r.parameters?.appUrl ?? null,
});

interface RawTestRunStats {
  totalScreenshots?: number;
  totalSessions?: number;
  totalSessionsReplayed?: number;
  sessionsSkipped?: number;
  screenshotsSkipped?: number;
}

interface RawTestRun {
  id?: string;
  status?: string;
  commitSha?: string | null;
  createdAt?: string;
  updatedAt?: string;
  project?: { name?: string; organization?: { name?: string } };
  stats?: RawTestRunStats | null;
  configData?: { environment?: { ci?: string; context?: Record<string, unknown> } };
  pullRequest?: { approvalState?: string; id?: string } | null;
  describeTested?: string | null;
}
export const mapTestRun = (t: RawTestRun) => {
  const ctx = t.configData?.environment?.context as Record<string, unknown> | undefined;
  return {
    id: t.id ?? '',
    status: t.status ?? '',
    commit_sha: t.commitSha ?? null,
    created_at: t.createdAt ?? '',
    updated_at: t.updatedAt ?? '',
    project_name: t.project?.name ?? '',
    organization_name: t.project?.organization?.name ?? '',
    stats: t.stats
      ? {
          total_screenshots: t.stats.totalScreenshots ?? 0,
          total_sessions: t.stats.totalSessions ?? 0,
          total_sessions_replayed: t.stats.totalSessionsReplayed ?? null,
          sessions_skipped: t.stats.sessionsSkipped ?? null,
          screenshots_skipped: t.stats.screenshotsSkipped ?? null,
        }
      : null,
    ci_provider: (t.configData?.environment?.ci as string) ?? null,
    pr_title: (ctx?.title as string) ?? null,
    pr_number: (ctx?.number as number) ?? null,
    pr_url: ((ctx?.htmlUrl ?? ctx?.webUrl) as string) ?? null,
    approval_state: t.pullRequest?.approvalState ?? null,
    describe_tested: t.describeTested ?? null,
  };
};

interface RawReplay {
  id?: string;
  status?: string;
  commitSha?: string | null;
  isAccurate?: boolean | null;
  createdAt?: string;
  parameters?: { appUrl?: string; originalAppUrl?: string } | null;
  session?: { id?: string } | null;
  project?: { name?: string; organization?: { name?: string } } | null;
}
export const mapReplay = (r: RawReplay) => ({
  id: r.id ?? '',
  status: r.status ?? '',
  commit_sha: r.commitSha ?? null,
  is_accurate: r.isAccurate ?? null,
  app_url: r.parameters?.appUrl ?? null,
  session_id: r.session?.id ?? null,
  created_at: r.createdAt ?? '',
  project_name: r.project?.name ?? null,
  organization_name: r.project?.organization?.name ?? null,
});

interface RawSession {
  id?: string;
  project?: { id?: string; name?: string };
  hostname?: string | null;
  datetime?: string | null;
  numberUserEvents?: number | null;
  numberBytes?: number | null;
  source?: string | null;
  startUrl?: string | null;
  abandoned?: boolean | null;
  description?: string | null;
}
export const mapSession = (s: RawSession) => ({
  id: s.id ?? '',
  project_id: s.project?.id ?? '',
  project_name: s.project?.name ?? '',
  hostname: s.hostname ?? null,
  datetime: s.datetime ?? null,
  num_user_events: s.numberUserEvents ?? null,
  num_bytes: s.numberBytes ?? null,
  source: s.source ?? null,
  start_url: s.startUrl ?? null,
  abandoned: s.abandoned ?? null,
  description: s.description ?? null,
});

interface RawSessionEvent {
  type?: string;
  timestamp?: number | null;
  selector?: string | null;
  clientX?: number | null;
  clientY?: number | null;
}
export const mapSessionEvent = (e: RawSessionEvent) => ({
  type: e.type ?? '',
  timestamp: e.timestamp ?? null,
  selector: e.selector ?? null,
  client_x: e.clientX ?? null,
  client_y: e.clientY ?? null,
});

interface RawPullRequest {
  id?: string;
  approvalState?: string | null;
  latestTestRunId?: string | null;
  createdAt?: string;
}
export const mapPullRequest = (p: RawPullRequest) => ({
  id: p.id ?? '',
  approval_state: p.approvalState ?? null,
  latest_test_run_id: p.latestTestRunId ?? null,
  created_at: p.createdAt ?? '',
});

interface RawGithubRepo {
  id?: string;
  name?: string;
  owner?: string;
  url?: string;
  fullName?: string;
}
export const mapGithubRepo = (r: RawGithubRepo) => ({
  id: r.id ?? '',
  name: r.name ?? '',
  owner: r.owner ?? '',
  url: r.url ?? '',
  full_name: r.fullName ?? '',
});

interface RawLabelAction {
  id?: string;
  replayDiffId?: string;
  screenshotFileName?: string;
  label?: string;
  createdAt?: string;
}
export const mapLabelAction = (l: RawLabelAction) => ({
  id: l.id ?? '',
  replay_diff_id: l.replayDiffId ?? '',
  screenshot_file_name: l.screenshotFileName ?? '',
  label: l.label ?? '',
  created_at: l.createdAt ?? '',
});

interface RawCoverage {
  route?: { group?: string; url?: string } | null;
  variants?: Array<{ screenshots?: RawScreenshot[] }>;
}
export const mapCoverage = (c: RawCoverage) => ({
  route_group: c.route?.group ?? null,
  route_url: c.route?.url ?? null,
  screenshots: (c.variants ?? []).flatMap(v => (v.screenshots ?? []).map(mapScreenshot)),
});
