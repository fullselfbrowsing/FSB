import { z } from 'zod';

// --- Account ---

export const accountInfoSchema = z.object({
  account_id: z.string().describe('AWS account ID (12-digit number)'),
  username: z.string().describe('IAM username or root account email'),
  arn: z.string().describe('User ARN from aws-userInfo cookie'),
  session_arn: z.string().describe('Session ARN from console session'),
  region: z.string().describe('Current console region (e.g., us-east-2)'),
  signin_type: z.string().describe('Sign-in type (PUBLIC for root, ROLE for IAM role, etc.)'),
});

// --- Region ---

export const regionSchema = z.object({
  id: z.string().describe('Region identifier (e.g., us-east-1)'),
  name: z.string().describe('Geographic area name (e.g., United States)'),
  location: z.string().describe('City/location (e.g., N. Virginia)'),
  opt_in: z.boolean().describe('Whether the region requires opt-in'),
});

interface RawRegion {
  id?: string;
  name?: string;
  location?: string;
  optIn?: boolean;
}

export const mapRegion = (r: RawRegion) => ({
  id: r.id ?? '',
  name: r.name ?? '',
  location: r.location ?? '',
  opt_in: r.optIn ?? false,
});

// --- EC2 Instance ---

export const instanceSchema = z.object({
  instance_id: z.string().describe('EC2 instance ID (e.g., i-1234567890abcdef0)'),
  instance_type: z.string().describe('Instance type (e.g., t2.micro)'),
  state: z.string().describe('Instance state (running, stopped, pending, etc.)'),
  public_ip: z.string().describe('Public IPv4 address (empty if none)'),
  private_ip: z.string().describe('Private IPv4 address'),
  vpc_id: z.string().describe('VPC ID'),
  subnet_id: z.string().describe('Subnet ID'),
  launch_time: z.string().describe('Launch time (ISO 8601)'),
  name: z.string().describe('Name tag value (empty if no Name tag)'),
  key_name: z.string().describe('Key pair name (empty if none)'),
  availability_zone: z.string().describe('Availability zone (e.g., us-east-2a)'),
  architecture: z.string().describe('Architecture (x86_64, arm64)'),
  platform: z.string().describe('Platform (linux, windows)'),
});

export interface RawInstance {
  instanceId?: string;
  instanceType?: string;
  instanceState?: { name?: string };
  publicIpAddress?: string;
  privateIpAddress?: string;
  vpcId?: string;
  subnetId?: string;
  launchTime?: string;
  tagSet?: { item?: RawTag[] | RawTag };
  keyName?: string;
  placement?: { availabilityZone?: string };
  architecture?: string;
  platform?: string;
  platformDetails?: string;
}

interface RawTag {
  key?: string;
  value?: string;
}

const extractName = (tagSet?: { item?: RawTag[] | RawTag }): string => {
  const items = Array.isArray(tagSet?.item) ? tagSet.item : tagSet?.item ? [tagSet.item] : [];
  const nameTag = items.find(t => t.key === 'Name');
  return nameTag?.value ?? '';
};

export const mapInstance = (i: RawInstance) => ({
  instance_id: i.instanceId ?? '',
  instance_type: i.instanceType ?? '',
  state: i.instanceState?.name ?? '',
  public_ip: i.publicIpAddress ?? '',
  private_ip: i.privateIpAddress ?? '',
  vpc_id: i.vpcId ?? '',
  subnet_id: i.subnetId ?? '',
  launch_time: i.launchTime ?? '',
  name: extractName(i.tagSet),
  key_name: i.keyName ?? '',
  availability_zone: i.placement?.availabilityZone ?? '',
  architecture: i.architecture ?? '',
  platform: i.platform ?? i.platformDetails ?? 'linux',
});

// --- Security Group ---

export const securityGroupSchema = z.object({
  group_id: z.string().describe('Security group ID (e.g., sg-12345)'),
  group_name: z.string().describe('Security group name'),
  description: z.string().describe('Description'),
  vpc_id: z.string().describe('VPC ID'),
});

export interface RawSecurityGroup {
  groupId?: string;
  groupName?: string;
  groupDescription?: string;
  vpcId?: string;
}

export const mapSecurityGroup = (sg: RawSecurityGroup) => ({
  group_id: sg.groupId ?? '',
  group_name: sg.groupName ?? '',
  description: sg.groupDescription ?? '',
  vpc_id: sg.vpcId ?? '',
});

// --- VPC ---

export const vpcSchema = z.object({
  vpc_id: z.string().describe('VPC ID (e.g., vpc-12345)'),
  cidr_block: z.string().describe('IPv4 CIDR block'),
  state: z.string().describe('VPC state (available, pending)'),
  is_default: z.boolean().describe('Whether this is the default VPC'),
  name: z.string().describe('Name tag value (empty if no Name tag)'),
});

export interface RawVpc {
  vpcId?: string;
  cidrBlock?: string;
  state?: string;
  isDefault?: string;
  tagSet?: { item?: RawTag[] | RawTag };
}

export const mapVpc = (v: RawVpc) => ({
  vpc_id: v.vpcId ?? '',
  cidr_block: v.cidrBlock ?? '',
  state: v.state ?? '',
  is_default: v.isDefault === 'true',
  name: extractName(v.tagSet),
});

// --- Subnet ---

export const subnetSchema = z.object({
  subnet_id: z.string().describe('Subnet ID (e.g., subnet-12345)'),
  vpc_id: z.string().describe('VPC ID this subnet belongs to'),
  cidr_block: z.string().describe('IPv4 CIDR block'),
  availability_zone: z.string().describe('Availability zone (e.g., us-east-2a)'),
  available_ips: z.number().describe('Number of available IPv4 addresses'),
  name: z.string().describe('Name tag value (empty if no Name tag)'),
  state: z.string().describe('Subnet state (available, pending)'),
  is_default: z.boolean().describe('Whether this is the default subnet for the AZ'),
});

export interface RawSubnet {
  subnetId?: string;
  vpcId?: string;
  cidrBlock?: string;
  availabilityZone?: string;
  availableIpAddressCount?: string;
  tagSet?: { item?: RawTag[] | RawTag };
  state?: string;
  defaultForAz?: string;
}

export const mapSubnet = (s: RawSubnet) => ({
  subnet_id: s.subnetId ?? '',
  vpc_id: s.vpcId ?? '',
  cidr_block: s.cidrBlock ?? '',
  availability_zone: s.availabilityZone ?? '',
  available_ips: Number(s.availableIpAddressCount ?? 0),
  name: extractName(s.tagSet),
  state: s.state ?? '',
  is_default: s.defaultForAz === 'true',
});

// --- Lambda Function ---

export const lambdaFunctionSchema = z.object({
  function_name: z.string().describe('Function name'),
  function_arn: z.string().describe('Function ARN'),
  runtime: z.string().describe('Runtime (e.g., nodejs20.x, python3.12)'),
  handler: z.string().describe('Handler function (e.g., index.handler)'),
  code_size: z.number().describe('Code size in bytes'),
  memory_size: z.number().describe('Memory allocated in MB'),
  timeout: z.number().describe('Timeout in seconds'),
  last_modified: z.string().describe('Last modified timestamp'),
  state: z.string().describe('Function state (Active, Pending, Inactive, Failed)'),
  description: z.string().describe('Function description'),
});

export interface RawLambdaFunction {
  FunctionName?: string;
  FunctionArn?: string;
  Runtime?: string;
  Handler?: string;
  CodeSize?: number;
  MemorySize?: number;
  Timeout?: number;
  LastModified?: string;
  State?: string;
  Description?: string;
}

export const mapLambdaFunction = (f: RawLambdaFunction) => ({
  function_name: f.FunctionName ?? '',
  function_arn: f.FunctionArn ?? '',
  runtime: f.Runtime ?? '',
  handler: f.Handler ?? '',
  code_size: f.CodeSize ?? 0,
  memory_size: f.MemorySize ?? 0,
  timeout: f.Timeout ?? 0,
  last_modified: f.LastModified ?? '',
  state: f.State ?? '',
  description: f.Description ?? '',
});

// --- IAM User ---

export const iamUserSchema = z.object({
  user_name: z.string().describe('IAM user name'),
  user_id: z.string().describe('Unique user ID'),
  arn: z.string().describe('User ARN'),
  create_date: z.string().describe('Creation date (ISO 8601)'),
  path: z.string().describe('User path'),
});

export interface RawIamUser {
  UserName?: string;
  UserId?: string;
  Arn?: string;
  CreateDate?: string;
  Path?: string;
}

export const mapIamUser = (u: RawIamUser) => ({
  user_name: u.UserName ?? '',
  user_id: u.UserId ?? '',
  arn: u.Arn ?? '',
  create_date: u.CreateDate ?? '',
  path: u.Path ?? '',
});

// --- IAM Role ---

export const iamRoleSchema = z.object({
  role_name: z.string().describe('IAM role name'),
  role_id: z.string().describe('Unique role ID'),
  arn: z.string().describe('Role ARN'),
  create_date: z.string().describe('Creation date (ISO 8601)'),
  path: z.string().describe('Role path'),
  description: z.string().describe('Role description'),
});

export interface RawIamRole {
  RoleName?: string;
  RoleId?: string;
  Arn?: string;
  CreateDate?: string;
  Path?: string;
  Description?: string;
}

export const mapIamRole = (r: RawIamRole) => ({
  role_name: r.RoleName ?? '',
  role_id: r.RoleId ?? '',
  arn: r.Arn ?? '',
  create_date: r.CreateDate ?? '',
  path: r.Path ?? '',
  description: r.Description ?? '',
});

// --- CloudWatch Log Group ---

export const logGroupSchema = z.object({
  log_group_name: z.string().describe('Log group name (e.g., /aws/lambda/my-function)'),
  arn: z.string().describe('Log group ARN'),
  retention_days: z.number().describe('Retention period in days (0 means never expire)'),
  stored_bytes: z.number().describe('Bytes stored in the log group'),
  creation_time: z.string().describe('Creation time as epoch milliseconds string'),
});

export interface RawLogGroup {
  logGroupName?: string;
  arn?: string;
  retentionInDays?: number;
  storedBytes?: number;
  creationTime?: number;
}

export const mapLogGroup = (g: RawLogGroup) => ({
  log_group_name: g.logGroupName ?? '',
  arn: g.arn ?? '',
  retention_days: g.retentionInDays ?? 0,
  stored_bytes: g.storedBytes ?? 0,
  creation_time: String(g.creationTime ?? ''),
});

// --- CloudWatch Alarm ---

export const alarmSchema = z.object({
  alarm_name: z.string().describe('Alarm name'),
  alarm_arn: z.string().describe('Alarm ARN'),
  state_value: z.string().describe('Alarm state (OK, ALARM, INSUFFICIENT_DATA)'),
  metric_name: z.string().describe('CloudWatch metric name'),
  namespace: z.string().describe('Metric namespace'),
  description: z.string().describe('Alarm description'),
});

export interface RawAlarm {
  AlarmName?: string;
  AlarmArn?: string;
  StateValue?: string;
  MetricName?: string;
  Namespace?: string;
  AlarmDescription?: string;
}

export const mapAlarm = (a: RawAlarm) => ({
  alarm_name: a.AlarmName ?? '',
  alarm_arn: a.AlarmArn ?? '',
  state_value: a.StateValue ?? '',
  metric_name: a.MetricName ?? '',
  namespace: a.Namespace ?? '',
  description: a.AlarmDescription ?? '',
});

// --- Helpers ---

/**
 * Normalize AWS XML list items. AWS XML responses wrap lists in various ways:
 * - <instancesSet><item>...</item></instancesSet> (EC2)
 * The parsed XML may produce a single object or an array depending on item count.
 */
export const normalizeList = <T>(items: T | T[] | undefined | null): T[] => {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  return [items];
};

/**
 * Extract EC2 instances from a DescribeInstances response.
 * Handles the nested reservationSet > item > instancesSet > item structure.
 */
export const extractInstances = (data: Record<string, unknown>): RawInstance[] => {
  const reservationSet = data.reservationSet as Record<string, unknown> | undefined;
  const reservations = normalizeList(reservationSet?.item as Record<string, unknown>[]);
  const instances: RawInstance[] = [];
  for (const reservation of reservations) {
    const instancesSet = reservation.instancesSet as Record<string, unknown> | undefined;
    instances.push(...normalizeList(instancesSet?.item as RawInstance[]));
  }
  return instances;
};
