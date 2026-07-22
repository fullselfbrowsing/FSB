/**
 * Provider processes inherit the daemon environment except for the exact
 * source-reviewed credential/discovery roster below. Policies are immutable
 * data so detection, probes, and supervised spawns can share one boundary.
 */

export type InheritedEnvironmentRule = 'allow_unlisted';

export interface AgentEnvironmentPolicy {
  readonly inheritedAllowRules: readonly InheritedEnvironmentRule[];
  readonly strippedKeys: readonly string[];
  readonly forcedValues: Readonly<Record<string, string>>;
}

export type SanitizedAgentEnvironment = NodeJS.ProcessEnv;

const ENVIRONMENT_KEY_PATTERN = /^[A-Za-z0-9_]+$/;
const sanitizedEnvironments = new WeakSet<object>();

type OwnDataRecord = Readonly<Record<string, unknown>>;

function invalidEnvironmentContract(): never {
  throw new TypeError('Invalid agent environment contract');
}

function ownDataRecord(value: unknown): OwnDataRecord {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) invalidEnvironmentContract();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) invalidEnvironmentContract();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalidEnvironmentContract();
    }
  }
  return value as OwnDataRecord;
}

function ownValue(record: OwnDataRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalidEnvironmentContract();
  return descriptor.value;
}

function denseStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalidEnvironmentContract();
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) invalidEnvironmentContract();
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalidEnvironmentContract();
    }
    if (typeof descriptor.value !== 'string' || !ENVIRONMENT_KEY_PATTERN.test(descriptor.value)) {
      invalidEnvironmentContract();
    }
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

function cloneStringRecord(value: unknown): Readonly<Record<string, string>> {
  const record = ownDataRecord(value);
  const result: Record<string, string> = {};
  for (const key of Reflect.ownKeys(record) as string[]) {
    const item = ownValue(record, key);
    if (!ENVIRONMENT_KEY_PATTERN.test(key) || typeof item !== 'string' || item.includes('\0')) {
      invalidEnvironmentContract();
    }
    Object.defineProperty(result, key, {
      value: item,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(result);
}

/** Validate, clone, and recursively freeze an exact environment policy. */
export function freezeAgentEnvironmentPolicy(value: unknown): AgentEnvironmentPolicy {
  const record = ownDataRecord(value);
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== 3
    || !keys.includes('inheritedAllowRules')
    || !keys.includes('strippedKeys')
    || !keys.includes('forcedValues')
  ) invalidEnvironmentContract();

  const rules = denseStringArray(ownValue(record, 'inheritedAllowRules'));
  if (rules.length !== 1 || rules[0] !== 'allow_unlisted') invalidEnvironmentContract();
  const strippedKeys = denseStringArray(ownValue(record, 'strippedKeys'));
  if (new Set(strippedKeys).size !== strippedKeys.length) invalidEnvironmentContract();
  const forcedValues = cloneStringRecord(ownValue(record, 'forcedValues'));

  return Object.freeze({
    inheritedAllowRules: rules as readonly InheritedEnvironmentRule[],
    strippedKeys,
    forcedValues,
  });
}

function copyEnvironment(
  value: unknown,
  allowUndefined: boolean,
): Readonly<Record<string, string>> {
  const record = ownDataRecord(value);
  const result: Record<string, string> = {};
  for (const key of Reflect.ownKeys(record) as string[]) {
    const item = ownValue(record, key);
    if (!ENVIRONMENT_KEY_PATTERN.test(key)) invalidEnvironmentContract();
    if (item === undefined && allowUndefined) continue;
    if (typeof item !== 'string' || item.includes('\0')) invalidEnvironmentContract();
    result[key] = item;
  }
  return result;
}

/**
 * Build a fresh environment in the only permitted order: inherit, strip,
 * reject fixed-value restoration, apply fixed values, then apply policy-owned
 * forced values. Raw values never enter error text.
 */
export function buildSanitizedAgentEnvironment(
  sourceEnv: NodeJS.ProcessEnv,
  fixedEnv: Readonly<Record<string, string>>,
  policy: AgentEnvironmentPolicy,
): SanitizedAgentEnvironment {
  const exactPolicy = freezeAgentEnvironmentPolicy(policy);
  const inherited = copyEnvironment(sourceEnv, true);
  const fixed = copyEnvironment(fixedEnv, false);
  const stripped = new Set(exactPolicy.strippedKeys);
  for (const key of Object.keys(fixed)) {
    if (stripped.has(key)) invalidEnvironmentContract();
  }

  const result: NodeJS.ProcessEnv = { ...inherited };
  for (const key of stripped) delete result[key];
  for (const [key, value] of Object.entries(fixed)) result[key] = value;
  for (const [key, value] of Object.entries(exactPolicy.forcedValues)) result[key] = value;
  sanitizedEnvironments.add(result);
  return result;
}

export function isSanitizedAgentEnvironment(value: unknown): value is SanitizedAgentEnvironment {
  return !!value && typeof value === 'object' && sanitizedEnvironments.has(value);
}

// Source-pinned provider credential/discovery boundary for OpenCode v1.14.25,
// tag commit 3c85719fea0ee83389c814d7abbf1f98c5c6f0f1. The base roster is the
// provider `env` metadata in packages/opencode/test/tool/fixtures/models-api.json;
// the additions are custom-provider reads in src/provider/provider.ts plus the
// AWS/Google credential chains they invoke. HOME and XDG data/state/cache roots
// stay available so the native OpenCode sign-in remains usable.
export const DELEGATION_PROVIDER_KEY_NAMES = Object.freeze([
  '302AI_API_KEY',
  'ABACUS_API_KEY',
  'AICORE_DEPLOYMENT_ID',
  'AICORE_RESOURCE_GROUP',
  'AICORE_SERVICE_KEY',
  'AIHUBMIX_API_KEY',
  'AI_GATEWAY_API_KEY',
  'ALIBABA_CODING_PLAN_API_KEY',
  'ANTHROPIC_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_CONFIG_FILE',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_DEFAULT_PROFILE',
  'AWS_DEFAULT_REGION',
  'AWS_EC2_METADATA_DISABLED',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT',
  'AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE',
  'AWS_EC2_METADATA_V1_DISABLED',
  'AWS_PROFILE',
  'AWS_REGION',
  'AWS_ROLE_ARN',
  'AWS_ROLE_SESSION_NAME',
  'AWS_SDK_LOAD_CONFIG',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AZURE_API_KEY',
  'AZURE_COGNITIVE_SERVICES_API_KEY',
  'AZURE_COGNITIVE_SERVICES_RESOURCE_NAME',
  'AZURE_OPENAI_API_KEY',
  'AZURE_RESOURCE_NAME',
  'BAILING_API_TOKEN',
  'BASETEN_API_KEY',
  'BERGET_API_KEY',
  'CEREBRAS_API_KEY',
  'CF_AIG_TOKEN',
  'CHUTES_API_KEY',
  'CLARIFAI_PAT',
  'CLOUDFERRO_SHERLOCK_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_GATEWAY_ID',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
  'CODEX_ACCESS_TOKEN',
  'CODEX_API_KEY',
  'CODEX_EXEC_SERVER_NOISE_AUTH_TOKEN',
  'CODEX_EXEC_SERVER_NOISE_CHATGPT_ACCOUNT_ID',
  'CODEX_EXEC_SERVER_NOISE_ENVIRONMENT_ID',
  'CODEX_EXEC_SERVER_NOISE_REGISTRY_URL',
  'CODEX_EXEC_SERVER_URL',
  'COHERE_API_KEY',
  'CORTECS_API_KEY',
  'DASHSCOPE_API_KEY',
  'DEEPINFRA_API_KEY',
  'DEEPSEEK_API_KEY',
  'DINFERENCE_API_KEY',
  'DRUN_API_KEY',
  'EVROC_API_KEY',
  'FASTROUTER_API_KEY',
  'FIREWORKS_API_KEY',
  'FIRMWARE_API_KEY',
  'FRIENDLI_TOKEN',
  'GCE_METADATA_HOST',
  'GCE_METADATA_IP',
  'GCE_METADATA_ROOT',
  'GCLOUD_PROJECT',
  'GCP_PROJECT',
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  'GITLAB_INSTANCE_URL',
  'GITLAB_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_QUOTA_PROJECT',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_VERTEX_LOCATION',
  'GOOGLE_VERTEX_PROJECT',
  'GROQ_API_KEY',
  'HELICONE_API_KEY',
  'HF_TOKEN',
  'IFLOW_API_KEY',
  'INCEPTION_API_KEY',
  'INFERENCE_API_KEY',
  'IOINTELLIGENCE_API_KEY',
  'JIEKOU_API_KEY',
  'KILO_API_KEY',
  'KIMI_API_KEY',
  'KUAE_API_KEY',
  'LLAMA_API_KEY',
  'LLMGATEWAY_API_KEY',
  'LMSTUDIO_API_KEY',
  'LUCIDQUERY_API_KEY',
  'MEGANOVA_API_KEY',
  'MINIMAX_API_KEY',
  'MISTRAL_API_KEY',
  'MOARK_API_KEY',
  'MODELSCOPE_API_KEY',
  'MOONSHOT_API_KEY',
  'MORPH_API_KEY',
  'NANO_GPT_API_KEY',
  'NEBIUS_API_KEY',
  'NOVA_API_KEY',
  'NOVITA_API_KEY',
  'NVIDIA_API_KEY',
  'OLLAMA_API_KEY',
  'OPENAI_API_KEY',
  'OPENCODE_API_KEY',
  'OPENCODE_AUTH_CONTENT',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_CONTENT',
  'OPENCODE_CONFIG_DIR',
  'OPENCODE_MODELS_PATH',
  'OPENCODE_MODELS_URL',
  'OPENROUTER_API_KEY',
  'OVHCLOUD_API_KEY',
  'PERPLEXITY_API_KEY',
  'POE_API_KEY',
  'PRIVATEMODE_API_KEY',
  'PRIVATEMODE_ENDPOINT',
  'QIHANG_API_KEY',
  'QINIU_API_KEY',
  'REQUESTY_API_KEY',
  'SCALEWAY_API_KEY',
  'SILICONFLOW_API_KEY',
  'SILICONFLOW_CN_API_KEY',
  'STACKIT_API_KEY',
  'STEPFUN_API_KEY',
  'SUBMODEL_INSTAGEN_ACCESS_KEY',
  'SYNTHETIC_API_KEY',
  'TENCENT_CODING_PLAN_API_KEY',
  'TOGETHER_API_KEY',
  'UPSTAGE_API_KEY',
  'V0_API_KEY',
  'VENICE_API_KEY',
  'VERTEX_LOCATION',
  'VIVGRID_API_KEY',
  'VULTR_API_KEY',
  'WANDB_API_KEY',
  'XAI_API_KEY',
  'XIAOMI_API_KEY',
  'ZENMUX_API_KEY',
  'ZHIPU_API_KEY',
] as const);

export const DELEGATION_AGENT_ENVIRONMENT_POLICY = freezeAgentEnvironmentPolicy({
  inheritedAllowRules: ['allow_unlisted'],
  strippedKeys: [...DELEGATION_PROVIDER_KEY_NAMES, 'OPENCODE_SERVER_PASSWORD'],
  forcedValues: {
    CODEX_EXEC_SERVER_URL: 'none',
  },
});
