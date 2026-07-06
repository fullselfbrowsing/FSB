import { z } from 'zod';

// --- User / Profile ---

export const userStatusSchema = z.object({
  userId: z.number().describe('Numeric user ID'),
  username: z.string().describe('Username'),
  avatar: z.string().describe('Avatar URL'),
  isSignedIn: z.boolean().describe('Whether the user is signed in'),
  isPremium: z.boolean().describe('Whether the user has a premium subscription'),
  isVerified: z.boolean().describe('Whether the email is verified'),
  checkedInToday: z.boolean().describe('Whether the user checked in today'),
  numUnread: z.number().describe('Number of unread notifications'),
});

export interface RawUserStatus {
  userId?: number;
  username?: string;
  avatar?: string;
  isSignedIn?: boolean;
  isPremium?: boolean;
  isVerified?: boolean;
  checkedInToday?: boolean;
  notificationStatus?: { numUnread?: number };
}

export const mapUserStatus = (u: RawUserStatus) => ({
  userId: u.userId ?? 0,
  username: u.username ?? '',
  avatar: u.avatar ?? '',
  isSignedIn: u.isSignedIn ?? false,
  isPremium: u.isPremium ?? false,
  isVerified: u.isVerified ?? false,
  checkedInToday: u.checkedInToday ?? false,
  numUnread: u.notificationStatus?.numUnread ?? 0,
});

export const userProfileSchema = z.object({
  username: z.string().describe('Username'),
  realName: z.string().describe('Real name'),
  aboutMe: z.string().describe('Bio / about me text'),
  avatar: z.string().describe('Avatar URL'),
  reputation: z.number().describe('Reputation score'),
  ranking: z.number().describe('Global ranking'),
  company: z.string().describe('Company name'),
  school: z.string().describe('School name'),
  countryName: z.string().describe('Country'),
  websites: z.array(z.string()).describe('Website URLs'),
  skillTags: z.array(z.string()).describe('Skill tags'),
});

export interface RawMatchedUser {
  username?: string;
  profile?: {
    realName?: string;
    aboutMe?: string;
    userAvatar?: string;
    reputation?: number;
    ranking?: number;
    company?: string;
    school?: string;
    countryName?: string;
    websites?: string[];
    skillTags?: string[];
  };
}

export const mapUserProfile = (u: RawMatchedUser) => ({
  username: u.username ?? '',
  realName: u.profile?.realName ?? '',
  aboutMe: u.profile?.aboutMe ?? '',
  avatar: u.profile?.userAvatar ?? '',
  reputation: u.profile?.reputation ?? 0,
  ranking: u.profile?.ranking ?? 0,
  company: u.profile?.company ?? '',
  school: u.profile?.school ?? '',
  countryName: u.profile?.countryName ?? '',
  websites: u.profile?.websites ?? [],
  skillTags: u.profile?.skillTags ?? [],
});

// --- Question Progress ---

export const questionProgressSchema = z.object({
  accepted: z
    .array(
      z.object({
        difficulty: z.string().describe('Difficulty level (EASY, MEDIUM, HARD)'),
        count: z.number().describe('Number of accepted questions'),
      }),
    )
    .describe('Accepted questions by difficulty'),
  failed: z
    .array(
      z.object({
        difficulty: z.string().describe('Difficulty level'),
        count: z.number().describe('Number of failed questions'),
      }),
    )
    .describe('Failed questions by difficulty'),
  untouched: z
    .array(
      z.object({
        difficulty: z.string().describe('Difficulty level'),
        count: z.number().describe('Number of untouched questions'),
      }),
    )
    .describe('Untouched questions by difficulty'),
});

interface RawDifficultyCount {
  difficulty?: string;
  count?: number;
}

export interface RawQuestionProgress {
  numAcceptedQuestions?: RawDifficultyCount[];
  numFailedQuestions?: RawDifficultyCount[];
  numUntouchedQuestions?: RawDifficultyCount[];
}

const mapDifficultyCounts = (items?: RawDifficultyCount[]) =>
  (items ?? []).map(i => ({
    difficulty: i.difficulty ?? '',
    count: i.count ?? 0,
  }));

export const mapQuestionProgress = (p: RawQuestionProgress) => ({
  accepted: mapDifficultyCounts(p.numAcceptedQuestions),
  failed: mapDifficultyCounts(p.numFailedQuestions),
  untouched: mapDifficultyCounts(p.numUntouchedQuestions),
});

// --- Topic Tag ---

export const topicTagSchema = z.object({
  name: z.string().describe('Tag name (e.g., "Array", "Dynamic Programming")'),
  slug: z.string().describe('URL-safe slug'),
});

export interface RawTopicTag {
  name?: string;
  slug?: string;
}

export const mapTopicTag = (t: RawTopicTag) => ({
  name: t.name ?? '',
  slug: t.slug ?? '',
});

// --- Question (List Item) ---

export const questionListItemSchema = z.object({
  frontendId: z.string().describe('Problem number as displayed on LeetCode (e.g., "1")'),
  title: z.string().describe('Problem title'),
  titleSlug: z.string().describe('URL slug for the problem'),
  difficulty: z.string().describe('Difficulty: Easy, Medium, or Hard'),
  acRate: z.number().describe('Acceptance rate as a percentage'),
  status: z.string().describe('User status: "ac" (accepted), "notac" (attempted), or "" (not attempted)'),
  isFavor: z.boolean().describe('Whether the user has favorited this problem'),
  paidOnly: z.boolean().describe('Whether this problem requires a premium subscription'),
  hasSolution: z.boolean().describe('Whether an official solution exists'),
  hasVideoSolution: z.boolean().describe('Whether a video solution exists'),
  topicTags: z.array(topicTagSchema).describe('Topic tags'),
});

export interface RawQuestionListItem {
  frontendQuestionId?: string;
  title?: string;
  titleSlug?: string;
  difficulty?: string;
  acRate?: number;
  status?: string | null;
  isFavor?: boolean;
  isPaidOnly?: boolean;
  hasSolution?: boolean;
  hasVideoSolution?: boolean;
  topicTags?: RawTopicTag[];
}

export const mapQuestionListItem = (q: RawQuestionListItem) => ({
  frontendId: q.frontendQuestionId ?? '',
  title: q.title ?? '',
  titleSlug: q.titleSlug ?? '',
  difficulty: q.difficulty ?? '',
  acRate: q.acRate ?? 0,
  status: q.status ?? '',
  isFavor: q.isFavor ?? false,
  paidOnly: q.isPaidOnly ?? false,
  hasSolution: q.hasSolution ?? false,
  hasVideoSolution: q.hasVideoSolution ?? false,
  topicTags: (q.topicTags ?? []).map(mapTopicTag),
});

// --- Question (Detail) ---

export const codeSnippetSchema = z.object({
  lang: z.string().describe('Language display name (e.g., "Python3")'),
  langSlug: z.string().describe('Language slug (e.g., "python3")'),
  code: z.string().describe('Starter code template'),
});

export interface RawCodeSnippet {
  lang?: string;
  langSlug?: string;
  code?: string;
}

export const mapCodeSnippet = (s: RawCodeSnippet) => ({
  lang: s.lang ?? '',
  langSlug: s.langSlug ?? '',
  code: s.code ?? '',
});

export const questionDetailSchema = z.object({
  questionId: z.string().describe('Internal question ID'),
  frontendId: z.string().describe('Problem number as displayed'),
  title: z.string().describe('Problem title'),
  titleSlug: z.string().describe('URL slug'),
  content: z.string().describe('Problem description in HTML'),
  difficulty: z.string().describe('Difficulty: Easy, Medium, or Hard'),
  likes: z.number().describe('Number of likes'),
  dislikes: z.number().describe('Number of dislikes'),
  isLiked: z.boolean().describe('Whether the current user liked this problem'),
  isPaidOnly: z.boolean().describe('Whether this requires premium'),
  categoryTitle: z.string().describe('Category (e.g., "Algorithms")'),
  acRate: z.number().describe('Acceptance rate percentage'),
  status: z.string().describe('User status: "ac", "notac", or ""'),
  topicTags: z.array(topicTagSchema).describe('Topic tags'),
  hints: z.array(z.string()).describe('Hints for solving'),
  similarQuestions: z.string().describe('JSON string of similar questions'),
  exampleTestcases: z.string().describe('Example test cases (newline-separated)'),
  sampleTestCase: z.string().describe('Sample test case input'),
  codeSnippets: z.array(codeSnippetSchema).describe('Starter code for each language'),
});

export interface RawQuestionDetail {
  questionId?: string;
  questionFrontendId?: string;
  title?: string;
  titleSlug?: string;
  content?: string;
  difficulty?: string;
  likes?: number;
  dislikes?: number;
  isLiked?: boolean | null;
  isPaidOnly?: boolean;
  categoryTitle?: string;
  acRate?: number;
  status?: string | null;
  topicTags?: RawTopicTag[];
  hints?: string[];
  similarQuestions?: string;
  exampleTestcases?: string;
  sampleTestCase?: string;
  codeSnippets?: RawCodeSnippet[];
}

export const mapQuestionDetail = (q: RawQuestionDetail) => ({
  questionId: q.questionId ?? '',
  frontendId: q.questionFrontendId ?? '',
  title: q.title ?? '',
  titleSlug: q.titleSlug ?? '',
  content: q.content ?? '',
  difficulty: q.difficulty ?? '',
  likes: q.likes ?? 0,
  dislikes: q.dislikes ?? 0,
  isLiked: q.isLiked ?? false,
  isPaidOnly: q.isPaidOnly ?? false,
  categoryTitle: q.categoryTitle ?? '',
  acRate: q.acRate ?? 0,
  status: q.status ?? '',
  topicTags: (q.topicTags ?? []).map(mapTopicTag),
  hints: q.hints ?? [],
  similarQuestions: q.similarQuestions ?? '[]',
  exampleTestcases: q.exampleTestcases ?? '',
  sampleTestCase: q.sampleTestCase ?? '',
  codeSnippets: (q.codeSnippets ?? []).map(mapCodeSnippet),
});

// --- Submission ---

export const submissionSchema = z.object({
  id: z.string().describe('Submission ID'),
  title: z.string().describe('Problem title'),
  titleSlug: z.string().describe('Problem slug'),
  statusDisplay: z.string().describe('Status (e.g., "Accepted", "Wrong Answer")'),
  lang: z.string().describe('Language used'),
  runtime: z.string().describe('Runtime (e.g., "13 ms")'),
  memory: z.string().describe('Memory usage (e.g., "42.3 MB")'),
  timestamp: z.string().describe('Unix timestamp of submission'),
  url: z.string().describe('Submission URL path'),
});

export interface RawSubmission {
  id?: string;
  title?: string;
  titleSlug?: string;
  statusDisplay?: string;
  lang?: string;
  runtime?: string;
  memory?: string;
  timestamp?: string;
  url?: string;
}

export const mapSubmission = (s: RawSubmission) => ({
  id: s.id ?? '',
  title: s.title ?? '',
  titleSlug: s.titleSlug ?? '',
  statusDisplay: s.statusDisplay ?? '',
  lang: s.lang ?? '',
  runtime: s.runtime ?? '',
  memory: s.memory ?? '',
  timestamp: s.timestamp ?? '',
  url: s.url ?? '',
});

// --- Submission Detail ---

export const submissionDetailSchema = z.object({
  runtime: z.number().describe('Runtime in milliseconds'),
  runtimeDisplay: z.string().describe('Display runtime (e.g., "13 ms")'),
  runtimePercentile: z.number().describe('Runtime percentile (0-100)'),
  memory: z.number().describe('Memory in bytes'),
  memoryDisplay: z.string().describe('Display memory (e.g., "42.3 MB")'),
  memoryPercentile: z.number().describe('Memory percentile (0-100)'),
  code: z.string().describe('Submitted source code'),
  timestamp: z.number().describe('Unix timestamp'),
  statusCode: z.number().describe('Status code (10 = Accepted)'),
  lang: z.string().describe('Language name'),
  questionTitle: z.string().describe('Problem title'),
  questionTitleSlug: z.string().describe('Problem slug'),
  notes: z.string().describe('User notes on the submission'),
  topicTags: z.array(topicTagSchema).describe('Topic tags'),
  runtimeError: z.string().describe('Runtime error message if any'),
  compileError: z.string().describe('Compile error message if any'),
});

export interface RawSubmissionDetail {
  runtime?: number;
  runtimeDisplay?: string;
  runtimePercentile?: number;
  memory?: number;
  memoryDisplay?: string;
  memoryPercentile?: number;
  code?: string;
  timestamp?: number;
  statusCode?: number;
  lang?: { name?: string };
  question?: { title?: string; titleSlug?: string };
  notes?: string;
  topicTags?: Array<{ slug?: string; name?: string }>;
  runtimeError?: string;
  compileError?: string;
}

export const mapSubmissionDetail = (s: RawSubmissionDetail) => ({
  runtime: s.runtime ?? 0,
  runtimeDisplay: s.runtimeDisplay ?? '',
  runtimePercentile: s.runtimePercentile ?? 0,
  memory: s.memory ?? 0,
  memoryDisplay: s.memoryDisplay ?? '',
  memoryPercentile: s.memoryPercentile ?? 0,
  code: s.code ?? '',
  timestamp: s.timestamp ?? 0,
  statusCode: s.statusCode ?? 0,
  lang: s.lang?.name ?? '',
  questionTitle: s.question?.title ?? '',
  questionTitleSlug: s.question?.titleSlug ?? '',
  notes: s.notes ?? '',
  topicTags: (s.topicTags ?? []).map(mapTopicTag),
  runtimeError: s.runtimeError ?? '',
  compileError: s.compileError ?? '',
});

// --- Recent AC Submission ---

export const recentSubmissionSchema = z.object({
  id: z.string().describe('Submission ID'),
  title: z.string().describe('Problem title'),
  titleSlug: z.string().describe('Problem slug'),
  timestamp: z.string().describe('Unix timestamp'),
  statusDisplay: z.string().describe('Status display (e.g., "Accepted")'),
  lang: z.string().describe('Language used'),
});

export interface RawRecentSubmission {
  id?: string;
  title?: string;
  titleSlug?: string;
  timestamp?: string;
  statusDisplay?: string;
  lang?: string;
}

export const mapRecentSubmission = (s: RawRecentSubmission) => ({
  id: s.id ?? '',
  title: s.title ?? '',
  titleSlug: s.titleSlug ?? '',
  timestamp: s.timestamp ?? '',
  statusDisplay: s.statusDisplay ?? '',
  lang: s.lang ?? '',
});

// --- Daily Challenge ---

export const dailyChallengeSchema = z.object({
  date: z.string().describe('Challenge date (YYYY-MM-DD)'),
  link: z.string().describe('Link to the problem'),
  question: questionListItemSchema,
});

export interface RawDailyChallenge {
  date?: string;
  link?: string;
  question?: RawQuestionListItem;
}

export const mapDailyChallenge = (d: RawDailyChallenge) => ({
  date: d.date ?? '',
  link: d.link ?? '',
  question: mapQuestionListItem(d.question ?? {}),
});

// --- Calendar / Streak ---

export const calendarSchema = z.object({
  activeYears: z.array(z.number()).describe('Years with activity'),
  streak: z.number().describe('Current streak in days'),
  totalActiveDays: z.number().describe('Total active days'),
  submissionCalendar: z.string().describe('JSON string mapping timestamps to submission counts'),
});

export interface RawCalendar {
  activeYears?: number[];
  streak?: number;
  totalActiveDays?: number;
  submissionCalendar?: string;
}

export const mapCalendar = (c: RawCalendar) => ({
  activeYears: c.activeYears ?? [],
  streak: c.streak ?? 0,
  totalActiveDays: c.totalActiveDays ?? 0,
  submissionCalendar: c.submissionCalendar ?? '{}',
});

// --- Contest Ranking ---

export const contestRankingSchema = z.object({
  attendedContestsCount: z.number().describe('Number of contests attended'),
  rating: z.number().describe('Contest rating'),
  globalRanking: z.number().describe('Global contest ranking'),
  totalParticipants: z.number().describe('Total contest participants'),
  topPercentage: z.number().describe('Top percentage ranking'),
});

export interface RawContestRanking {
  attendedContestsCount?: number;
  rating?: number;
  globalRanking?: number;
  totalParticipants?: number;
  topPercentage?: number;
}

export const mapContestRanking = (r: RawContestRanking) => ({
  attendedContestsCount: r.attendedContestsCount ?? 0,
  rating: r.rating ?? 0,
  globalRanking: r.globalRanking ?? 0,
  totalParticipants: r.totalParticipants ?? 0,
  topPercentage: r.topPercentage ?? 0,
});

// --- Discussion ---

export const discussionSchema = z.object({
  id: z.number().describe('Discussion topic ID'),
  title: z.string().describe('Topic title'),
  viewCount: z.number().describe('Number of views'),
  voteCount: z.number().describe('Number of votes on the post'),
  creationDate: z.string().describe('Creation date as Unix timestamp string'),
  tags: z.array(topicTagSchema).describe('Tags on the topic'),
});

export interface RawDiscussion {
  id?: number;
  title?: string;
  viewCount?: number;
  post?: { voteCount?: number; creationDate?: string };
  tags?: RawTopicTag[];
}

export const mapDiscussion = (d: RawDiscussion) => ({
  id: d.id ?? 0,
  title: d.title ?? '',
  viewCount: d.viewCount ?? 0,
  voteCount: d.post?.voteCount ?? 0,
  creationDate: d.post?.creationDate ?? '',
  tags: (d.tags ?? []).map(mapTopicTag),
});

// --- Run Code Result ---

export const runCodeResultSchema = z.object({
  state: z.string().describe('Execution state: SUCCESS or FAILURE'),
  statusCode: z.number().describe('Status code (10 = Accepted)'),
  statusMsg: z.string().describe('Status message (e.g., "Accepted", "Wrong Answer")'),
  statusRuntime: z.string().describe('Runtime display (e.g., "0 ms")'),
  statusMemory: z.string().describe('Memory display (e.g., "19.2 MB")'),
  codeAnswer: z.array(z.string()).describe('Output from the submitted code'),
  expectedCodeAnswer: z.array(z.string()).describe('Expected output'),
  correctAnswer: z.boolean().describe('Whether the answer matches expected output'),
  totalCorrect: z.number().describe('Number of correct test cases'),
  totalTestcases: z.number().describe('Total number of test cases'),
  runtimeError: z.string().describe('Runtime error message if any'),
  compileError: z.string().describe('Compile error message if any'),
});

export interface RawRunCodeResult {
  state?: string;
  status_code?: number;
  status_msg?: string;
  status_runtime?: string;
  status_memory?: string;
  code_answer?: string[];
  expected_code_answer?: string[];
  correct_answer?: boolean;
  total_correct?: number;
  total_testcases?: number;
  runtime_error?: string;
  compile_error?: string;
  full_runtime_error?: string;
  full_compile_error?: string;
}

export const mapRunCodeResult = (r: RawRunCodeResult) => ({
  state: r.state ?? '',
  statusCode: r.status_code ?? 0,
  statusMsg: r.status_msg ?? '',
  statusRuntime: r.status_runtime ?? '',
  statusMemory: r.status_memory ?? '',
  codeAnswer: r.code_answer ?? [],
  expectedCodeAnswer: r.expected_code_answer ?? [],
  correctAnswer: r.correct_answer ?? false,
  totalCorrect: r.total_correct ?? 0,
  totalTestcases: r.total_testcases ?? 0,
  runtimeError: r.full_runtime_error ?? r.runtime_error ?? '',
  compileError: r.full_compile_error ?? r.compile_error ?? '',
});

// --- Submit Result ---

export const submitResultSchema = z.object({
  state: z.string().describe('Execution state: SUCCESS or FAILURE'),
  statusCode: z.number().describe('Status code (10 = Accepted)'),
  statusMsg: z.string().describe('Status message'),
  statusRuntime: z.string().describe('Runtime display'),
  statusMemory: z.string().describe('Memory display'),
  totalCorrect: z.number().describe('Number of correct test cases'),
  totalTestcases: z.number().describe('Total test cases'),
  runtimePercentile: z.number().describe('Runtime percentile (0-100)'),
  memoryPercentile: z.number().describe('Memory percentile (0-100)'),
  submissionId: z.string().describe('Submission ID for the result'),
  runtimeError: z.string().describe('Runtime error if any'),
  compileError: z.string().describe('Compile error if any'),
  lastTestcase: z.string().describe('Last failing test case if any'),
});

export interface RawSubmitResult {
  state?: string;
  status_code?: number;
  status_msg?: string;
  status_runtime?: string;
  status_memory?: string;
  total_correct?: number;
  total_testcases?: number;
  runtime_percentile?: number;
  memory_percentile?: number;
  submission_id?: string;
  runtime_error?: string;
  compile_error?: string;
  full_runtime_error?: string;
  full_compile_error?: string;
  last_testcase?: string;
}

export const mapSubmitResult = (r: RawSubmitResult) => ({
  state: r.state ?? '',
  statusCode: r.status_code ?? 0,
  statusMsg: r.status_msg ?? '',
  statusRuntime: r.status_runtime ?? '',
  statusMemory: r.status_memory ?? '',
  totalCorrect: r.total_correct ?? 0,
  totalTestcases: r.total_testcases ?? 0,
  runtimePercentile: r.runtime_percentile ?? 0,
  memoryPercentile: r.memory_percentile ?? 0,
  submissionId: String(r.submission_id ?? ''),
  runtimeError: r.full_runtime_error ?? r.runtime_error ?? '',
  compileError: r.full_compile_error ?? r.compile_error ?? '',
  lastTestcase: r.last_testcase ?? '',
});
