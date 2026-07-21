// FSB v0.9.90 - Modern Dashboard Control Panel Script

// Default settings
const defaultSettings = {
  providerKind: 'api',
  agentProviderId: '',
  modelProvider: 'xai',
  modelName: 'grok-4-1-fast',
  apiKey: '',
  geminiApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  customApiKey: '',
  customEndpoint: '',
  openrouterApiKey: '',
  lmstudioBaseUrl: 'http://localhost:1234',
  speedMode: 'normal', // Legacy support
  maxIterations: 100,
  debugMode: false,
  // DOM Optimization settings
  domOptimization: true,
  maxDOMElements: 2000,
  elementCacheSize: 200,
  prioritizeViewport: true,
  animatedActionHighlights: true,
  showSidepanelProgress: true,
  // Credential Manager (Beta)
  enableLogin: false,
  // CAPTCHA Solver
  captchaSolverEnabled: false,
  captchaApiKey: '',
  // Speech-to-Text provider ('browser' | 'whisper'); read by ui/speech-to-text.js
  sttProvider: 'browser',
  autoRefineSiteMaps: true,
  // Phase 241 D-05 / POOL-05: max simultaneous agents (range 1-64, fallback 8).
  fsbAgentCap: 8,
  // Max simultaneous trigger watches (range 1-64, default 8).
  fsbTriggerCap: 8,
  // Phase 245 D-07: global toggle for action change_report emission. When
  // false, the dispatcher skips harvest instrumentation entirely (zero
  // overhead) and action tool responses revert to pre-Phase-245 shape.
  fsbChangeReportsEnabled: true
};

let fsbRecommendedAgentCap = defaultSettings.fsbAgentCap;

function getAgentCapRecommendationModule() {
  return (typeof globalThis !== 'undefined' && globalThis.FsbAgentCapRecommendation)
    ? globalThis.FsbAgentCapRecommendation
    : null;
}

function clampAgentCapValue(value, fallbackValue) {
  const helper = getAgentCapRecommendationModule();
  if (helper && typeof helper.clampAgentCap === 'function') {
    return helper.clampAgentCap(value, fallbackValue);
  }
  let raw = (typeof value === 'number') ? value : parseInt(value, 10);
  if (!Number.isFinite(raw)) raw = Number.isFinite(fallbackValue) ? fallbackValue : defaultSettings.fsbAgentCap;
  raw = Math.floor(raw);
  if (raw < 1) return 1;
  if (raw > 64) return 64;
  return raw;
}

async function resolveRecommendedAgentCap() {
  const helper = getAgentCapRecommendationModule();
  if (helper && typeof helper.getRecommendedAgentCap === 'function') {
    try {
      return clampAgentCapValue(await helper.getRecommendedAgentCap(), defaultSettings.fsbAgentCap);
    } catch (_e) {
      return defaultSettings.fsbAgentCap;
    }
  }
  return defaultSettings.fsbAgentCap;
}

function updateAgentCapResetLabel() {
  if (!elements.fsbAgentCapReset) return;
  const text = 'Reset to recommended (' + fsbRecommendedAgentCap + ')';
  // The button carries a leading <i> icon -- write into the inner label span
  // so re-renders don't wipe it out via a bare .textContent = on the button.
  const label = elements.fsbAgentCapReset.querySelector('.form-secondary-btn__label');
  if (label) {
    label.textContent = text;
  } else {
    elements.fsbAgentCapReset.textContent = text;
  }
}

function setAgentCapControlValue(value) {
  const capValue = clampAgentCapValue(value, fsbRecommendedAgentCap);
  if (elements.fsbAgentCap) {
    elements.fsbAgentCap.value = String(capValue);
    refreshStepper(elements.fsbAgentCap);
  }
  if (elements.fsbAgentCapDisplay) elements.fsbAgentCapDisplay.textContent = String(capValue);
  updateAgentCapResetLabel();
}

// Available models - sourced from config.js (loaded before this script) with custom provider added
const availableModels = {
  ...config.availableModels,
  custom: [
    { id: 'custom-model', name: 'Custom Model', description: 'Enter your model name below' }
  ]
};

// Dashboard state
const dashboardState = {
  currentSection: 'dashboard',
  hasUnsavedChanges: false,
  isApiTesting: false,
  connectionStatus: 'checking',
  // Dashboard-relay WS connectivity, seeded by the getDashboardWebSocketStatus
  // replay and kept live by the dashboardWsStatusChanged runtime push
  // (initializeSyncSection). Read by _wsIsOpen() for the sync pill.
  wsConnected: false
};

// Provider intent is kept separate from advisory inventory evidence. The
// existing hidden #modelProvider select remains the API-only source of truth;
// an agent id is never written into it.
const providerPanelState = {
  providerKind: 'api',
  agentProviderId: '',
  recommendation: { providerKind: 'api', providerId: 'xai', reason: 'fallback' },
  clients: Object.create(null),
  evidenceStatus: 'idle',
  hasSuccessfulEvidence: false
};

let providerEvidenceRefreshPromise = null;
let providerEvidenceRefreshDebounceHandle = null;
let providerEvidenceRefreshQueued = false;
let providerEvidenceRefreshQueuedCompatibilityCheckedAt = null;
let providerEvidenceRefreshDebounceCompatibilityCheckedAt = null;
let providerCompatibilityExpiryHandle = null;
let providerCompatibilityProjectionPromise = null;
let providerCompatibilityGeneration = 0;
let providerManualRefreshGeneration = 0;
let providerManualSuccess = null;
const PROVIDER_EVIDENCE_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;
const MCP_BRIDGE_PAIRING_KEY = 'fsbMcpBridgePairing';
const MCP_BRIDGE_STATE_KEY = 'mcpBridgeState';
const MCP_BRIDGE_PAIRING_PATTERN = /^fsb-auth\.[A-Za-z0-9_-]{43}$/;
const MCP_BRIDGE_PAIRING_COPY = Object.freeze({
  paired: 'Local bridge paired for this browser session.',
  configured: 'Pairing saved. Start or restart fsb-mcp-server serve, then retry.',
  expired: 'Pairing code was rejected or expired. Run fsb-mcp-server pair again.',
  unpaired: 'No local bridge pairing is saved for this browser session.'
});
let providerSettingsModelLoadTimer = null;
let providerSettingsLoadGeneration = 0;
let delegationTrustClearPending = false;
let delegationTrustClearProviderId = '';

// Initialize analytics
let analytics = null;

// Statistics data
const statsData = {
  logs: []
};

// DOM elements
const elements = {};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', initializeDashboard);

function initializeDashboard() {
  console.log('FSB Control Panel initializing...');
  
  // Cache DOM elements
  cacheElements();
  
  // Initialize analytics
  analytics = new FSBAnalytics();
  window.analytics = analytics; // Make globally available
  
  console.log('Options page: Analytics created, waiting for initialization...');
  
  // Setup event listeners
  setupEventListeners();

  // Wire up minus/value/plus numeric steppers
  initFsbSteppers();

  // Wire up sidebar magnetic-dock hover
  initSidebarProximity();

  // Load saved settings
  loadSettings();
  loadMcpBridgePairingStatus();

  // Replace native <select>s with the custom dropdown widget. Runs after
  // loadSettings() so each select's current .value/.selected already
  // reflects the persisted setting when the widget reads its initial state.
  initFsbSelects();

  // Initialize sections
  initializeSections();

  // Initialize credential vault UI
  loadCredentialVaultStatus();
  loadPaymentVaultStatus();
  initCredentialVaultListeners();

  // Setup theme
  setupTheme();
  
  // Initialize logs
  initializeLogs();

  // Initialize analytics chart after initialization completes
  if (analytics) {
    analytics.initPromise.then(() => {
      console.log('Options page: Analytics initialized, setting up dashboard...');
      analytics.initializeChart();
      analytics.updateDashboard();
      loadDashboardCostBreakdown();
    }).catch(error => {
      console.error('Options page: Analytics initialization failed:', error);
    });
  }

  // Initialize session history
  setTimeout(initializeSessionHistory, 500);

  // Initialize site explorer
  setTimeout(initializeSiteExplorer, 600);

  console.log('FSB Control Panel initialized successfully');
}

function cacheElements() {
  // Header elements
  elements.connectionStatus = document.getElementById('connectionStatus');

  // Theme mode (System/Dark/Light segmented control, Advanced Settings)
  elements.themeModeToggle = document.getElementById('themeModeToggle');

  // Navigation
  elements.navItems = document.querySelectorAll('.nav-item');
  elements.contentSections = document.querySelectorAll('.content-section');
  
  // Form elements
  elements.modelProvider = document.getElementById('modelProvider');
  elements.providerRoster = document.getElementById('providerRoster');
  elements.providerSelectionRadios = document.querySelectorAll('input[name="fsbProviderSelection"]');
  elements.providerRecommendationBadges = document.querySelectorAll('[data-provider-recommendation]');
  elements.providerEvidenceBadges = document.querySelectorAll('[data-provider-evidence]');
  elements.providerDescriptions = document.querySelectorAll('[data-provider-description]');
  elements.providerCompatibilityGroups = document.querySelectorAll('[data-provider-compatibility-group]');
  elements.providerCompatibilityIcons = document.querySelectorAll('[data-provider-compatibility-icon]');
  elements.providerCompatibilityStatuses = document.querySelectorAll('[data-provider-compatibility-status]');
  elements.providerCompatibilityDescriptions = document.querySelectorAll('[data-provider-compatibility-description]');
  elements.refreshProviderStatusBtn = document.getElementById('refreshProviderStatusBtn');
  elements.providerEvidenceAnnouncement = document.getElementById('providerEvidenceAnnouncement');
  elements.apiProviderDetails = document.getElementById('apiProviderDetails');
  elements.agentProviderDetails = document.getElementById('agentProviderDetails');
  elements.agentProviderDetailsHeading = document.getElementById('agentProviderDetailsHeading');
  elements.agentNoCredentialCaption = document.getElementById('agentNoCredentialCaption');
  elements.agentEvidenceEmptyState = document.getElementById('agentEvidenceEmptyState');
  elements.agentInstallationStatus = document.getElementById('agentInstallationStatus');
  elements.agentConnectionStatus = document.getElementById('agentConnectionStatus');
  elements.agentCompatibilityStatus = document.getElementById('agentCompatibilityStatus');
  elements.agentCompatibilityHelp = document.getElementById('agentCompatibilityHelp');
  elements.agentCompatibilityChecked = document.getElementById('agentCompatibilityChecked');
  elements.agentAccountStatus = document.getElementById('agentAccountStatus');
  elements.agentAccountHelp = document.getElementById('agentAccountHelp');
  elements.agentSetupStatus = document.getElementById('agentSetupStatus');
  elements.openAgentSetupGuideBtn = document.getElementById('openAgentSetupGuideBtn');
  elements.mcpBridgePairingCode = document.getElementById('mcpBridgePairingCode');
  elements.pairMcpBridgeBtn = document.getElementById('pairMcpBridgeBtn');
  elements.removeMcpBridgePairingBtn = document.getElementById('removeMcpBridgePairingBtn');
  elements.mcpBridgePairingStatus = document.getElementById('mcpBridgePairingStatus');
  elements.agentUsageTokens = document.getElementById('agentUsageTokens');
  elements.agentUsageTurns = document.getElementById('agentUsageTurns');
  elements.agentUsageDuration = document.getElementById('agentUsageDuration');
  elements.agentUsageEmptyState = document.getElementById('agentUsageEmptyState');
  elements.agentBillingStatus = document.getElementById('agentBillingStatus');
  elements.agentBillingCopy = document.getElementById('agentBillingCopy');
  elements.agentBillingLink = document.getElementById('agentBillingLink');
  elements.agentBillingLinkLabel = document.getElementById('agentBillingLinkLabel');
  ensureDelegationTrustControl();
  elements.otherMcpClientsDisclosure = document.getElementById('otherMcpClientsDisclosure');
  elements.otherMcpClientsSummary = document.getElementById('otherMcpClientsSummary');
  elements.otherMcpClientsList = document.getElementById('otherMcpClientsList');
  elements.modelSearch = document.getElementById('modelSearch');
  elements.modelName = document.getElementById('modelName');
  elements.apiKey = document.getElementById('apiKey');
  elements.geminiApiKey = document.getElementById('geminiApiKey');
  elements.xaiApiKeyGroup = document.getElementById('xaiApiKeyGroup');
  elements.geminiApiKeyGroup = document.getElementById('geminiApiKeyGroup');
  elements.maxIterations = document.getElementById('maxIterations');
  elements.maxIterationsSlider = document.getElementById('maxIterationsSlider');
  elements.maxIterationsDisplay = document.getElementById('maxIterationsDisplay');
  elements.debugMode = document.getElementById('debugMode');
  // DOM Optimization elements
  elements.domOptimization = document.getElementById('domOptimization');
  elements.maxDOMElements = document.getElementById('maxDOMElements');
  elements.maxDOMElementsSlider = document.getElementById('maxDOMElementsSlider');
  elements.maxDOMElementsDisplay = document.getElementById('maxDOMElementsDisplay');
  elements.elementCacheSize = document.getElementById('elementCacheSize');
  elements.elementCacheSizePreset = document.getElementById('elementCacheSizePreset');
  elements.elementCacheSizeCustom = document.getElementById('elementCacheSizeCustom');
  elements.elementCacheSizeCustomWrap = document.getElementById('elementCacheSizeCustomWrap');
  elements.elementCacheSizeDisplay = document.getElementById('elementCacheSizeDisplay');
  // Phase 241 D-05 / POOL-05: Agent Concurrency cap card.
  elements.fsbAgentCap = document.getElementById('fsbAgentCap');
  elements.fsbAgentCapDisplay = document.getElementById('fsbAgentCapDisplay');
  elements.fsbAgentCapReset = document.getElementById('fsbAgentCapReset');
  // Phase 243 Plan 04 / UI-03: validation hint + live current-active counter.
  elements.fsbAgentCapValidation = document.getElementById('fsbAgentCapValidation');
  elements.fsbAgentCapCurrentActive = document.getElementById('fsbAgentCapCurrentActive');
  // Trigger Concurrency cap card.
  elements.fsbTriggerCap = document.getElementById('fsbTriggerCap');
  elements.fsbTriggerCapDisplay = document.getElementById('fsbTriggerCapDisplay');
  elements.fsbTriggerCapReset = document.getElementById('fsbTriggerCapReset');
  elements.fsbTriggerCapValidation = document.getElementById('fsbTriggerCapValidation');
  elements.fsbTriggerCapCurrentActive = document.getElementById('fsbTriggerCapCurrentActive');
  // Phase 245 D-07: Action Change Reports global toggle.
  elements.fsbChangeReportsEnabled = document.getElementById('fsbChangeReportsEnabled');
  elements.prioritizeViewport = document.getElementById('prioritizeViewport');
  elements.animatedActionHighlights = document.getElementById('animatedActionHighlights');
  elements.showSidepanelProgress = document.getElementById('showSidepanelProgress');
  elements.autoRefineSiteMaps = document.getElementById('autoRefineSiteMaps');

  // Credentials (Beta)
  elements.enableLogin = document.getElementById('enableLogin');

  // CAPTCHA Solver
  elements.captchaSolverEnabled = document.getElementById('captchaSolverEnabled');
  elements.captchaApiKey = document.getElementById('captchaApiKey');
  elements.toggleCaptchaApiKey = document.getElementById('toggleCaptchaApiKey');

  // Speech-to-Text
  elements.sttProvider = document.getElementById('sttProvider');

  // Button elements
  elements.toggleApiKey = document.getElementById('toggleApiKey');
  elements.fullApiTest = document.getElementById('fullApiTest');
  elements.testResults = document.getElementById('testResults');
  elements.successRate = document.getElementById('successRate');

  // API Status Card
  elements.apiStatusCard = document.getElementById('apiStatusCard');
  
  // Logs
  elements.logsDisplay = document.getElementById('logsDisplay');
  elements.clearLogs = document.getElementById('clearLogs');
  elements.exportLogs = document.getElementById('exportLogs');
  elements.logLevel = document.getElementById('logLevel');
  
  // Save bar
  elements.saveBar = document.getElementById('saveBar');
  elements.saveBtn = document.getElementById('saveBtn');
  elements.discardBtn = document.getElementById('discardBtn');
  
  // Status toast
  elements.statusToast = document.getElementById('statusToast');

  // Site Explorer
  elements.explorerUrl = document.getElementById('explorerUrl');
  elements.explorerGoBtn = document.getElementById('explorerGoBtn');
  elements.explorerStopAllBtn = document.getElementById('explorerStopAllBtn');
  elements.explorerMaxDepth = document.getElementById('explorerMaxDepth');
  elements.explorerMaxPages = document.getElementById('explorerMaxPages');
  elements.explorerCrawlers = document.getElementById('explorerCrawlers');
  elements.researchList = document.getElementById('researchList');

  // Phase 30 (GOV-07/GOV-08): Consent & Audit section. These render/persist
  // straight to the dedicated consent + audit stores (NOT defaultSettings / the
  // Save bar). The segmented control + mutating toggle write FsbConsentPolicyStore;
  // the audit table reads the redacted FsbAuditLog ring; the Sensitive/Blocked
  // badges read FsbServiceDenylist.classify -- the SAME source the gate enforces.
  elements.consentDefaultModeToggle = document.getElementById('consentDefaultModeToggle');
  elements.consentOriginList = document.getElementById('consentOriginList');
  elements.consentOriginEmptyState = document.getElementById('consentOriginEmptyState');
  elements.consentOriginRowTemplate = document.getElementById('consentOriginRowTemplate');
  elements.pendingRequestList = document.getElementById('pendingRequestList');
  elements.pendingRequestEmptyState = document.getElementById('pendingRequestEmptyState');
  elements.pendingRequestRowTemplate = document.getElementById('pendingRequestRowTemplate');
  elements.pendingRequestCount = document.getElementById('pendingRequestCount');
  elements.auditLogTable = document.getElementById('auditLogTable');
  elements.auditLogBody = document.getElementById('auditLogBody');
  elements.auditLogEmptyRow = document.getElementById('auditLogEmptyRow');
  elements.auditExportBtn = document.getElementById('auditExportBtn');
  elements.auditClearBtn = document.getElementById('auditClearBtn');
}

function ensureDelegationTrustControl() {
  if (!elements.agentProviderDetails || elements.delegationTrustSection) return;
  const section = document.createElement('section');
  section.className = 'agent-provider-details__section';
  section.hidden = true;
  section.setAttribute('aria-labelledby', 'delegationTrustHeading');

  const heading = document.createElement('h4');
  heading.id = 'delegationTrustHeading';
  heading.textContent = 'Run confirmation';
  const copy = document.createElement('p');
  copy.textContent = 'Require confirmation before Claude Code starts another delegated browser task.';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'form-secondary-btn provider-detail-action';
  button.textContent = 'Restore confirmation for Claude Code';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  section.appendChild(heading);
  section.appendChild(copy);
  section.appendChild(button);
  section.appendChild(status);
  elements.agentProviderDetails.appendChild(section);
  elements.delegationTrustSection = section;
  elements.delegationTrustCopy = copy;
  elements.delegationTrustClearBtn = button;
  elements.delegationTrustStatus = status;
}

function getCanonicalDelegationProvider(providerId) {
  const helper = (typeof globalThis !== 'undefined')
    ? globalThis.FsbDelegationProviders
    : null;
  const get = getOwnDataValue(helper, 'get');
  if (typeof get !== 'function' || typeof providerId !== 'string') return null;
  let metadata;
  try {
    metadata = get.call(helper, providerId);
  } catch (_error) {
    return null;
  }
  const id = getOwnDataValue(metadata, 'id');
  const label = getOwnDataValue(metadata, 'label');
  const billingKind = getOwnDataValue(metadata, 'billingKind');
  if (id !== providerId
      || typeof label !== 'string'
      || !label
      || (billingKind !== 'subscription' && billingKind !== 'unknown')) return null;
  return { id, label, billingKind };
}

function getShippedDelegationProviderIds() {
  const helper = (typeof globalThis !== 'undefined')
    ? globalThis.FsbDelegationProviders
    : null;
  const ids = getOwnDataValue(helper, 'ids');
  if (typeof ids !== 'function') return [];
  let values;
  try {
    values = ids.call(helper);
  } catch (_error) {
    return [];
  }
  if (!Array.isArray(values)) return [];
  const shipped = [];
  const seen = Object.create(null);
  for (let index = 0; index < values.length; index += 1) {
    const provider = getCanonicalDelegationProvider(values[index]);
    if (!provider || Object.prototype.hasOwnProperty.call(seen, provider.id)) return [];
    seen[provider.id] = true;
    shipped.push(provider.id);
  }
  return shipped;
}

function renderDelegationTrustControl() {
  if (!elements.delegationTrustSection) return;
  const provider = providerPanelState.providerKind === 'agent'
    ? getCanonicalDelegationProvider(providerPanelState.agentProviderId)
    : null;
  const visible = !!provider;
  elements.delegationTrustSection.hidden = !visible;
  if (!visible) {
    if (elements.delegationTrustClearBtn) {
      elements.delegationTrustClearBtn.disabled = delegationTrustClearPending;
    }
    if (elements.delegationTrustStatus) elements.delegationTrustStatus.textContent = '';
    return;
  }
  if (elements.delegationTrustCopy) {
    elements.delegationTrustCopy.textContent =
      `Require confirmation before ${provider.label} starts another delegated browser task.`;
  }
  if (elements.delegationTrustClearBtn) {
    elements.delegationTrustClearBtn.textContent = `Restore confirmation for ${provider.label}`;
    elements.delegationTrustClearBtn.disabled = delegationTrustClearPending;
  }
  if (delegationTrustClearPending
      && delegationTrustClearProviderId !== provider.id
      && elements.delegationTrustStatus) {
    elements.delegationTrustStatus.textContent = '';
  }
}

async function clearDelegationTrust() {
  if (delegationTrustClearPending || providerPanelState.providerKind !== 'agent') return;
  const provider = getCanonicalDelegationProvider(providerPanelState.agentProviderId);
  if (!provider) return;
  delegationTrustClearPending = true;
  delegationTrustClearProviderId = provider.id;
  if (elements.delegationTrustClearBtn) elements.delegationTrustClearBtn.disabled = true;
  if (elements.delegationTrustStatus) elements.delegationTrustStatus.textContent = 'Restoring confirmation…';
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'FSB_DELEGATION_CLEAR_TRUST',
      providerId: provider.id
    });
    if (!result
        || result.ok !== true
        || result.providerId !== provider.id
        || result.trusted !== false) {
      throw new Error('delegation trust clear was rejected');
    }
    const selected = getCanonicalDelegationProvider(providerPanelState.agentProviderId);
    if (selected && selected.id === provider.id && elements.delegationTrustStatus) {
      elements.delegationTrustStatus.textContent = `Confirmation restored for ${provider.label}`;
    }
  } catch (_error) {
    const selected = getCanonicalDelegationProvider(providerPanelState.agentProviderId);
    if (selected && selected.id === provider.id && elements.delegationTrustStatus) {
      elements.delegationTrustStatus.textContent = 'Could not restore confirmation. Try again.';
    }
  } finally {
    delegationTrustClearPending = false;
    delegationTrustClearProviderId = '';
    renderDelegationTrustControl();
  }
}

function getProviderPanelHelper() {
  const helper = (typeof globalThis !== 'undefined') ? globalThis.FSBProvidersPanel : null;
  return helper
    && typeof helper.isApiProvider === 'function'
    && typeof helper.isAgentProvider === 'function'
    && typeof helper.normalizeSettings === 'function'
    && typeof helper.getCompatibilityDisplayModel === 'function'
    && typeof helper.getAgentAuthDisplay === 'function'
    ? helper
    : null;
}

function getOwnDataValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : undefined;
  } catch (_error) {
    return undefined;
  }
}

function isProviderDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    return Object.prototype.toString.call(value) === '[object Object]';
  } catch (_error) {
    return false;
  }
}

function copyProviderClientMap(value) {
  if (!isProviderDataRecord(value)) return null;
  const copy = Object.create(null);
  try {
    Object.keys(value).forEach((key) => {
      const row = getOwnDataValue(value, key);
      if (isProviderDataRecord(row)) copy[key] = row;
    });
  } catch (_error) {
    return null;
  }
  return copy;
}

function copyProviderDataRecord(value) {
  if (!isProviderDataRecord(value)) return {};
  let prototype = Object.prototype;
  try {
    const candidate = Object.getPrototypeOf(value);
    if (candidate && Object.getPrototypeOf(candidate) === null) prototype = candidate;
  } catch (_error) { /* use this realm's plain-object prototype */ }
  const copy = Object.create(prototype);
  try {
    Object.keys(value).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return;
      Object.defineProperty(copy, key, {
        value: descriptor.value,
        writable: true,
        enumerable: true,
        configurable: true
      });
    });
  } catch (_error) { /* return only the safely copied fields */ }
  return copy;
}

function projectStaleProviderCompatibility(clients) {
  const projected = copyProviderClientMap(clients) || Object.create(null);
  getShippedDelegationProviderIds().forEach((providerId) => {
    const row = getOwnDataValue(projected, providerId);
    const compatibility = getOwnDataValue(row, 'compatibility');
    const status = getOwnDataValue(compatibility, 'status');
    const reason = getOwnDataValue(compatibility, 'reason');
    const checkedAt = getOwnDataValue(compatibility, 'checkedAt');
    if (status !== 'supported'
        || reason !== 'within_tested_range'
        || !Number.isSafeInteger(checkedAt)
        || checkedAt < 0) return;
    const nextRow = copyProviderDataRecord(row);
    const nextCompatibility = copyProviderDataRecord(compatibility);
    nextCompatibility.status = 'degraded';
    nextCompatibility.reason = 'evidence_stale';
    nextCompatibility.checkedAt = checkedAt;
    nextRow.compatibility = nextCompatibility;
    projected[providerId] = nextRow;
  });
  return projected;
}

function getProviderCompatibilityCheckedAt(clients) {
  const providerIds = getShippedDelegationProviderIds();
  if (!providerIds.length) return null;
  let earliest = null;
  for (const providerId of providerIds) {
    const row = getOwnDataValue(clients, providerId);
    const compatibility = getOwnDataValue(row, 'compatibility');
    const checkedAt = getOwnDataValue(compatibility, 'checkedAt');
    if (!Number.isSafeInteger(checkedAt) || checkedAt < 0) return null;
    earliest = earliest === null ? checkedAt : Math.min(earliest, checkedAt);
  }
  return earliest;
}

function getProviderStorageCompatibilityCheckedAt(change) {
  const nextEnvelope = getOwnDataValue(change, 'newValue');
  const compatibility = getOwnDataValue(nextEnvelope, 'compatibility');
  const schemaVersion = getOwnDataValue(compatibility, 'schemaVersion');
  const checkedAt = getOwnDataValue(compatibility, 'checkedAt');
  return schemaVersion === 1 && Number.isSafeInteger(checkedAt) && checkedAt >= 0
    ? checkedAt
    : null;
}

function newestProviderCompatibilityCheckedAt(current, candidate) {
  if (!Number.isSafeInteger(candidate) || candidate < 0) return current;
  if (!Number.isSafeInteger(current) || current < 0) return candidate;
  return Math.max(current, candidate);
}

function getProviderManualSuccessToken(observedCheckedAt) {
  const success = providerManualSuccess;
  if (!success
      || !Number.isSafeInteger(observedCheckedAt)
      || observedCheckedAt < 0) return null;
  return { generation: success.generation, checkedAt: success.checkedAt };
}

function isCurrentProviderManualSuccess(token) {
  return !!token && !!providerManualSuccess
    && token.generation === providerManualSuccess.generation
    && token.checkedAt === providerManualSuccess.checkedAt;
}

function consumeProviderManualSuccess(token) {
  if (isCurrentProviderManualSuccess(token)) providerManualSuccess = null;
}

function isValidProviderCompatibilityProjection(value) {
  if (!isProviderDataRecord(value)) return false;
  const status = getOwnDataValue(value, 'status');
  const reason = getOwnDataValue(value, 'reason');
  const checkedAt = getOwnDataValue(value, 'checkedAt');
  if (!Number.isSafeInteger(checkedAt) || checkedAt < 0) return false;
  if (status === 'supported') return reason === 'within_tested_range';
  if (status === 'degraded') {
    return reason === 'newer_than_tested_range' || reason === 'evidence_stale';
  }
  return status === 'unsupported' && [
    'binary_not_found',
    'version_missing',
    'version_malformed',
    'below_minimum',
    'wrong_major',
    'adapter_unshipped',
    'matrix_invalid'
  ].includes(reason);
}

function mergeProviderCompatibilityProjection(currentClients, projectedClients) {
  const helper = getProviderPanelHelper();
  const merged = copyProviderClientMap(currentClients) || Object.create(null);
  if (!helper || !Array.isArray(helper.AGENT_PROVIDER_IDS)) return null;
  let mergedAny = false;
  helper.AGENT_PROVIDER_IDS.forEach((providerId) => {
    const currentRow = getOwnDataValue(merged, providerId);
    const projectedRow = getOwnDataValue(projectedClients, providerId);
    const compatibility = getOwnDataValue(projectedRow, 'compatibility');
    if (!isProviderDataRecord(currentRow)
        || !isValidProviderCompatibilityProjection(compatibility)) return;
    const nextRow = copyProviderDataRecord(currentRow);
    nextRow.compatibility = copyProviderDataRecord(compatibility);
    merged[providerId] = nextRow;
    mergedAny = true;
  });
  return mergedAny ? merged : null;
}

function hasDegradedProviderCompatibility(clients) {
  return getShippedDelegationProviderIds().some((providerId) => {
    const row = getOwnDataValue(clients, providerId);
    const compatibility = getOwnDataValue(row, 'compatibility');
    const status = getOwnDataValue(compatibility, 'status');
    const reason = getOwnDataValue(compatibility, 'reason');
    const checkedAt = getOwnDataValue(compatibility, 'checkedAt');
    return status === 'degraded'
      && (reason === 'newer_than_tested_range' || reason === 'evidence_stale')
      && Number.isSafeInteger(checkedAt)
      && checkedAt >= 0;
  });
}

function getCompatibilityRefreshFailureMessage(clients) {
  return hasDegradedProviderCompatibility(clients)
    ? 'Compatibility data could not be refreshed. Cached support is now Degraded.'
    : 'Compatibility data is unavailable. Showing Unsupported.';
}

function requestMcpClients(liveCompatibility = false) {
  return new Promise((resolve, reject) => {
    const runtime = typeof chrome !== 'undefined' && chrome ? chrome.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      reject(new Error('provider_status_unavailable'));
      return;
    }

    let settled = false;
    let timeoutHandle = null;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      callback(value);
    };
    timeoutHandle = setTimeout(() => {
      settle(reject, new Error('provider_status_unavailable'));
    }, PROVIDER_EVIDENCE_TIMEOUT_MS);

    try {
      const request = liveCompatibility
        ? { action: 'refreshMcpCompatibility' }
        : { action: 'getMcpClients' };
      runtime.sendMessage(request, (response) => {
        if (settled) return;
        if (runtime.lastError) {
          settle(reject, new Error('provider_status_unavailable'));
          return;
        }
        if (!isProviderDataRecord(response) || getOwnDataValue(response, 'success') !== true) {
          settle(reject, new Error('provider_status_unavailable'));
          return;
        }
        const clients = copyProviderClientMap(getOwnDataValue(response, 'clients'));
        const refreshOutcome = getOwnDataValue(response, 'refreshOutcome');
        const compatibilityExpiresAt = getOwnDataValue(response, 'compatibilityExpiresAt');
        const validExpiry = compatibilityExpiresAt === null
          || (Number.isSafeInteger(compatibilityExpiresAt) && compatibilityExpiresAt >= 0);
        if (!clients || !['refreshed', 'stale', 'unavailable'].includes(refreshOutcome)
            || !validExpiry) {
          settle(reject, new Error('provider_status_unavailable'));
          return;
        }
        settle(resolve, {
          clients: clients,
          refreshOutcome: refreshOutcome,
          compatibilityExpiresAt: compatibilityExpiresAt
        });
      });
    } catch (_error) {
      settle(reject, new Error('provider_status_unavailable'));
    }
  });
}

function getProviderBadgeByData(badges, dataKey, providerId) {
  let match = null;
  Array.prototype.some.call(badges || [], (badge) => {
    if (badge.dataset?.[dataKey] !== providerId) return false;
    match = badge;
    return true;
  });
  return match;
}

function getProviderCompatibilityModel(helper, providerId) {
  const row = getOwnDataValue(providerPanelState.clients, providerId);
  return helper.getCompatibilityDisplayModel(providerId, row, (checkedAt) => {
    return new Date(checkedAt).toLocaleString();
  });
}

function setProviderCompatibilityClass(status, model) {
  if (!status || !status.classList || !model) return;
  status.classList.remove(
    'compatibility-badge--supported',
    'compatibility-badge--degraded',
    'compatibility-badge--unsupported'
  );
  status.classList.add(model.className);
}

function setProviderCompatibilityIcon(icon, model) {
  if (!icon || !icon.classList || !model) return;
  icon.classList.remove('fa-circle-check', 'fa-triangle-exclamation', 'fa-circle-xmark');
  icon.classList.add(model.icon);
  icon.setAttribute('aria-hidden', 'true');
}

function renderProviderCompatibility() {
  const helper = getProviderPanelHelper();
  if (!helper || typeof helper.getCompatibilityDisplayModel !== 'function') return;
  const statuses = elements.providerCompatibilityStatuses || [];

  Array.prototype.forEach.call(statuses, (status) => {
    const providerId = status.dataset?.providerCompatibilityStatus;
    if (!helper.isAgentProvider(providerId)) return;
    const model = getProviderCompatibilityModel(helper, providerId);
    if (!model) return;
    const icon = getProviderBadgeByData(
      elements.providerCompatibilityIcons,
      'providerCompatibilityIcon',
      providerId
    );
    const description = getProviderBadgeByData(
      elements.providerCompatibilityDescriptions,
      'providerCompatibilityDescription',
      providerId
    );
    status.textContent = model.label;
    setProviderCompatibilityClass(status, model);
    setProviderCompatibilityIcon(icon, model);
    if (description) {
      description.textContent = `Compatibility: ${model.label}. ${model.detail}`;
    }
  });
}

function renderProviderAccessibleDescriptions() {
  const helper = getProviderPanelHelper();
  if (!helper) return;
  const descriptions = elements.providerDescriptions || [];

  Array.prototype.forEach.call(descriptions, (description) => {
    const providerId = description.dataset?.providerDescription;
    const parts = [];
    const recommendationBadge = getProviderBadgeByData(
      elements.providerRecommendationBadges,
      'providerRecommendation',
      providerId
    );
    if (recommendationBadge && !recommendationBadge.hidden) {
      parts.push('Recommended.');
    }

    if (helper.isAgentProvider(providerId)) {
      const evidenceBadge = getProviderBadgeByData(
        elements.providerEvidenceBadges,
        'providerEvidence',
        providerId
      );
      const evidenceText = evidenceBadge && !evidenceBadge.hidden
        ? String(evidenceBadge.textContent || '').trim()
        : '';
      if (evidenceText) {
        parts.push(/[.!?…]$/.test(evidenceText) ? evidenceText : `${evidenceText}.`);
      }
    }

    description.textContent = parts.join(' ');
  });
}

function renderProviderRecommendation() {
  const helper = getProviderPanelHelper();
  const recommendation = providerPanelState.recommendation;
  const badges = elements.providerRecommendationBadges || [];
  let shown = false;

  Array.prototype.forEach.call(badges, (badge) => {
    badge.hidden = true;
    const providerId = badge.dataset?.providerRecommendation;
    const providerKind = helper && helper.isAgentProvider(providerId) ? 'agent' : 'api';
    if (!shown && recommendation
        && recommendation.providerKind === providerKind
        && recommendation.providerId === providerId) {
      badge.hidden = false;
      shown = true;
    }
  });
  renderProviderAccessibleDescriptions();
}

function setProviderEvidenceBadgeClass(badge, status) {
  if (!badge || !badge.classList) return;
  badge.classList.remove(
    'provider-badge--connected',
    'provider-badge--installed',
    'provider-badge--seen',
    'provider-badge--error',
    'provider-badge--neutral'
  );
  if (providerPanelState.evidenceStatus === 'unavailable') {
    badge.classList.add('provider-badge--error');
  } else if (status.live) {
    badge.classList.add('provider-badge--connected');
  } else if (status.installed) {
    badge.classList.add('provider-badge--installed');
  } else if (status.seenBefore) {
    badge.classList.add('provider-badge--seen');
  } else {
    badge.classList.add('provider-badge--neutral');
  }
}

function hasSupportedAgentEvidence(helper) {
  return helper.AGENT_PROVIDER_IDS.some((providerId) => {
    const row = getOwnDataValue(providerPanelState.clients, providerId);
    const status = helper.getAgentStatus(row);
    return status.clicked || status.installed || status.seenBefore || status.live;
  });
}

function safeObservedClientName(id, row) {
  const displayName = getOwnDataValue(row, 'displayName');
  const candidate = typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : id;
  return String(candidate).slice(0, 200);
}

function renderOtherMcpClients(helper) {
  const disclosure = elements.otherMcpClientsDisclosure;
  const summary = elements.otherMcpClientsSummary;
  const list = elements.otherMcpClientsList;
  if (!disclosure || !summary || !list) return;

  const rows = [];
  Object.keys(providerPanelState.clients).forEach((id) => {
    const row = getOwnDataValue(providerPanelState.clients, id);
    if (!isProviderDataRecord(row)) return;
    const raw = getOwnDataValue(row, 'raw') === true;
    if (!raw && (helper.isApiProvider(id) || helper.isAgentProvider(id))) return;
    rows.push({ id: id, name: safeObservedClientName(id, row) });
  });
  rows.sort((a, b) => {
    const aName = a.name.toLocaleLowerCase();
    const bName = b.name.toLocaleLowerCase();
    if (aName < bName) return -1;
    if (aName > bName) return 1;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });

  summary.textContent = `Other MCP clients (${rows.length})`;
  list.textContent = '';
  rows.forEach((row) => {
    const item = document.createElement('li');
    item.textContent = `${row.name} — Observed MCP client`;
    list.appendChild(item);
  });
  disclosure.hidden = rows.length === 0;
  if (rows.length === 0) disclosure.open = false;
}

function renderProviderEvidence() {
  const helper = getProviderPanelHelper();
  if (!helper || typeof helper.getAgentStatus !== 'function') return;
  const badges = elements.providerEvidenceBadges || [];

  Array.prototype.forEach.call(badges, (badge) => {
    const providerId = badge.dataset?.providerEvidence;
    if (!helper.isAgentProvider(providerId)) {
      badge.hidden = true;
      return;
    }
    const row = getOwnDataValue(providerPanelState.clients, providerId);
    const status = helper.getAgentStatus(row);
    let label = status.primaryLabel;
    if (providerPanelState.evidenceStatus === 'loading' && !providerPanelState.hasSuccessfulEvidence) {
      label = 'Loading provider status…';
    } else if (providerPanelState.evidenceStatus === 'unavailable') {
      label = 'Status unavailable';
    } else if (providerPanelState.evidenceStatus === 'stale') {
      label = `${status.primaryLabel} · Status may be stale`;
    }
    badge.textContent = label;
    badge.hidden = false;
    setProviderEvidenceBadgeClass(badge, status);
    if (providerPanelState.evidenceStatus === 'stale') {
      badge.setAttribute('data-stale', 'true');
      badge.setAttribute('title', 'Status may be stale. Refresh after the FSB server reconnects.');
    } else {
      badge.removeAttribute('data-stale');
      if (status.checkedAt !== null) {
        badge.setAttribute('title', `Installed status checked ${new Date(status.checkedAt).toLocaleString()}`);
      } else {
        badge.removeAttribute('title');
      }
    }
  });
  renderProviderAccessibleDescriptions();

  if (elements.agentEvidenceEmptyState) {
    const absenceConfirmed = providerPanelState.evidenceStatus === 'ready'
      && !hasSupportedAgentEvidence(helper);
    elements.agentEvidenceEmptyState.hidden = !absenceConfirmed;
  }
  renderProviderCompatibility();
  renderOtherMcpClients(helper);
}

function renderSelectedAgentCompatibility(helper, providerId) {
  const compatibility = getProviderCompatibilityModel(helper, providerId);
  if (elements.agentCompatibilityStatus && compatibility) {
    elements.agentCompatibilityStatus.textContent = compatibility.label;
  }
  if (elements.agentCompatibilityHelp && compatibility) {
    elements.agentCompatibilityHelp.textContent = compatibility.detail;
  }
  if (elements.agentCompatibilityChecked && compatibility) {
    elements.agentCompatibilityChecked.textContent = compatibility.checkedText || '';
    elements.agentCompatibilityChecked.hidden = !compatibility.checkedText;
  }
}

function renderSelectedAgentDetails() {
  const helper = getProviderPanelHelper();
  renderDelegationTrustControl();
  if (!helper || providerPanelState.providerKind !== 'agent'
      || !helper.isAgentProvider(providerPanelState.agentProviderId)) return;
  const providerId = providerPanelState.agentProviderId;
  const definition = helper.getProviderDefinition('agent', providerId);
  if (!definition) return;
  const row = getOwnDataValue(providerPanelState.clients, providerId);
  const status = helper.getAgentStatus(row);
  const auth = helper.getAgentAuthDisplay(providerId);
  const unavailable = providerPanelState.evidenceStatus === 'unavailable';
  const initialLoading = providerPanelState.evidenceStatus === 'loading'
    && !providerPanelState.hasSuccessfulEvidence;
  const billing = helper.getBillingLabel(undefined);

  if (elements.agentProviderDetailsHeading) {
    elements.agentProviderDetailsHeading.textContent = `${definition.displayName} details`;
  }
  if (elements.agentNoCredentialCaption) {
    elements.agentNoCredentialCaption.textContent = "FSB uses this CLI's existing sign-in and does not need its credential. Billing and limits follow the account or provider configured in the CLI.";
  }
  if (elements.agentInstallationStatus) {
    elements.agentInstallationStatus.textContent = initialLoading
      ? 'Loading provider status…'
      : unavailable
      ? 'Status unavailable'
      : (status.installed ? 'Installed' : 'Not installed');
  }
  if (elements.agentConnectionStatus) {
    elements.agentConnectionStatus.textContent = initialLoading
      ? 'Loading provider status…'
      : unavailable
      ? 'Status unavailable'
      : (status.live ? 'Connected now' : (status.seenBefore ? 'Seen before' : 'Not connected'));
  }
  renderSelectedAgentCompatibility(helper, providerId);
  if (elements.agentAccountStatus && auth) elements.agentAccountStatus.textContent = auth.label;
  if (elements.agentAccountHelp) {
    elements.agentAccountHelp.textContent = auth ? auth.help : '';
  }
  if (elements.agentSetupStatus) {
    if (providerPanelState.evidenceStatus === 'stale') {
      elements.agentSetupStatus.textContent = 'Status may be stale. Refresh after the FSB server reconnects.';
    } else if (unavailable) {
      elements.agentSetupStatus.textContent = 'Agent status is unavailable. Your selection is unchanged.';
    } else if (status.clicked && !status.installed) {
      elements.agentSetupStatus.textContent = 'Setup was copied during onboarding. Installation is not confirmed.';
    } else if (status.installed) {
      elements.agentSetupStatus.textContent = 'This CLI is installed. Open the setup guide to review its FSB connection.';
    } else {
      elements.agentSetupStatus.textContent = 'Open the setup guide to connect this CLI to FSB.';
    }
  }
  if (elements.agentUsageTokens) elements.agentUsageTokens.textContent = '—';
  if (elements.agentUsageTurns) elements.agentUsageTurns.textContent = '—';
  if (elements.agentUsageDuration) elements.agentUsageDuration.textContent = '—';
  if (elements.agentUsageEmptyState) elements.agentUsageEmptyState.textContent = 'No delegated runs yet';
  if (elements.agentBillingStatus) elements.agentBillingStatus.textContent = billing.label;
  if (elements.agentBillingCopy) elements.agentBillingCopy.textContent = definition.billingCopy;
  if (elements.agentBillingLink) {
    elements.agentBillingLink.setAttribute('href', definition.billingUrl);
    elements.agentBillingLink.setAttribute('target', '_blank');
    elements.agentBillingLink.setAttribute('rel', 'noopener noreferrer');
    elements.agentBillingLink.hidden = false;
  }
  if (elements.agentBillingLinkLabel) {
    elements.agentBillingLinkLabel.textContent = definition.billingLinkLabel;
  }
}

function openAgentSetupGuide() {
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : null;
  const setupUrl = runtime && typeof runtime.getURL === 'function'
    ? runtime.getURL('ui/onboarding.html')
    : 'onboarding.html';
  if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
    chrome.tabs.create({ url: setupUrl });
  } else if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(setupUrl, '_blank', 'noopener');
  }
}

function renderMcpBridgePairingStatus(status, isAlert = false) {
  const statusElement = elements.mcpBridgePairingStatus;
  const normalized = Object.prototype.hasOwnProperty.call(MCP_BRIDGE_PAIRING_COPY, status)
    ? status
    : 'unpaired';
  if (!statusElement) return normalized;
  statusElement.textContent = MCP_BRIDGE_PAIRING_COPY[normalized];
  statusElement.setAttribute('role', isAlert ? 'alert' : 'status');
  statusElement.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
  statusElement.setAttribute('aria-atomic', 'true');
  return normalized;
}

function requestMcpBridgePairingReload() {
  return new Promise((resolve) => {
    const runtime = typeof chrome !== 'undefined' && chrome ? chrome.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      resolve({ success: false, errorCode: 'mcp_bridge_pairing_reload_unavailable' });
      return;
    }
    try {
      runtime.sendMessage({ action: 'reloadMcpBridgePairing' }, (response) => {
        if (runtime.lastError) {
          resolve({ success: false, errorCode: 'mcp_bridge_pairing_reload_failed' });
          return;
        }
        resolve(response && typeof response === 'object'
          ? response
          : { success: false, errorCode: 'mcp_bridge_pairing_reload_failed' });
      });
    } catch (_error) {
      resolve({ success: false, errorCode: 'mcp_bridge_pairing_reload_failed' });
    }
  });
}

async function pairMcpBridge() {
  const input = elements.mcpBridgePairingCode;
  const pairingCode = String(input && input.value ? input.value : '').trim();
  if (!MCP_BRIDGE_PAIRING_PATTERN.test(pairingCode)) {
    if (elements.mcpBridgePairingStatus) {
      elements.mcpBridgePairingStatus.textContent = 'Enter the pairing code printed by fsb-mcp-server pair.';
      elements.mcpBridgePairingStatus.setAttribute('role', 'alert');
      elements.mcpBridgePairingStatus.setAttribute('aria-live', 'assertive');
      elements.mcpBridgePairingStatus.setAttribute('aria-atomic', 'true');
    }
    return { success: false, errorCode: 'invalid_pairing_code' };
  }

  const session = typeof chrome !== 'undefined' ? chrome.storage?.session : null;
  if (!session || typeof session.set !== 'function') {
    if (input) input.value = '';
    if (elements.mcpBridgePairingStatus) {
      elements.mcpBridgePairingStatus.textContent = 'Pairing could not be saved. Try again.';
      elements.mcpBridgePairingStatus.setAttribute('role', 'alert');
      elements.mcpBridgePairingStatus.setAttribute('aria-live', 'assertive');
    }
    return { success: false, errorCode: 'pairing_session_storage_unavailable' };
  }

  try {
    const storageWrite = session.set({
      [MCP_BRIDGE_PAIRING_KEY]: { pairingCode: pairingCode, storedAt: Date.now() }
    });
    // The DOM copy is cleared immediately after initiating the trusted session
    // write and before any runtime message or network reconnect begins.
    if (input) input.value = '';
    await Promise.resolve(storageWrite);
  } catch (_error) {
    if (input) input.value = '';
    if (elements.mcpBridgePairingStatus) {
      elements.mcpBridgePairingStatus.textContent = 'Pairing could not be saved. Try again.';
      elements.mcpBridgePairingStatus.setAttribute('role', 'alert');
      elements.mcpBridgePairingStatus.setAttribute('aria-live', 'assertive');
    }
    return { success: false, errorCode: 'pairing_session_storage_failed' };
  }

  const response = await requestMcpBridgePairingReload();
  const status = response && response.success === true
    && Object.prototype.hasOwnProperty.call(MCP_BRIDGE_PAIRING_COPY, response.pairingStatus)
    ? response.pairingStatus
    : 'configured';
  renderMcpBridgePairingStatus(status, status === 'expired');
  return { success: response && response.success === true, pairingStatus: status };
}

async function removeMcpBridgePairing() {
  const input = elements.mcpBridgePairingCode;
  if (input) input.value = '';
  const session = typeof chrome !== 'undefined' ? chrome.storage?.session : null;
  try {
    if (!session || typeof session.remove !== 'function') throw new Error('session unavailable');
    await Promise.resolve(session.remove(MCP_BRIDGE_PAIRING_KEY));
  } catch (_error) {
    if (elements.mcpBridgePairingStatus) {
      elements.mcpBridgePairingStatus.textContent = 'Pairing could not be removed. Try again.';
      elements.mcpBridgePairingStatus.setAttribute('role', 'alert');
      elements.mcpBridgePairingStatus.setAttribute('aria-live', 'assertive');
    }
    return { success: false, errorCode: 'pairing_session_remove_failed' };
  }

  await requestMcpBridgePairingReload();
  if (elements.mcpBridgePairingStatus) {
    elements.mcpBridgePairingStatus.textContent = 'Pairing removed.';
    elements.mcpBridgePairingStatus.setAttribute('role', 'status');
    elements.mcpBridgePairingStatus.setAttribute('aria-live', 'polite');
    elements.mcpBridgePairingStatus.setAttribute('aria-atomic', 'true');
  }
  return { success: true, pairingStatus: 'unpaired' };
}

async function loadMcpBridgePairingStatus() {
  if (elements.mcpBridgePairingCode) elements.mcpBridgePairingCode.value = '';
  const session = typeof chrome !== 'undefined' ? chrome.storage?.session : null;
  if (!session || typeof session.get !== 'function') {
    return renderMcpBridgePairingStatus('unpaired');
  }
  try {
    const stored = await session.get([MCP_BRIDGE_STATE_KEY]);
    const status = stored && stored[MCP_BRIDGE_STATE_KEY]
      ? stored[MCP_BRIDGE_STATE_KEY].pairingStatus
      : 'unpaired';
    return renderMcpBridgePairingStatus(status, status === 'expired');
  } catch (_error) {
    return renderMcpBridgePairingStatus('unpaired');
  }
}

function setProviderEvidenceAnnouncement(message, isAlert = false) {
  const announcement = elements.providerEvidenceAnnouncement;
  if (!announcement) return;
  announcement.textContent = message || '';
  announcement.hidden = !message;
  announcement.setAttribute('role', isAlert ? 'alert' : 'status');
  announcement.setAttribute('aria-live', isAlert ? 'assertive' : 'polite');
}

function getSelectedCompatibilityLabel(helper) {
  if (!helper || providerPanelState.providerKind !== 'agent'
      || !helper.isAgentProvider(providerPanelState.agentProviderId)) return null;
  const model = getProviderCompatibilityModel(helper, providerPanelState.agentProviderId);
  return model ? model.label : null;
}

function clearProviderCompatibilityExpiryTimer() {
  if (providerCompatibilityExpiryHandle === null) return;
  clearTimeout(providerCompatibilityExpiryHandle);
  providerCompatibilityExpiryHandle = null;
}

function beginProviderCompatibilityGeneration() {
  providerCompatibilityGeneration += 1;
  return providerCompatibilityGeneration;
}

function clearProviderEvidenceRefreshDebounce() {
  if (providerEvidenceRefreshDebounceHandle !== null) {
    clearTimeout(providerEvidenceRefreshDebounceHandle);
  }
  providerEvidenceRefreshDebounceHandle = null;
  providerEvidenceRefreshDebounceCompatibilityCheckedAt = null;
}

function discardPendingProviderEvidenceRefresh() {
  clearProviderEvidenceRefreshDebounce();
  providerEvidenceRefreshQueued = false;
  providerEvidenceRefreshQueuedCompatibilityCheckedAt = null;
}

function scheduleProviderCompatibilityExpiry(expiresAt) {
  clearProviderCompatibilityExpiryTimer();
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) return;
  let now;
  try {
    now = Date.now();
  } catch (_error) {
    return;
  }
  if (!Number.isSafeInteger(now) || now < 0) return;
  const delay = Math.max(0, expiresAt - now);
  if (!Number.isSafeInteger(delay) || delay > MAX_TIMEOUT_DELAY_MS) return;
  providerCompatibilityExpiryHandle = setTimeout(() => {
    providerCompatibilityExpiryHandle = null;
    refreshProviderCompatibilityProjection();
  }, delay);
}

function refreshProviderCompatibilityProjection() {
  if (providerEvidenceRefreshPromise) return providerEvidenceRefreshPromise;
  if (providerCompatibilityProjectionPromise) return providerCompatibilityProjectionPromise;
  const helper = getProviderPanelHelper();
  const compatibilityGeneration = beginProviderCompatibilityGeneration();
  let tracked;
  tracked = requestMcpClients(false)
    .then((result) => {
      if (compatibilityGeneration !== providerCompatibilityGeneration) {
        return providerPanelState.clients;
      }
      if (result.refreshOutcome === 'unavailable') {
        throw new Error('provider_compatibility_unavailable');
      }
      const merged = mergeProviderCompatibilityProjection(
        providerPanelState.clients,
        result.clients
      );
      if (!merged) throw new Error('provider_compatibility_unavailable');
      providerPanelState.clients = merged;
      scheduleProviderCompatibilityExpiry(result.compatibilityExpiresAt);
      renderProviderCompatibility();
      if (helper && providerPanelState.providerKind === 'agent'
          && helper.isAgentProvider(providerPanelState.agentProviderId)) {
        renderSelectedAgentCompatibility(helper, providerPanelState.agentProviderId);
      }
      return providerPanelState.clients;
    })
    .catch(() => {
      if (compatibilityGeneration !== providerCompatibilityGeneration) {
        return providerPanelState.clients;
      }
      clearProviderCompatibilityExpiryTimer();
      providerPanelState.clients = projectStaleProviderCompatibility(providerPanelState.clients);
      renderProviderCompatibility();
      if (helper && providerPanelState.providerKind === 'agent'
          && helper.isAgentProvider(providerPanelState.agentProviderId)) {
        renderSelectedAgentCompatibility(helper, providerPanelState.agentProviderId);
      }
      return providerPanelState.clients;
    })
    .finally(() => {
      if (providerCompatibilityProjectionPromise === tracked) {
        providerCompatibilityProjectionPromise = null;
      }
    });
  providerCompatibilityProjectionPromise = tracked;
  return tracked;
}

function refreshProviderEvidence({
  announce = false,
  liveCompatibility = announce,
  preserveManualSuccess = null
} = {}) {
  const wantsLiveCompatibility = liveCompatibility === true;
  if (providerEvidenceRefreshPromise) return providerEvidenceRefreshPromise;

  beginProviderCompatibilityGeneration();
  const helper = getProviderPanelHelper();
  const previousCompatibilityLabel = getSelectedCompatibilityLabel(helper);
  const preserveCurrentSuccess = isCurrentProviderManualSuccess(preserveManualSuccess)
    && providerPanelState.hasSuccessfulEvidence
    && providerPanelState.evidenceStatus === 'ready';
  const manualGeneration = wantsLiveCompatibility
    ? ++providerManualRefreshGeneration
    : null;
  if (manualGeneration !== null) {
    providerManualSuccess = null;
    discardPendingProviderEvidenceRefresh();
    clearProviderCompatibilityExpiryTimer();
  }
  setProviderStatusRefreshing(true);
  if (!preserveCurrentSuccess) {
    providerPanelState.evidenceStatus = 'loading';
    setProviderEvidenceAnnouncement('');
    renderProviderRecommendation();
    renderProviderEvidence();
    renderSelectedAgentDetails();
  }

  providerEvidenceRefreshPromise = requestMcpClients(liveCompatibility === true)
    .then((result) => {
      const resultCheckedAt = getProviderCompatibilityCheckedAt(result.clients);
      const matchingManualSuccess = preserveCurrentSuccess
        && isCurrentProviderManualSuccess(preserveManualSuccess)
        && result.refreshOutcome !== 'unavailable'
        && resultCheckedAt !== null
        && resultCheckedAt >= preserveManualSuccess.checkedAt;
      if (manualGeneration !== null && result.refreshOutcome === 'refreshed'
          && resultCheckedAt !== null) {
        providerManualSuccess = {
          generation: manualGeneration,
          checkedAt: resultCheckedAt
        };
      }
      if (!preserveCurrentSuccess || matchingManualSuccess) {
        providerPanelState.clients = result.clients;
        providerPanelState.hasSuccessfulEvidence = result.refreshOutcome !== 'unavailable';
        providerPanelState.evidenceStatus = matchingManualSuccess
          ? 'ready'
          : (result.refreshOutcome === 'refreshed' ? 'ready' : result.refreshOutcome);
        providerPanelState.recommendation = helper.getRecommendation(result.clients);
        scheduleProviderCompatibilityExpiry(result.compatibilityExpiresAt);
      }
      if (announce && result.refreshOutcome === 'refreshed') {
        const nextCompatibilityLabel = getSelectedCompatibilityLabel(helper);
        const changed = previousCompatibilityLabel && nextCompatibilityLabel
          && previousCompatibilityLabel !== nextCompatibilityLabel;
        const compatibilityText = changed
          ? ` Compatibility is now ${nextCompatibilityLabel}.`
          : '';
        setProviderEvidenceAnnouncement(`Provider status refreshed.${compatibilityText}`);
      } else if (announce) {
        const message = result.refreshOutcome === 'stale'
          ? getCompatibilityRefreshFailureMessage(result.clients)
          : 'Compatibility data is unavailable. Showing Unsupported.';
        setProviderEvidenceAnnouncement(message, true);
      }
      return result.clients;
    })
    .catch(() => {
      if (preserveCurrentSuccess) return providerPanelState.clients;
      clearProviderCompatibilityExpiryTimer();
      if (providerPanelState.hasSuccessfulEvidence) {
        providerPanelState.clients = projectStaleProviderCompatibility(providerPanelState.clients);
        providerPanelState.evidenceStatus = 'stale';
      } else {
        providerPanelState.clients = Object.create(null);
        providerPanelState.evidenceStatus = 'unavailable';
        providerPanelState.recommendation = helper.getRecommendation(providerPanelState.clients);
      }
      if (announce) {
        const message = providerPanelState.evidenceStatus === 'stale'
          ? getCompatibilityRefreshFailureMessage(providerPanelState.clients)
          : 'Compatibility data is unavailable. Showing Unsupported.';
        setProviderEvidenceAnnouncement(message, true);
      }
      return providerPanelState.clients;
    })
    .finally(() => {
      setProviderStatusRefreshing(false);
      renderProviderRecommendation();
      renderProviderEvidence();
      renderSelectedAgentDetails();
      if (preserveCurrentSuccess) consumeProviderManualSuccess(preserveManualSuccess);
      providerEvidenceRefreshPromise = null;
      if (providerEvidenceRefreshQueued) {
        const queuedCheckedAt = providerEvidenceRefreshQueuedCompatibilityCheckedAt;
        providerEvidenceRefreshQueued = false;
        providerEvidenceRefreshQueuedCompatibilityCheckedAt = null;
        refreshProviderEvidence({
          preserveManualSuccess: getProviderManualSuccessToken(queuedCheckedAt)
        });
      }
    });

  return providerEvidenceRefreshPromise;
}

function scheduleProviderEvidenceRefresh(compatibilityCheckedAt = null) {
  beginProviderCompatibilityGeneration();
  if (providerEvidenceRefreshPromise) {
    clearProviderEvidenceRefreshDebounce();
    providerEvidenceRefreshQueued = true;
    providerEvidenceRefreshQueuedCompatibilityCheckedAt = newestProviderCompatibilityCheckedAt(
      providerEvidenceRefreshQueuedCompatibilityCheckedAt,
      compatibilityCheckedAt
    );
    return;
  }
  const debouncedCheckedAt = newestProviderCompatibilityCheckedAt(
    providerEvidenceRefreshDebounceCompatibilityCheckedAt,
    compatibilityCheckedAt
  );
  if (providerEvidenceRefreshDebounceHandle !== null) {
    clearTimeout(providerEvidenceRefreshDebounceHandle);
  }
  providerEvidenceRefreshDebounceCompatibilityCheckedAt = debouncedCheckedAt;
  providerEvidenceRefreshDebounceHandle = setTimeout(() => {
    const debouncedCheckedAt = providerEvidenceRefreshDebounceCompatibilityCheckedAt;
    providerEvidenceRefreshDebounceHandle = null;
    providerEvidenceRefreshDebounceCompatibilityCheckedAt = null;
    if (providerEvidenceRefreshPromise) {
      providerEvidenceRefreshQueued = true;
      providerEvidenceRefreshQueuedCompatibilityCheckedAt = newestProviderCompatibilityCheckedAt(
        providerEvidenceRefreshQueuedCompatibilityCheckedAt,
        debouncedCheckedAt
      );
    } else {
      refreshProviderEvidence({
        preserveManualSuccess: getProviderManualSuccessToken(debouncedCheckedAt)
      });
    }
  }, 100);
}

function renderProviderSelection() {
  const activeKind = providerPanelState.providerKind;
  const activeId = activeKind === 'agent'
    ? providerPanelState.agentProviderId
    : elements.modelProvider?.value;
  const radios = elements.providerSelectionRadios || [];

  Array.prototype.forEach.call(radios, (radio) => {
    const selected = radio.dataset?.providerKind === activeKind
      && radio.dataset?.providerId === activeId;
    radio.checked = selected;
    radio.setAttribute('aria-checked', selected ? 'true' : 'false');
    const row = typeof radio.closest === 'function' ? radio.closest('.provider-row') : null;
    if (row) row.classList.toggle('is-selected', selected);
  });
}

function renderProviderKind() {
  const showAgentDetails = providerPanelState.providerKind === 'agent';
  if (elements.apiProviderDetails) elements.apiProviderDetails.hidden = showAgentDetails;
  if (elements.agentProviderDetails) elements.agentProviderDetails.hidden = !showAgentDetails;
  renderDelegationTrustControl();
}

function runApiProviderSelectionPath(provider, previousSelection, silentIfNoKey) {
  const ui = (typeof globalThis !== 'undefined') ? globalThis.FSBDiscoveryUI : null;
  if (ui && ui.IN_SCOPE_PROVIDERS && ui.IN_SCOPE_PROVIDERS[provider]) {
    const discoveryOptions = { previousSelection: previousSelection };
    if (silentIfNoKey) discoveryOptions.silentIfNoKey = true;
    ui.runDiscovery(provider, discoveryOptions);
  } else {
    updateModelOptions(provider);
  }
  updateApiKeyVisibility(provider);
}

function invalidateProviderDiscovery(restoreUi) {
  const ui = (typeof globalThis !== 'undefined') ? globalThis.FSBDiscoveryUI : null;
  if (ui && typeof ui.invalidateDiscovery === 'function') {
    ui.invalidateDiscovery({ restoreUi: restoreUi === true });
  }
}

function cancelPendingProviderSettingsModelLoad() {
  providerSettingsLoadGeneration += 1;
  if (providerSettingsModelLoadTimer !== null) {
    clearTimeout(providerSettingsModelLoadTimer);
    providerSettingsModelLoadTimer = null;
  }
}

function setProviderSelection(kind, id, { markDirty = true } = {}) {
  const helper = getProviderPanelHelper();
  if (!helper) return false;
  const validSelection = kind === 'api'
    ? helper.isApiProvider(id)
    : (kind === 'agent' && helper.isAgentProvider(id));
  if (!validSelection) return false;
  if (markDirty) cancelPendingProviderSettingsModelLoad();
  const previousKind = providerPanelState.providerKind;
  const previousId = previousKind === 'agent'
    ? providerPanelState.agentProviderId
    : elements.modelProvider?.value;
  if (previousKind !== kind || previousId !== id) {
    invalidateProviderDiscovery(kind === 'agent');
  }

  if (kind === 'api') {
    const previousSelection = elements.modelName?.value;
    providerPanelState.providerKind = 'api';
    if (elements.modelProvider) elements.modelProvider.value = id;
    runApiProviderSelectionPath(id, previousSelection, !markDirty);
  } else if (kind === 'agent') {
    providerPanelState.providerKind = 'agent';
    providerPanelState.agentProviderId = id;
  }

  renderProviderSelection();
  renderProviderKind();
  renderSelectedAgentDetails();
  if (markDirty) markUnsavedChanges();
  return true;
}

function setupEventListeners() {
  // Navigation
  elements.navItems.forEach(item => {
    item.addEventListener('click', () => switchSection(item.dataset.section));
  });
  
  // Theme mode segmented control (System/Dark/Light). Delegated click, same
  // shape as the consentDefaultModeToggle wiring below.
  if (elements.themeModeToggle) {
    elements.themeModeToggle.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.detail-btn[data-theme-mode]') : null;
      if (!btn) return;
      const mode = btn.dataset.themeMode;
      if (!mode) return;
      setThemePreference(mode);
      showToast(`${mode} theme`, 'info');
    });
  }

  // One delegated handler covers click and keyboard-driven native-radio
  // changes. Selection stays in form state until the existing Save action.
  if (elements.providerRoster) {
    elements.providerRoster.addEventListener('change', (event) => {
      const radio = event.target;
      if (!radio || radio.name !== 'fsbProviderSelection') return;
      setProviderSelection(radio.dataset?.providerKind, radio.dataset?.providerId);
    });
  }
  if (elements.refreshProviderStatusBtn) {
    elements.refreshProviderStatusBtn.addEventListener('click', () => {
      refreshProviderEvidence({ announce: true });
    });
  }
  if (elements.openAgentSetupGuideBtn) {
    elements.openAgentSetupGuideBtn.addEventListener('click', openAgentSetupGuide);
  }
  if (elements.pairMcpBridgeBtn) {
    elements.pairMcpBridgeBtn.addEventListener('click', pairMcpBridge);
  }
  if (elements.removeMcpBridgePairingBtn) {
    elements.removeMcpBridgePairingBtn.addEventListener('click', removeMcpBridgePairing);
  }
  if (elements.delegationTrustClearBtn) {
    elements.delegationTrustClearBtn.addEventListener('click', clearDelegationTrust);
  }

  // Form inputs change detection
  const formInputs = [
    elements.apiKey,
    elements.geminiApiKey,
    document.getElementById('openaiApiKey'),
    document.getElementById('anthropicApiKey'),
    document.getElementById('customApiKey'),
    document.getElementById('customEndpoint'),
    elements.maxIterations,
    elements.debugMode,
    elements.domOptimization,
    elements.maxDOMElements,
    elements.elementCacheSize,
    elements.prioritizeViewport,
    elements.animatedActionHighlights,
    elements.showSidepanelProgress,
    elements.enableLogin,
    elements.captchaSolverEnabled,
    elements.captchaApiKey,
    elements.sttProvider
  ];

  formInputs.forEach(input => {
    if (input) {
      const eventType = input.type === 'checkbox' || input.type === 'radio' ? 'change' : 'input';
      input.addEventListener(eventType, () => markUnsavedChanges());
    }
  });

  // Max iterations slider with display update
  if (elements.maxIterationsSlider) {
    elements.maxIterationsSlider.addEventListener('input', (e) => {
      const value = e.target.value;
      if (elements.maxIterations) elements.maxIterations.value = value;
      if (elements.maxIterationsDisplay) elements.maxIterationsDisplay.textContent = value;
      markUnsavedChanges();
    });
  }

  // Max DOM elements slider with display update
  if (elements.maxDOMElementsSlider) {
    elements.maxDOMElementsSlider.addEventListener('input', (e) => {
      const value = e.target.value;
      if (elements.maxDOMElements) elements.maxDOMElements.value = value;
      if (elements.maxDOMElementsDisplay) elements.maxDOMElementsDisplay.textContent = value;
      markUnsavedChanges();
    });
  }

  // Element Cache Size preset dropdown
  if (elements.elementCacheSizePreset) {
    elements.elementCacheSizePreset.addEventListener('change', (e) => {
      const value = e.target.value;
      if (value === 'custom') {
        if (elements.elementCacheSizeCustomWrap) elements.elementCacheSizeCustomWrap.style.display = '';
        elements.elementCacheSizeCustom.focus();
      } else {
        if (elements.elementCacheSizeCustomWrap) elements.elementCacheSizeCustomWrap.style.display = 'none';
        elements.elementCacheSize.value = value;
        if (elements.elementCacheSizeDisplay) {
          elements.elementCacheSizeDisplay.textContent = value;
        }
      }
      markUnsavedChanges();
    });
  }

  // Element Cache Size custom input
  if (elements.elementCacheSizeCustom) {
    elements.elementCacheSizeCustom.addEventListener('input', (e) => {
      let value = parseInt(e.target.value);
      if (Number.isFinite(value)) {
        value = Math.max(10, Math.min(1000, value));
        elements.elementCacheSize.value = value;
        if (elements.elementCacheSizeDisplay) {
          elements.elementCacheSizeDisplay.textContent = value;
        }
      }
      markUnsavedChanges();
    });
  }

  // Phase 241 D-05 / POOL-05 / POOL-06: Agent Concurrency cap input + reset.
  // Real-time clamp: parseInt -> 1..64 integer; non-numeric -> recommended default.
  // Defense-in-depth layer 2 (HTML min/max is layer 1; SW setCap is layer 3).
  if (elements.fsbAgentCap) {
    elements.fsbAgentCap.addEventListener('input', (e) => {
      // Phase 243 Plan 04 / UI-03: toggle the inline validation hint based on
      // the RAW typed value (before clamp) so the user gets immediate feedback
      // when they enter 0, 65, or non-numeric input. The clamp below still
      // normalizes the persisted value (defense-in-depth layer 2).
      const rawValue = e.target.value;
      const validationEl = elements.fsbAgentCapValidation;
      if (validationEl && typeof isCapInputInvalid === 'function') {
        validationEl.style.display = isCapInputInvalid(rawValue) ? 'block' : 'none';
      }

      let raw = parseInt(rawValue, 10);
      raw = clampAgentCapValue(raw, fsbRecommendedAgentCap);
      if (e.target.value !== String(raw)) e.target.value = String(raw);
      if (elements.fsbAgentCapDisplay) {
        elements.fsbAgentCapDisplay.textContent = String(raw);
      }
      // Phase 243 Plan 04 / UI-03: refresh the counter so "X of M active"
      // tracks the in-progress (unsaved) cap value while the user types.
      if (typeof refreshActiveAgentCount === 'function') {
        refreshActiveAgentCount();
      }
      markUnsavedChanges();
    });
  }
  if (elements.fsbAgentCapReset) {
    elements.fsbAgentCapReset.addEventListener('click', () => {
      setAgentCapControlValue(fsbRecommendedAgentCap);
      // Phase 243 Plan 04 / UI-03: hide validation + refresh counter on reset.
      if (elements.fsbAgentCapValidation) {
        elements.fsbAgentCapValidation.style.display = 'none';
      }
      if (typeof refreshActiveAgentCount === 'function') {
        refreshActiveAgentCount();
      }
      markUnsavedChanges();
    });
  }

  // Trigger Concurrency cap input + reset. Mirrors Agent Concurrency while
  // keeping trigger storage/counter keys separate.
  if (elements.fsbTriggerCap) {
    elements.fsbTriggerCap.addEventListener('input', (e) => {
      const rawValue = e.target.value;
      const validationEl = elements.fsbTriggerCapValidation;
      if (validationEl && typeof isCapInputInvalid === 'function') {
        validationEl.style.display = isCapInputInvalid(rawValue) ? 'block' : 'none';
      }

      let raw = parseInt(rawValue, 10);
      if (!Number.isFinite(raw)) raw = 8;
      if (raw < 1) raw = 1;
      if (raw > 64) raw = 64;
      if (e.target.value !== String(raw)) e.target.value = String(raw);
      if (elements.fsbTriggerCapDisplay) {
        elements.fsbTriggerCapDisplay.textContent = String(raw);
      }
      if (typeof refreshActiveTriggerCount === 'function') {
        refreshActiveTriggerCount();
      }
      markUnsavedChanges();
    });
  }
  if (elements.fsbTriggerCapReset) {
    elements.fsbTriggerCapReset.addEventListener('click', () => {
      if (elements.fsbTriggerCap) {
        elements.fsbTriggerCap.value = '8';
        refreshStepper(elements.fsbTriggerCap);
      }
      if (elements.fsbTriggerCapDisplay) elements.fsbTriggerCapDisplay.textContent = '8';
      if (elements.fsbTriggerCapValidation) {
        elements.fsbTriggerCapValidation.style.display = 'none';
      }
      if (typeof refreshActiveTriggerCount === 'function') {
        refreshActiveTriggerCount();
      }
      markUnsavedChanges();
    });
  }

  // Phase 245 D-07: Action Change Reports toggle. Mirror the cap-toggle
  // pattern: change handler marks unsaved; saveSettings/loadSettings handle
  // persistence below.
  if (elements.fsbChangeReportsEnabled) {
    elements.fsbChangeReportsEnabled.addEventListener('change', () => {
      markUnsavedChanges();
    });
  }

  // Phase 243 Plan 04 / UI-03: subscribe chrome.storage.onChanged so the
  // live current-active counter refreshes whenever the registry envelope
  // mutates (session/fsbAgentRegistry, written by Phase 237's write-through)
  // OR the cap value persists (local/fsbAgentCap, written by saveSettings).
  // Debounced 100ms (Pitfall 4) so bulk registry writes during ramp-up
  // collapse to a single counter refresh.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged
      && typeof chrome.storage.onChanged.addListener === 'function') {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes && changes.fsbAgentRegistry) {
        scheduleRefreshActiveAgentCount();
        scheduleProviderEvidenceRefresh();
      } else if (area === 'session' && changes && changes.mcpBridgeState) {
        const nextState = changes.mcpBridgeState.newValue;
        const nextStatus = nextState && nextState.pairingStatus;
        renderMcpBridgePairingStatus(nextStatus, nextStatus === 'expired');
      } else if (area === 'local' && changes && changes.fsbAgentProviders) {
        scheduleProviderEvidenceRefresh(
          getProviderStorageCompatibilityCheckedAt(changes.fsbAgentProviders)
        );
      } else if (area === 'local' && changes && changes.fsbAgentCap) {
        scheduleRefreshActiveAgentCount();
      } else if (area === 'session' && changes && changes.fsbTriggerRegistry) {
        scheduleRefreshActiveTriggerCount();
      } else if (area === 'local' && changes && changes.fsbTriggerCap) {
        scheduleRefreshActiveTriggerCount();
      } else if (area === 'local' && changes
          && (changes.fsbConsentPolicies || changes.fsbAuditLog)) {
        // Phase 30 (GOV-07): re-render the Consent & Audit section when the
        // consent envelope or the audit ring changes (e.g. the gate appended an
        // outcome, or another control-panel tab edited a policy). Debounced.
        scheduleRenderConsentAudit();
      }
    });
  }

  // Phase 30 (GOV-07): Consent & Audit wiring. Consent/audit state lives in its
  // OWN stores (consent-policy-store.js, audit-log.js), NOT defaultSettings, so
  // these controls deliberately do NOT join the formInputs Save-bar array -- they
  // persist immediately on change. The per-origin rows + pending rows are cloned
  // by renderConsentAudit(); their controls are wired via event delegation so
  // dynamically-added rows are covered without re-binding.
  if (elements.auditExportBtn) {
    elements.auditExportBtn.addEventListener('click', exportAuditLog);
  }
  if (elements.auditClearBtn) {
    elements.auditClearBtn.addEventListener('click', clearAuditLog);
  }
  // Per-origin Off/Ask/Auto segmented control (delegated): write the mode to the
  // consent store for that exact origin only.
  if (elements.consentOriginList) {
    elements.consentOriginList.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.detail-btn[data-mode]') : null;
      if (!btn || btn.disabled) return;
      const row = btn.closest('.consent-origin-row');
      const origin = row && row.dataset ? row.dataset.origin : '';
      const mode = btn.dataset ? btn.dataset.mode : '';
      if (!origin || !mode) return;
      const store = (typeof globalThis !== 'undefined') ? globalThis.FsbConsentPolicyStore : null;
      if (store && typeof store.setOriginMode === 'function') {
        Promise.resolve(store.setOriginMode(origin, mode)).then(() => {
          scheduleRenderConsentAudit();
        });
      }
    });
    // Per-origin elevated mutating opt-in (delegated change).
    elements.consentOriginList.addEventListener('change', (e) => {
      const input = e.target;
      if (!input || !input.classList || !input.classList.contains('consent-mutating-input')) return;
      const row = input.closest('.consent-origin-row');
      const origin = row && row.dataset ? row.dataset.origin : '';
      if (!origin) return;
      const store = (typeof globalThis !== 'undefined') ? globalThis.FsbConsentPolicyStore : null;
      if (store && typeof store.setOriginMutating === 'function') {
        Promise.resolve(store.setOriginMutating(origin, !!input.checked)).then(() => {
          scheduleRenderConsentAudit();
        });
      }
    });
  }
  // Global "Default for new sites" segmented control (delegated): writes the
  // global defaultMode to the consent store, then re-renders so per-origin
  // effective modes update. Uses data-default-mode (distinct from the per-origin
  // data-mode handler above).
  if (elements.consentDefaultModeToggle) {
    elements.consentDefaultModeToggle.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.detail-btn[data-default-mode]') : null;
      if (!btn || btn.disabled) return;
      const mode = btn.dataset ? btn.dataset.defaultMode : '';
      if (!mode) return;
      const store = (typeof globalThis !== 'undefined') ? globalThis.FsbConsentPolicyStore : null;
      if (store && typeof store.setDefaultMode === 'function') {
        Promise.resolve(store.setDefaultMode(mode)).then(() => {
          scheduleRenderConsentAudit();
        });
      }
    });
  }
  // Pending Grant / Deny (delegated): Grant writes consent for that exact
  // origin/scope only (T-30-16); Deny removes the row without granting.
  if (elements.pendingRequestList) {
    elements.pendingRequestList.addEventListener('click', (e) => {
      const target = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!target) return;
      const row = target.closest('.pending-request-row');
      if (!row) return;
      if (target.classList.contains('pending-grant-btn')) {
        grantPendingRequest(row);
      } else if (target.classList.contains('pending-deny-btn')) {
        denyPendingRequest(row);
      }
    });
  }

  // Model provider change
  if (elements.modelProvider) {
    elements.modelProvider.addEventListener('change', (e) => {
      const provider = e.target.value;
      // Phase 228 / Plan 02: in-scope providers route through dynamic discovery;
      // out-of-scope (lmstudio, custom) keep their existing flows.
      const ui = (typeof globalThis !== 'undefined') ? globalThis.FSBDiscoveryUI : null;
      if (ui && ui.IN_SCOPE_PROVIDERS && ui.IN_SCOPE_PROVIDERS[provider]) {
        ui.runDiscovery(provider, { previousSelection: elements.modelName?.value });
      } else {
        updateModelOptions(provider);
      }
      updateApiKeyVisibility(provider);
      markUnsavedChanges();
    });
  }

  // Phase 228 / Plan 02: API-key inputs trigger debounced discovery for the
  // selected provider. We attach to all 5 in-scope key inputs once at wiring
  // time; the handler is a no-op if the user is currently on a different
  // provider (we still re-discover when they switch back via provider-change).
  (function wireDiscoveryKeyInputs() {
    const ui = (typeof globalThis !== 'undefined') ? globalThis.FSBDiscoveryUI : null;
    if (!ui) return;
    Object.keys(ui.IN_SCOPE_PROVIDERS).forEach((provider) => {
      const inputId = ui.IN_SCOPE_PROVIDERS[provider];
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('input', () => {
        if (elements.modelProvider && elements.modelProvider.value !== provider) return;
        ui.scheduleDiscoveryFromKeyChange(provider);
      });
    });
  })();

  // Phase 228 / Plan 02: Refresh button — bypasses cache via force=true.
  const refreshBtn = document.getElementById('refreshModelsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const provider = elements.modelProvider?.value;
      const ui = (typeof globalThis !== 'undefined') ? globalThis.FSBDiscoveryUI : null;
      if (!ui || !ui.IN_SCOPE_PROVIDERS[provider]) {
        // Out-of-scope providers — fall through to legacy refresh path.
        if (provider) updateModelOptions(provider);
        return;
      }
      ui.runDiscovery(provider, { force: true, previousSelection: elements.modelName?.value });
    });
  }

  // Unified model combobox: a searchable dropdown rendered over the (now
  // hidden) #modelName select. It owns search/filter + selection, while the
  // native select stays the value source of truth that discovery and the
  // legacy provider flows keep writing into.
  if (typeof globalThis !== 'undefined' && globalThis.FSBModelCombobox) {
    globalThis.FSBModelCombobox.init();
  }
  
  // Model name change
  if (elements.modelName) {
    elements.modelName.addEventListener('change', (e) => {
      markUnsavedChanges();
    });
  }
  
  // Password visibility toggles
  if (elements.toggleApiKey) {
    elements.toggleApiKey.addEventListener('click', () => togglePasswordVisibility('apiKey'));
  }
  
  const toggleGeminiApiKey = document.getElementById('toggleGeminiApiKey');
  if (toggleGeminiApiKey) {
    toggleGeminiApiKey.addEventListener('click', () => togglePasswordVisibility('geminiApiKey'));
  }
  
  const toggleOpenaiApiKey = document.getElementById('toggleOpenaiApiKey');
  if (toggleOpenaiApiKey) {
    toggleOpenaiApiKey.addEventListener('click', () => togglePasswordVisibility('openaiApiKey'));
  }
  
  const toggleAnthropicApiKey = document.getElementById('toggleAnthropicApiKey');
  if (toggleAnthropicApiKey) {
    toggleAnthropicApiKey.addEventListener('click', () => togglePasswordVisibility('anthropicApiKey'));
  }
  
  const toggleCustomApiKey = document.getElementById('toggleCustomApiKey');
  if (toggleCustomApiKey) {
    toggleCustomApiKey.addEventListener('click', () => togglePasswordVisibility('customApiKey'));
  }

  const toggleOpenrouterApiKey = document.getElementById('toggleOpenrouterApiKey');
  if (toggleOpenrouterApiKey) {
    toggleOpenrouterApiKey.addEventListener('click', () => togglePasswordVisibility('openrouterApiKey'));
  }

  // Re-fetch LM Studio models when base URL changes
  const lmstudioBaseUrl = document.getElementById('lmstudioBaseUrl');
  if (lmstudioBaseUrl) {
    let debounceTimer;
    lmstudioBaseUrl.addEventListener('input', () => {
      markUnsavedChanges();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (elements.modelProvider?.value === 'lmstudio') {
          updateModelOptions('lmstudio');
        }
      }, 800);
    });
  }

  // CAPTCHA Solver toggle visibility
  if (elements.captchaSolverEnabled) {
    elements.captchaSolverEnabled.addEventListener('change', (e) => {
      updateCaptchaSolverVisibility(e.target.checked);
      markUnsavedChanges();
    });
  }

  if (elements.toggleCaptchaApiKey) {
    elements.toggleCaptchaApiKey.addEventListener('click', () => togglePasswordVisibility('captchaApiKey'));
  }

  // API test
  if (elements.fullApiTest) {
    elements.fullApiTest.addEventListener('click', runFullApiTest);
  }
  
  // Save bar
  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', saveSettings);
  }
  
  if (elements.discardBtn) {
    elements.discardBtn.addEventListener('click', discardChanges);
  }
  
  // Logs controls
  if (elements.clearLogs) {
    elements.clearLogs.addEventListener('click', clearLogs);
  }
  
  if (elements.exportLogs) {
    elements.exportLogs.addEventListener('click', exportLogs);
  }
  
  if (elements.logLevel) {
    elements.logLevel.addEventListener('change', filterLogs);
  }
  
  // Chart time range selector
  const chartTimeRange = document.getElementById('chartTimeRange');
  if (chartTimeRange) {
    chartTimeRange.addEventListener('change', (e) => {
      if (analytics) {
        const timeRange = e.target.value;
        analytics.updateChart(timeRange);
        analytics.updateDashboardWithTimeRange(timeRange);
        loadDashboardCostBreakdown();
      }
    });
  }
  
  // Debug controls
  const testTrackingBtn = document.getElementById('testTrackingBtn');
  const viewStorageBtn = document.getElementById('viewStorageBtn');
  const clearDataBtn = document.getElementById('clearDataBtn');
  const exportDataBtn = document.getElementById('exportDataBtn');
  
  if (testTrackingBtn) {
    testTrackingBtn.addEventListener('click', testTokenTracking);
  }
  
  if (viewStorageBtn) {
    viewStorageBtn.addEventListener('click', viewStorageData);
  }
  
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', clearAnalyticsData);
  }
  
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', exportAnalyticsData);
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // Window beforeunload
  window.addEventListener('beforeunload', (e) => {
    if (dashboardState.hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  
  // PERF: Debounced storage change listener for reactive analytics updates
  let _analyticsRefreshTimer = null;
  // Memory auto-refresh on storage changes
  let _memoryRefreshTimer = null;
  let _memoryRefreshInProgress = false;
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.fsbUsageData || changes.fsbCurrentModel) {
        // Only refresh if the dashboard section is currently visible
        if (dashboardState.currentSection !== 'dashboard') return;

        clearTimeout(_analyticsRefreshTimer);
        _analyticsRefreshTimer = setTimeout(() => {
          if (analytics && analytics.initialized) {
            analytics.loadStoredData().then(() => {
              analytics.updateDashboard();
              loadDashboardCostBreakdown();
              if (analytics.chart) {
                const timeRange = document.getElementById('chartTimeRange')?.value || '24h';
                analytics.updateChart(timeRange);
              }
            });
          }
        }, 2000);
      }

      // Auto-refresh Memory tab when fsb_memories changes
      if (changes.fsb_memories) {
        // Only refresh if memory section is currently visible
        if (dashboardState.currentSection !== 'memory') return;

        // Prevent refresh loops: skip if a refresh is already in progress
        if (_memoryRefreshInProgress) return;

        clearTimeout(_memoryRefreshTimer);
        _memoryRefreshTimer = setTimeout(async () => {
          _memoryRefreshInProgress = true;
          try {
            await _smartMemoryRefresh();
          } finally {
            _memoryRefreshInProgress = false;
          }
        }, 1000); // 1 second debounce to batch rapid updates
      }
    }
  });
}

// Wires every minus/value/plus numeric stepper (.fsb-stepper) on the page.
// Each wrapper's data-min/data-max/data-step drive clamping; committing a
// value dispatches a real bubbling 'input' event on the inner
// .fsb-stepper__input so it flows through that field's own pre-existing
// per-field listener exactly as native typing/dragging did before -- this
// function never touches per-field save/validation logic directly.
// Disables a stepper's -/+ buttons exactly at its data-min/data-max. Standalone
// (not nested in initFsbSteppers()) so external code that sets a stepper's
// value directly -- e.g. the Agent/Trigger Cap reset buttons -- can re-sync
// the disabled state after bypassing nudge()/apply().
function refreshStepper(input) {
  const box = input.closest('.fsb-stepper');
  if (!box) return;
  const min = parseFloat(box.getAttribute('data-min'));
  const max = parseFloat(box.getAttribute('data-max'));
  const n = parseFloat(input.value);
  const dec = box.querySelector('.fsb-stepper__btn--dec');
  const inc = box.querySelector('.fsb-stepper__btn--inc');
  if (dec) dec.disabled = !Number.isNaN(n) && !Number.isNaN(min) && n <= min;
  if (inc) inc.disabled = !Number.isNaN(n) && !Number.isNaN(max) && n >= max;
}

function initFsbSteppers() {
  document.querySelectorAll('.fsb-stepper').forEach((box) => {
    const input = box.querySelector('.fsb-stepper__input');
    if (!input) return;
    const decBtn = box.querySelector('.fsb-stepper__btn--dec');
    const incBtn = box.querySelector('.fsb-stepper__btn--inc');
    let min = parseFloat(box.getAttribute('data-min')); if (Number.isNaN(min)) min = -Infinity;
    let max = parseFloat(box.getAttribute('data-max')); if (Number.isNaN(max)) max = Infinity;
    const step = parseFloat(box.getAttribute('data-step')) || 1;
    let holdTimeout = null, holdInterval = null;

    function clamp(v) {
      if (Number.isNaN(v)) v = (min === -Infinity ? 0 : min);
      return Math.min(max, Math.max(min, v));
    }
    function apply(v) {
      input.value = String(clamp(v));
      refreshStepper(input);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function stop() {
      clearTimeout(holdTimeout); clearInterval(holdInterval);
      holdTimeout = null; holdInterval = null;
    }
    function nudge(dir) {
      let n = parseFloat(input.value); if (Number.isNaN(n)) n = (min === -Infinity ? 0 : min);
      const next = clamp(n + dir * step);
      apply(next);
      if (next === n) stop();
    }
    function press(dir) {
      return (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        e.preventDefault();
        nudge(dir);
        stop();
        holdTimeout = setTimeout(() => {
          holdInterval = setInterval(() => { nudge(dir); }, 90);
        }, 420);
      };
    }
    function key(dir) {
      return (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); nudge(dir); }
      };
    }

    if (decBtn) {
      decBtn.addEventListener('mousedown', press(-1));
      decBtn.addEventListener('touchstart', press(-1), { passive: false });
      decBtn.addEventListener('keydown', key(-1));
    }
    if (incBtn) {
      incBtn.addEventListener('mousedown', press(1));
      incBtn.addEventListener('touchstart', press(1), { passive: false });
      incBtn.addEventListener('keydown', key(1));
    }
    [decBtn, incBtn].forEach((b) => {
      if (!b) return;
      ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach((ev) => b.addEventListener(ev, stop));
    });

    // ArrowUp/ArrowDown on the input itself, digit-only filtering on every
    // keystroke, and clamp-on-blur (not every keystroke, so the user can
    // freely pass through intermediate values like "5" on the way to "50").
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
    });
    input.addEventListener('input', () => {
      const v = input.value.replace(/[^0-9]/g, '');
      if (v !== input.value) input.value = v;
      refreshStepper(input);
    });
    input.addEventListener('blur', () => {
      const n = parseFloat(input.value);
      if (input.value === '' || n !== clamp(n)) {
        apply(Number.isNaN(n) ? (min === -Infinity ? 0 : min) : n);
      } else {
        refreshStepper(input);
      }
    });

    refreshStepper(input);
  });
}

// Magnetic-dock hover for the sidebar rail: the item under the cursor expands
// fully, immediate neighbors partially expand, falling off with a Gaussian
// curve. Inline styles are written with 'important' so they reliably win over
// the resting :hover CSS while active, and are cleared on mouseleave so CSS
// regains control of the (already-correct) resting/simple-hover states.
function initSidebarProximity() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const items = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
  if (!items.length) return;

  // Wrap each label's own content so the text can fade on a stricter
  // threshold than the pill it lives in (only the truly-hovered item should
  // ever reveal readable text).
  items.forEach((it) => {
    const sp = it.querySelector('span');
    if (!sp || sp.querySelector('.nav-label')) return;
    const lab = document.createElement('span');
    lab.className = 'nav-label';
    while (sp.firstChild) { lab.appendChild(sp.firstChild); }
    sp.appendChild(lab);
  });

  const COMPACT = 56, FULL = 232, SIGMA = 42, STEEP = 5;
  let centers = [];
  let raf = null;
  let curY = null;

  function measure() {
    centers = items.map((it) => {
      const r = it.getBoundingClientRect();
      return { c: r.top + r.height / 2, top: r.top, bottom: r.bottom };
    });
  }

  function render() {
    raf = null;
    if (curY == null) return;
    measure();
    let hi = -1;
    for (let k = 0; k < centers.length; k++) {
      if (curY >= centers[k].top && curY <= centers[k].bottom) { hi = k; break; }
    }
    items.forEach((it, i) => {
      const d = Math.abs(curY - centers[i].c);
      let f = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      if (i === hi) f = 1;
      const w = COMPACT + Math.pow(f, STEEP) * (FULL - COMPACT);
      const sp = it.querySelector('span');
      const lab = sp && sp.querySelector('.nav-label');
      if (sp) {
        sp.style.setProperty('width', w.toFixed(1) + 'px', 'important');
        sp.style.setProperty('opacity', (i === hi ? 1 : Math.min(1, f * 1.55)).toFixed(3), 'important');
      }
      if (lab) {
        const lo = (i === hi) ? 1 : Math.max(0, (f - 0.86) / 0.14);
        lab.style.setProperty('opacity', Math.min(1, lo).toFixed(3), 'important');
      }
      it.style.setProperty('z-index', String(100 + Math.round(f * 100)), 'important');
    });
  }

  nav.addEventListener('mouseenter', measure);
  nav.addEventListener('mousemove', (e) => {
    if (!centers.length) measure();
    curY = e.clientY;
    if (raf == null) raf = requestAnimationFrame(render);
  });
  window.addEventListener('resize', () => { centers = []; });
  nav.addEventListener('mouseleave', () => {
    curY = null;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    items.forEach((it) => {
      const sp = it.querySelector('span');
      const lab = sp && sp.querySelector('.nav-label');
      if (sp) { sp.style.removeProperty('width'); sp.style.removeProperty('opacity'); }
      if (lab) lab.style.removeProperty('opacity');
      it.style.removeProperty('z-index');
    });
  });
}

// Guards the single document-level "close on outside click" listener below so
// it's attached at most once, no matter how many times initFsbSelects() runs.
let _fsbSelectOutsideClickBound = false;

// Progressively enhances every native <select class="form-select">/
// .chart-select> into a custom .fsb-select dropdown (styled button + custom
// listbox). The native <select> stays in the DOM, hidden, as the source of
// truth -- picking a custom option sets its .value and redispatches a real
// 'change' event, so every existing change-listener elsewhere keeps working
// untouched. modelName is excluded (it's the model-combobox's own hidden
// native select), as is modelProvider (the visible Providers radio roster
// mirrors that compatibility select).
// After loadSettings' async storage callback assigns `.value` on the underlying
// native <select>s, call this to bring the wrapped custom-select labels back
// into sync. Uses each select's already-attached `sync()` (stashed on the DOM
// via `sel._fsbSyncLabel`), so no new listeners fire -- the alternative,
// dispatching a synthetic `change` event, would also trigger the app-level
// change handler at line ~607 which calls `markUnsavedChanges()`, incorrectly
// dirtying the settings form on page load.
function syncFsbSelectLabels() {
  document.querySelectorAll('.form-select[data-enh="1"], .chart-select[data-enh="1"]').forEach((sel) => {
    if (typeof sel._fsbSyncLabel === 'function') sel._fsbSyncLabel();
  });
}

function initFsbSelects() {
  document.querySelectorAll('.form-select, .chart-select').forEach((sel) => {
    if (sel.getAttribute('data-enh') === '1'
        || sel.classList.contains('model-combobox__native')
        || sel.classList.contains('provider-roster__native')) return;
    sel.setAttribute('data-enh', '1');
    sel.style.display = 'none';

    const small = sel.classList.contains('small') || sel.classList.contains('chart-select');
    const wrap = document.createElement('div');
    wrap.className = 'fsb-select' + (small ? ' fsb-select--sm' : '');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fsb-select__btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    const lbl = document.createElement('span');
    lbl.className = 'fsb-select__label';
    const chev = document.createElement('i');
    chev.className = 'fas fa-chevron-down fsb-select__chev';
    btn.appendChild(lbl);
    btn.appendChild(chev);
    const menu = document.createElement('ul');
    menu.className = 'fsb-select__menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    function setOpen(open) {
      menu.hidden = !open;
      btn.classList.toggle('is-open', open);
      chev.classList.toggle('fa-chevron-up', open);
      chev.classList.toggle('fa-chevron-down', !open);
    }
    function sync() {
      const v = sel.value;
      Array.prototype.slice.call(menu.children).forEach((li) => {
        li.classList.toggle('is-selected', li.getAttribute('data-value') === v);
      });
      const sl = menu.querySelector('.is-selected');
      if (sl) lbl.textContent = sl.textContent;
    }
    // Stash sync() on the native <select> DOM node so an external caller
    // (see syncFsbSelectLabels above) can re-run label reconciliation after
    // an async `.value =` assignment without dispatching a `change` event.
    sel._fsbSyncLabel = sync;
    function pick(val) {
      sel.value = val;
      sync();
      setOpen(false);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    Array.prototype.slice.call(sel.options).forEach((o) => {
      const li = document.createElement('li');
      li.className = 'fsb-select__opt';
      li.setAttribute('role', 'option');
      li.textContent = o.textContent;
      li.setAttribute('data-value', o.value);
      if (o.disabled) li.classList.add('is-disabled');
      if (o.selected) { li.classList.add('is-selected'); lbl.textContent = o.textContent; }
      li.addEventListener('click', () => { if (o.disabled) return; pick(o.value); });
      menu.appendChild(li);
    });
    if (!lbl.textContent && sel.options[0]) lbl.textContent = sel.options[0].textContent;

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    wrap.appendChild(sel);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      document.querySelectorAll('.fsb-select__menu').forEach((m) => { if (m !== menu) m.hidden = true; });
      document.querySelectorAll('.fsb-select__btn').forEach((b) => { if (b !== btn) b.classList.remove('is-open'); });
      setOpen(willOpen);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
      else if (e.key === 'Escape') { setOpen(false); }
    });
    sel.addEventListener('change', sync);
  });

  if (!_fsbSelectOutsideClickBound) {
    _fsbSelectOutsideClickBound = true;
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.fsb-select').forEach((w) => {
        if (w.contains(e.target)) return;
        const m = w.querySelector('.fsb-select__menu'); if (m) m.hidden = true;
        const b = w.querySelector('.fsb-select__btn'); if (b) b.classList.remove('is-open');
        const c = w.querySelector('.fsb-select__chev');
        if (c) { c.classList.add('fa-chevron-down'); c.classList.remove('fa-chevron-up'); }
      });
    });
  }
}

function setProviderStatusRefreshing(isRefreshing) {
  const button = elements.refreshProviderStatusBtn;
  if (!button) return;
  const refreshing = isRefreshing === true;
  const label = button.querySelector('.provider-roster__refresh-label');
  const pending = button.querySelector('.provider-roster__refresh-pending');
  button.disabled = refreshing;
  button.setAttribute('aria-busy', refreshing ? 'true' : 'false');
  button.classList.toggle('is-refreshing', refreshing);
  if (label) label.hidden = refreshing;
  if (pending) pending.hidden = !refreshing;
}

function normalizeSectionId(sectionId) {
  return sectionId === 'api-config' ? 'providers' : sectionId;
}

function switchSection(sectionId) {
  sectionId = normalizeSectionId(sectionId);

  // Update navigation
  elements.navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });
  
  // Update content sections. Consent & Audit is merged under Advanced Settings:
  // when 'advanced' is active, #consent-audit is shown alongside #advanced.
  elements.contentSections.forEach(section => {
    const active = section.id === sectionId
      || (sectionId === 'advanced' && section.id === 'consent-audit');
    section.classList.toggle('active', active);
  });
  
  dashboardState.currentSection = sectionId;

  if (sectionId === 'providers') {
    refreshProviderEvidence();
  }

  // Render the merged Consent & Audit cards when entering Advanced Settings (they
  // read the consent envelope + audit ring + classify on demand). The stale
  // '#consent-audit' hash also renders for back-compat.
  if (sectionId === 'advanced' || sectionId === 'consent-audit') {
    renderConsentAudit();
  }

  // Update URL hash without scrolling
  history.replaceState(null, null, `#${sectionId}`);
}

function initializeSections() {
  // Check URL hash for initial section
  const hash = normalizeSectionId(window.location.hash.slice(1));
  if (hash && document.getElementById(hash)) {
    switchSection(hash);
  }
  // Phase 213: prime the Sync pill so it has a value even if the user lands on a non-Sync section first.
  try { initializeSyncSection(); } catch (e) { /* benign */ }
}

// Update model options based on provider
function updateModelOptions(provider) {
  const modelSelect = elements.modelName;
  if (!modelSelect) return;
  
  // Clear existing options
  modelSelect.innerHTML = '';
  
  // LM Studio: fetch models dynamically from local server
  if (provider === 'lmstudio') {
    const loadingOption = document.createElement('option');
    loadingOption.value = '';
    loadingOption.textContent = 'Discovering models...';
    modelSelect.appendChild(loadingOption);
    updateModelDescription('Connecting to LM Studio server...');

    const baseUrlInput = document.getElementById('lmstudioBaseUrl');
    const rawUrl = baseUrlInput?.value || 'http://localhost:1234';
    // Normalize: strip /v1 suffixes, ensure http://
    let baseUrl = rawUrl.trim();
    baseUrl = baseUrl.replace(/\/v1\/chat\/completions\/?$/, '');
    baseUrl = baseUrl.replace(/\/v1\/?$/, '');
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = 'http://' + baseUrl;
    const modelsEndpoint = baseUrl + '/v1/models';

    fetch(modelsEndpoint)
      .then(res => res.json())
      .then(data => {
        modelSelect.innerHTML = '';
        const seen = new Set();
        const ids = [];
        if (data && Array.isArray(data.data)) {
          for (const entry of data.data) {
            if (entry && entry.id && !seen.has(entry.id)) {
              seen.add(entry.id);
              ids.push(entry.id);
            }
          }
        }
        if (ids.length === 0) {
          const noModel = document.createElement('option');
          noModel.value = '';
          noModel.textContent = 'No models loaded in LM Studio';
          modelSelect.appendChild(noModel);
          updateModelDescription('Start a model in LM Studio, then re-select the provider to refresh.');
          return;
        }
        ids.forEach(id => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = id;
          modelSelect.appendChild(option);
        });
        updateModelDescription('Discovered ' + ids.length + ' model(s) from LM Studio');
      })
      .catch(() => {
        modelSelect.innerHTML = '';
        const errOption = document.createElement('option');
        errOption.value = '';
        errOption.textContent = 'Could not connect to LM Studio';
        modelSelect.appendChild(errOption);
        updateModelDescription('Ensure LM Studio is running with the local server enabled.');
      });
    return;
  }

  // Add options for selected provider
  const models = availableModels[provider] || [];
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    modelSelect.appendChild(option);
  });

  // Update description when model changes
  modelSelect.addEventListener('change', (e) => {
    const selectedModel = models.find(m => m.id === e.target.value);
    if (selectedModel) {
      updateModelDescription(selectedModel.description);
    }
  });

  // Update initial description
  if (models.length > 0) {
    updateModelDescription(models[0].description);
  }
}

// Update model description
function updateModelDescription(description) {
  const descElement = document.getElementById('modelDescription');
  if (descElement) {
    descElement.textContent = description || 'Select the AI model to use';
  }
}

// Update API key visibility based on provider
function updateApiKeyVisibility(provider) {
  // Get all API key groups
  const apiKeyGroups = {
    xai: document.getElementById('xaiApiKeyGroup'),
    gemini: document.getElementById('geminiApiKeyGroup'),
    openai: document.getElementById('openaiApiKeyGroup'),
    anthropic: document.getElementById('anthropicApiKeyGroup'),
    custom: document.getElementById('customApiGroup'),
    openrouter: document.getElementById('openrouterApiKeyGroup'),
    lmstudio: document.getElementById('lmstudioServerGroup')
  };

  // Hide all groups first
  Object.values(apiKeyGroups).forEach(group => {
    if (group) group.style.display = 'none';
  });

  // Show the selected provider's group
  if (apiKeyGroups[provider]) {
    apiKeyGroups[provider].style.display = 'block';
  }
}

function stageLatentApiModel(modelName) {
  if (!elements.modelName || !modelName) return;
  elements.modelName.value = modelName;
  if (elements.modelName.value === modelName) return;

  // #modelName starts empty. When an agent is active we intentionally skip
  // API discovery, so retain the saved API model as a hidden placeholder until
  // the user switches back and the normal provider path repopulates the list.
  const option = document.createElement('option');
  option.value = modelName;
  option.textContent = modelName;
  elements.modelName.appendChild(option);
  elements.modelName.value = modelName;
}

function loadSettings() {
  cancelPendingProviderSettingsModelLoad();
  const loadGeneration = providerSettingsLoadGeneration;
  chrome.storage.local.get(Object.keys(defaultSettings), async (data) => {
    data = data || {};
    fsbRecommendedAgentCap = await resolveRecommendedAgentCap();
    if (loadGeneration !== providerSettingsLoadGeneration) return;
    const hasStoredAgentCap = Object.prototype.hasOwnProperty.call(data, 'fsbAgentCap')
      && typeof data.fsbAgentCap === 'number'
      && Number.isFinite(data.fsbAgentCap);
    const mergedSettings = { ...defaultSettings, ...data };
    const providerHelper = getProviderPanelHelper();
    const normalizedProviderSettings = providerHelper
      ? providerHelper.normalizeSettings(mergedSettings)
      : { providerKind: 'api', modelProvider: 'xai', agentProviderId: '' };
    const settings = { ...mergedSettings, ...normalizedProviderSettings };
    if (!hasStoredAgentCap) {
      settings.fsbAgentCap = fsbRecommendedAgentCap;
    }
    
    // Handle legacy speedMode to new model format
    if (!settings.modelProvider && settings.speedMode) {
      settings.modelProvider = 'xai';
      settings.modelName = 'grok-4-1-fast'; // All legacy modes map to new default
    }
    
    // Restore both latent provider choices before applying the saved kind.
    // Staging the model gives the existing discovery path its sticky previous
    // selection while allowing saved-agent loads to avoid API work entirely.
    stageLatentApiModel(settings.modelName);
    if (elements.modelProvider) elements.modelProvider.value = settings.modelProvider;
    providerPanelState.agentProviderId = settings.agentProviderId;
    const activeProviderId = settings.providerKind === 'agent'
      ? settings.agentProviderId
      : settings.modelProvider;
    setProviderSelection(settings.providerKind, activeProviderId, { markDirty: false });
    
    // Update model name
    if (elements.modelName && settings.modelName) {
      // Wait for options to be populated
      providerSettingsModelLoadTimer = setTimeout(() => {
        providerSettingsModelLoadTimer = null;
        if (loadGeneration !== providerSettingsLoadGeneration
            || providerPanelState.providerKind !== 'api'
            || elements.modelProvider?.value !== settings.modelProvider) return;
        elements.modelName.value = settings.modelName;
        if (typeof globalThis !== 'undefined' && globalThis.FSBModelCombobox) {
          globalThis.FSBModelCombobox.refresh();
        }
        const models = availableModels[settings.modelProvider || 'xai'];
        const selectedModel = models.find(m => m.id === settings.modelName);
        if (selectedModel) {
          updateModelDescription(selectedModel.description);
        }
        if (settings.providerKind === 'api') {
          updateApiKeyVisibility(settings.modelProvider || 'xai');
          // Load-order fix: run the API-connection check inside this model-name timer.
          // By the time it fires, the callback's synchronous body has already populated
          // the apiKey + provider inputs and modelName was just applied above, so
          // checkApiConnection reads populated inputs -- not the empty fields the old
          // page-init call (initializeDashboard) saw, which falsely reported 'No API Key'.
          checkApiConnection();
        }
      }, 100);
    }
    
    // Update form elements
    if (elements.apiKey) elements.apiKey.value = settings.apiKey || '';
    if (elements.geminiApiKey) elements.geminiApiKey.value = settings.geminiApiKey || '';
    // Update new provider API keys
    const openaiApiKey = document.getElementById('openaiApiKey');
    if (openaiApiKey) openaiApiKey.value = settings.openaiApiKey || '';
    
    const anthropicApiKey = document.getElementById('anthropicApiKey');
    if (anthropicApiKey) anthropicApiKey.value = settings.anthropicApiKey || '';
    
    const customApiKey = document.getElementById('customApiKey');
    if (customApiKey) customApiKey.value = settings.customApiKey || '';
    
    const customEndpoint = document.getElementById('customEndpoint');
    if (customEndpoint) customEndpoint.value = settings.customEndpoint || '';

    const openrouterApiKey = document.getElementById('openrouterApiKey');
    if (openrouterApiKey) openrouterApiKey.value = settings.openrouterApiKey || '';

    const lmstudioBaseUrl = document.getElementById('lmstudioBaseUrl');
    if (lmstudioBaseUrl) lmstudioBaseUrl.value = settings.lmstudioBaseUrl || 'http://localhost:1234';

    // Max iterations
    const maxIter = settings.maxIterations || 100;
    if (elements.maxIterations) elements.maxIterations.value = maxIter;
    if (elements.maxIterationsSlider) elements.maxIterationsSlider.value = maxIter;
    if (elements.maxIterationsDisplay) elements.maxIterationsDisplay.textContent = maxIter;

    // Debug mode
    if (elements.debugMode) elements.debugMode.checked = settings.debugMode;

    // DOM optimization settings
    if (elements.domOptimization) {
      elements.domOptimization.checked = settings.domOptimization ?? true;
    }
    const maxDOM = settings.maxDOMElements || 2000;
    if (elements.maxDOMElements) elements.maxDOMElements.value = maxDOM;
    if (elements.maxDOMElementsSlider) elements.maxDOMElementsSlider.value = maxDOM;
    if (elements.maxDOMElementsDisplay) elements.maxDOMElementsDisplay.textContent = maxDOM;

    // Element Cache Size
    const cacheSize = settings.elementCacheSize || 200;
    if (elements.elementCacheSize) elements.elementCacheSize.value = cacheSize;
    if (elements.elementCacheSizeDisplay) elements.elementCacheSizeDisplay.textContent = cacheSize;
    if (elements.elementCacheSizePreset) {
      const presetOption = elements.elementCacheSizePreset.querySelector(`option[value="${cacheSize}"]`);
      if (presetOption && cacheSize !== 'custom') {
        elements.elementCacheSizePreset.value = cacheSize;
        if (elements.elementCacheSizeCustomWrap) elements.elementCacheSizeCustomWrap.style.display = 'none';
      } else {
        elements.elementCacheSizePreset.value = 'custom';
        if (elements.elementCacheSizeCustomWrap) elements.elementCacheSizeCustomWrap.style.display = '';
        if (elements.elementCacheSizeCustom) {
          elements.elementCacheSizeCustom.value = cacheSize;
        }
      }
    }

    // Phase 241 D-05 / POOL-05: Agent Concurrency cap. Re-clamp on read in
    // case storage was tampered with (T-241-11) or set by an older build.
    // If the key is absent, show the RAM-based recommendation.
    if (elements.fsbAgentCap) {
      const capValue = (typeof settings.fsbAgentCap === 'number' && Number.isFinite(settings.fsbAgentCap))
        ? settings.fsbAgentCap
        : fsbRecommendedAgentCap;
      setAgentCapControlValue(capValue);
    }

    // Phase 243 Plan 04 / UI-03: initial paint of the "X of M active" counter.
    // Subsequent updates flow through chrome.storage.onChanged.
    if (typeof refreshActiveAgentCount === 'function') {
      refreshActiveAgentCount();
    }

    // Trigger Concurrency cap. Re-clamp on read in case storage was tampered
    // with or set by an older build.
    if (elements.fsbTriggerCap) {
      let triggerCapValue = (typeof settings.fsbTriggerCap === 'number' && Number.isFinite(settings.fsbTriggerCap))
        ? settings.fsbTriggerCap
        : 8;
      if (triggerCapValue < 1) triggerCapValue = 1;
      if (triggerCapValue > 64) triggerCapValue = 64;
      triggerCapValue = Math.floor(triggerCapValue);
      elements.fsbTriggerCap.value = String(triggerCapValue);
      if (elements.fsbTriggerCapDisplay) {
        elements.fsbTriggerCapDisplay.textContent = String(triggerCapValue);
      }
    }

    if (typeof refreshActiveTriggerCount === 'function') {
      refreshActiveTriggerCount();
    }

    if (elements.prioritizeViewport) {
      elements.prioritizeViewport.checked = settings.prioritizeViewport ?? true;
    }
    if (elements.animatedActionHighlights) {
      elements.animatedActionHighlights.checked = settings.animatedActionHighlights ?? true;
    }
    if (elements.showSidepanelProgress) {
      elements.showSidepanelProgress.checked = settings.showSidepanelProgress ?? false;
    }

    // Phase 245 D-07: Action Change Reports toggle. Default true when key
    // absent (handles older builds whose storage doesn't have the key yet).
    if (elements.fsbChangeReportsEnabled) {
      elements.fsbChangeReportsEnabled.checked = settings.fsbChangeReportsEnabled ?? true;
    }

    // Credential Manager
    if (elements.enableLogin) {
      elements.enableLogin.checked = settings.enableLogin ?? false;
      updateCredentialsManagerVisibility(settings.enableLogin ?? false);
    }

    // CAPTCHA Solver
    if (elements.captchaSolverEnabled) {
      elements.captchaSolverEnabled.checked = settings.captchaSolverEnabled ?? false;
      updateCaptchaSolverVisibility(settings.captchaSolverEnabled ?? false);
    }
    if (elements.captchaApiKey) elements.captchaApiKey.value = settings.captchaApiKey || '';

    if (elements.autoRefineSiteMaps) {
      elements.autoRefineSiteMaps.checked = settings.autoRefineSiteMaps ?? true;
    }

    // Speech-to-Text provider (checkbox maps to 'whisper' | 'browser')
    if (elements.sttProvider) {
      elements.sttProvider.checked = settings.sttProvider === 'whisper';
    }

    // Bring the custom-select widgets' visible labels back into sync with the
    // now-populated native <select> values. initFsbSelects() runs synchronously
    // at page init (before this async callback fires), so at wrap time the
    // <select>s still hold their default first option and the widget labels
    // freeze to that -- leaving e.g. modelProvider showing "xAI (Grok)" while
    // the saved value has been quietly updated to gemini/openai/etc. This runs
    // sync() on every enhanced select without dispatching a synthetic `change`
    // event, so app-level change listeners (markUnsavedChanges + discovery)
    // do not fire on page load.
    if (typeof syncFsbSelectLabels === 'function') syncFsbSelectLabels();

    refreshProviderEvidence();

    addLog('info', 'Settings loaded successfully');
  });
}

// ---------------------------------------------------------------------------
// Phase 243 Plan 04 / UI-03 - Live current-active agent counter.
//
// Reads chrome.storage.session 'fsbAgentRegistry' (Phase 237 D-03 envelope),
// counts records keys EXCLUDING the legacy:* synthesized agents (Pitfall 1
// per 243-RESEARCH.md), and renders "N of M active" into the counter span.
//
// The pure helpers (computeActiveAgentCount / formatCounterText) are loaded
// from extension/ui/cap-counter-helpers.js BEFORE this script (see
// control_panel.html script-tag ordering).
// ---------------------------------------------------------------------------

let _capCounterDebounceHandle = null;

function scheduleRefreshActiveAgentCount() {
  // 100ms debounce — bulk registry writes during agent ramp-up
  // (8 agents x 1-3 tabs each = up to 24 storage events) collapse to a
  // single counter refresh. Pitfall 4 per 243-RESEARCH.md.
  if (_capCounterDebounceHandle !== null) {
    clearTimeout(_capCounterDebounceHandle);
  }
  _capCounterDebounceHandle = setTimeout(() => {
    _capCounterDebounceHandle = null;
    refreshActiveAgentCount();
  }, 100);
}

function refreshActiveAgentCount() {
  const counterEl = elements.fsbAgentCapCurrentActive;
  if (!counterEl) return;
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session
      || typeof chrome.storage.session.get !== 'function') {
    return;
  }
  try {
    chrome.storage.session.get('fsbAgentRegistry', (result) => {
      // chrome.runtime.lastError swallow — counter is best-effort UI.
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      const envelope = result && result.fsbAgentRegistry;
      const active = (typeof computeActiveAgentCount === 'function')
        ? computeActiveAgentCount(envelope)
        : 0;
      let cap = parseInt(elements.fsbAgentCap && elements.fsbAgentCap.value, 10);
      if (!Number.isFinite(cap)) cap = 8;
      const text = (typeof formatCounterText === 'function')
        ? formatCounterText(active, cap)
        : (active + ' of ' + cap + ' active');
      counterEl.textContent = text;
    });
  } catch (_e) {
    // Swallow — counter is purely informational and must never throw into
    // the options page.
  }
}

let _triggerCapCounterDebounceHandle = null;

function scheduleRefreshActiveTriggerCount() {
  if (_triggerCapCounterDebounceHandle !== null) {
    clearTimeout(_triggerCapCounterDebounceHandle);
  }
  _triggerCapCounterDebounceHandle = setTimeout(() => {
    _triggerCapCounterDebounceHandle = null;
    refreshActiveTriggerCount();
  }, 100);
}

function refreshActiveTriggerCount() {
  const counterEl = elements.fsbTriggerCapCurrentActive;
  if (!counterEl) return;
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session
      || typeof chrome.storage.session.get !== 'function') {
    return;
  }
  try {
    chrome.storage.session.get('fsbTriggerRegistry', (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      const envelope = result && result.fsbTriggerRegistry;
      const active = (typeof computeActiveTriggerCount === 'function')
        ? computeActiveTriggerCount(envelope)
        : 0;
      let cap = parseInt(elements.fsbTriggerCap && elements.fsbTriggerCap.value, 10);
      if (!Number.isFinite(cap)) cap = 8;
      const text = (typeof formatCounterText === 'function')
        ? formatCounterText(active, cap)
        : (active + ' of ' + cap + ' active');
      counterEl.textContent = text;
    });
  } catch (_e) {
    // Swallow — counter is purely informational and must never throw into
    // the options page.
  }
}

function normalizeProviderFormSelection() {
  const providerHelper = getProviderPanelHelper();
  const normalizedProviderSettings = providerHelper
    ? providerHelper.normalizeSettings({
        providerKind: providerPanelState.providerKind,
        modelProvider: elements.modelProvider?.value,
        agentProviderId: providerPanelState.agentProviderId
      })
    : { providerKind: 'api', modelProvider: 'xai', agentProviderId: '' };
  providerPanelState.providerKind = normalizedProviderSettings.providerKind;
  providerPanelState.agentProviderId = normalizedProviderSettings.agentProviderId;
  if (elements.modelProvider) {
    elements.modelProvider.value = normalizedProviderSettings.modelProvider;
  }
  renderProviderSelection();
  renderProviderKind();
  return normalizedProviderSettings;
}

function saveSettings() {
  const normalizedProviderSettings = normalizeProviderFormSelection();
  const settings = {
    providerKind: normalizedProviderSettings.providerKind,
    agentProviderId: normalizedProviderSettings.agentProviderId,
    modelProvider: elements.modelProvider?.value || 'xai',
    modelName: elements.modelName?.value || 'grok-4-1-fast',
    apiKey: (elements.apiKey?.value || '').trim(),
    geminiApiKey: (elements.geminiApiKey?.value || '').trim(),
    openaiApiKey: (document.getElementById('openaiApiKey')?.value || '').trim(),
    anthropicApiKey: (document.getElementById('anthropicApiKey')?.value || '').trim(),
    customApiKey: (document.getElementById('customApiKey')?.value || '').trim(),
    customEndpoint: (document.getElementById('customEndpoint')?.value || '').trim(),
    openrouterApiKey: (document.getElementById('openrouterApiKey')?.value || '').trim(),
    lmstudioBaseUrl: (document.getElementById('lmstudioBaseUrl')?.value || 'http://localhost:1234').trim(),
    maxIterations: parseInt(elements.maxIterations?.value) || 20,
    debugMode: elements.debugMode?.checked ?? false,
    // DOM Optimization settings
    domOptimization: elements.domOptimization?.checked ?? true,
    maxDOMElements: parseInt(elements.maxDOMElements?.value) || 2000,
    elementCacheSize: parseInt(elements.elementCacheSize?.value) || 200,
    prioritizeViewport: elements.prioritizeViewport?.checked ?? true,
    animatedActionHighlights: elements.animatedActionHighlights?.checked ?? true,
    showSidepanelProgress: elements.showSidepanelProgress?.checked ?? false,
    enableLogin: elements.enableLogin?.checked ?? false,
    captchaSolverEnabled: elements.captchaSolverEnabled?.checked ?? false,
    captchaApiKey: (elements.captchaApiKey?.value || '').trim(),
    sttProvider: elements.sttProvider?.checked ? 'whisper' : 'browser',
    autoRefineSiteMaps: elements.autoRefineSiteMaps?.checked ?? true,
    // Phase 241 D-05 / POOL-05: Agent Concurrency cap. Defense-in-depth
    // layer 2 (input clamp = layer 1; SW setCap on storage.onChanged = layer 3).
    // Phase 241 WR-02: clamp at the write site for symmetry with the load
    // path so DevTools-tampered values or stale settings exports cannot
    // persist out-of-range cap values to chrome.storage.local.
    fsbAgentCap: (function() {
      var raw = parseInt(elements.fsbAgentCap?.value, 10);
      return clampAgentCapValue(raw, fsbRecommendedAgentCap);
    })(),
    fsbTriggerCap: (function() {
      var raw = parseInt(elements.fsbTriggerCap?.value, 10);
      if (!Number.isFinite(raw)) return 8;
      if (raw < 1) return 1;
      if (raw > 64) return 64;
      return raw;
    })(),
    // Phase 245 D-07: persist Action Change Reports toggle. Default true so
    // builds where the user has never visited the toggle still emit reports.
    fsbChangeReportsEnabled: elements.fsbChangeReportsEnabled?.checked ?? true
  };
  
  chrome.storage.local.set(settings, () => {
    dashboardState.hasUnsavedChanges = false;
    hideSaveBar();
    showToast('Settings saved successfully', 'success');
    addLog('info', 'Settings saved successfully');
    
    // Update connection status if API key changed
    if (settings.providerKind === 'api' && settings.apiKey) {
      checkApiConnection();
    }
  });
}

function discardChanges() {
  loadSettings();
  dashboardState.hasUnsavedChanges = false;
  hideSaveBar();
  showToast('Changes discarded', 'warning');
  addLog('info', 'Changes discarded');
}

function markUnsavedChanges() {
  if (!dashboardState.hasUnsavedChanges) {
    dashboardState.hasUnsavedChanges = true;
    showSaveBar();
  }
}

function showSaveBar() {
  if (elements.saveBar) {
    elements.saveBar.style.display = 'block';
    setTimeout(() => elements.saveBar.classList.add('show'), 10);
  }
}

function hideSaveBar() {
  if (elements.saveBar) {
    elements.saveBar.classList.remove('show');
    setTimeout(() => elements.saveBar.style.display = 'none', 200);
  }
}


function togglePasswordVisibility(fieldId) {
  const field = document.getElementById(fieldId);
  const button = document.getElementById(`toggle${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)}`);
  
  if (field && button) {
    const isPassword = field.type === 'password';
    field.type = isPassword ? 'text' : 'password';
    
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
    }
  }
}

async function checkApiConnection() {
  // Phase 6 Plan 06-04: rewritten to read from input fields directly (NOT from
  // chrome.storage) and delegate to the Plan 06-03 bridge shim in test-connection
  // mode. Closes the xai-key-rejected-400 P2 defect (stale storage read trap
  // when user clicks Test before Save). Per-provider getter map trims input
  // values defense-in-depth (also closes P1 even though Task 1 already trims at
  // save time).
  dashboardState.connectionStatus = 'checking';
  updateConnectionStatus('checking', 'Checking connection...');

  try {
    const provider = elements.modelProvider?.value || 'xai';
    const modelName = elements.modelName?.value || 'grok-4-1-fast';

    const PROVIDER_KEY_GETTERS = {
      xai:        function () { return (elements.apiKey?.value || '').trim(); },
      gemini:     function () { return (elements.geminiApiKey?.value || '').trim(); },
      openai:     function () { return (document.getElementById('openaiApiKey')?.value || '').trim(); },
      anthropic:  function () { return (document.getElementById('anthropicApiKey')?.value || '').trim(); },
      custom:     function () { return (document.getElementById('customApiKey')?.value || '').trim(); },
      openrouter: function () { return (document.getElementById('openrouterApiKey')?.value || '').trim(); },
      lmstudio:   function () { return ''; }
    };
    const PROVIDER_NAMES = {
      xai: 'xAI',
      gemini: 'Gemini',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      custom: 'Custom',
      openrouter: 'OpenRouter',
      lmstudio: 'LM Studio'
    };

    const apiKey = (PROVIDER_KEY_GETTERS[provider] || function () { return ''; })();
    if (!apiKey && provider !== 'lmstudio') {
      updateConnectionStatus('disconnected', 'No API key configured');
      updateApiStatusCard('disconnected', 'No API Key', 'Configure your ' + (PROVIDER_NAMES[provider] || provider) + ' API key to get started');
      return;
    }

    const config = {
      apiKey: apiKey,
      model: modelName,
      baseUrl: provider === 'custom' ? (document.getElementById('customEndpoint')?.value || '').trim()
             // Strip a pasted /v1 or /v1/chat/completions suffix (the model-discovery
             // normalization idiom above) before re-appending /v1, so the documented
             // http://localhost:1234/v1 setting never becomes /v1/v1.
             : provider === 'lmstudio' ? ((document.getElementById('lmstudioBaseUrl')?.value || 'http://localhost:1234').trim()
                 .replace(/\/v1\/chat\/completions\/?$/, '')
                 .replace(/\/v1\/?$/, '')
                 .replace(/\/+$/, '') + '/v1')
             : provider === 'openai' ? 'https://api.openai.com/v1'
             : undefined
    };

    const startTime = Date.now();
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'lattice-test-connection', provider: provider, config: config },
          function (response) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response || !response.ok) {
              reject(new Error((response && response.error) || 'Unknown bridge error'));
              return;
            }
            resolve();
          }
        );
      });
      const responseTime = Date.now() - startTime;
      updateConnectionStatus('connected', 'Connected');
      // Hide status card on success - only show on errors
      if (elements.apiStatusCard) {
        elements.apiStatusCard.style.display = 'none';
      }
      addLog('info', 'API connection successful (' + responseTime + 'ms) with model: ' + modelName);
    } catch (err) {
      const responseTime = Date.now() - startTime;
      const errMsg = (err && err.message) ? err.message : 'Unknown error';
      updateConnectionStatus('disconnected', 'Connection failed');
      updateApiStatusCard('disconnected', 'Connection Failed', errMsg);
      addLog('error', 'API connection failed (' + responseTime + 'ms): ' + errMsg);
    }
  } catch (error) {
    updateConnectionStatus('disconnected', 'Connection error');
    updateApiStatusCard('disconnected', 'Connection Error', error.message);
    addLog('error', 'API connection error: ' + error.message);
  }
}

function updateConnectionStatus(status, text) {
  dashboardState.connectionStatus = status;
  
  if (elements.connectionStatus) {
    const dot = elements.connectionStatus.querySelector('.status-dot');
    
    if (dot) {
      dot.className = `fas fa-circle status-dot ${status}`;
    }
  }
}

function updateApiStatusCard(status, title, detail) {
  if (elements.apiStatusCard) {
    elements.apiStatusCard.style.display = 'block';
    elements.apiStatusCard.className = `api-status-card ${status}`;

    const icon = elements.apiStatusCard.querySelector('.status-icon i');
    const titleElement = elements.apiStatusCard.querySelector('.status-title');
    const detailElement = elements.apiStatusCard.querySelector('.status-detail');

    if (icon) {
      icon.className = status === 'checking' ? 'fas fa-spinner fa-spin' :
                     status === 'connected' ? 'fas fa-check-circle' :
                     'fas fa-exclamation-triangle';
    }

    if (titleElement) titleElement.textContent = title;
    if (detailElement) detailElement.textContent = detail;
  }
}

async function testApiConnection() {
  if (dashboardState.isApiTesting) return;

  dashboardState.isApiTesting = true;
  // No header button in the current layout (reachable via Ctrl/Cmd+T only) --
  // elements.testApiBtn is intentionally uncached, guard its UI updates.
  if (elements.testApiBtn) {
    elements.testApiBtn.disabled = true;
    elements.testApiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
  }

  try {
    await checkApiConnection();
    showToast('API test completed', 'success');
  } catch (error) {
    showToast('API test failed', 'error');
  } finally {
    dashboardState.isApiTesting = false;
    if (elements.testApiBtn) {
      elements.testApiBtn.disabled = false;
      elements.testApiBtn.innerHTML = '<i class="fas fa-plug"></i> Test API';
    }
  }
}

async function runFullApiTest() {
  if (!elements.fullApiTest || !elements.testResults) return;

  elements.fullApiTest.disabled = true;
  elements.fullApiTest.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
  elements.testResults.classList.remove('show');

  try {
    const settings = await getStoredSettings();
    const provider = settings.modelProvider || 'xai';

    // Check appropriate API key based on provider
    const apiKeyMap = {
      xai: { key: settings.apiKey, name: 'xAI' },
      gemini: { key: settings.geminiApiKey, name: 'Gemini' },
      openai: { key: settings.openaiApiKey, name: 'OpenAI' },
      anthropic: { key: settings.anthropicApiKey, name: 'Anthropic' },
      custom: { key: settings.customApiKey, name: 'Custom' },
      openrouter: { key: settings.openrouterApiKey, name: 'OpenRouter' },
      lmstudio: { key: 'local', name: 'LM Studio' }
    };

    const providerInfo = apiKeyMap[provider];
    if (!providerInfo) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    if (provider !== 'lmstudio' && !providerInfo.key) {
      throw new Error(`${providerInfo.name} API key is required for testing`);
    }

    // Test AI integration
    const aiIntegration = new AIIntegration(settings);

    const result = await aiIntegration.testConnection();

    // Display results
    elements.testResults.innerHTML = `
      <h4>API Test Results</h4>
      <div class="test-result-item">
        <strong>Provider:</strong> ${escapeHtml(providerInfo.name)}
      </div>
      <div class="test-result-item">
        <strong>Status:</strong> ${result.ok ? 'Success' : 'Failed'}
      </div>
      <div class="test-result-item">
        <strong>Model:</strong> ${escapeHtml(result.model || 'Unknown')}
      </div>
      <div class="test-result-item">
        <strong>Response Time:</strong> ${escapeHtml(String(result.responseTime || 'N/A'))}ms
      </div>
      ${result.error ? `<div class="test-result-item error"><strong>Error:</strong> ${escapeHtml(result.error)}</div>` : ''}
      ${result.data ? `<div class="test-result-item"><strong>Response:</strong> <pre>${escapeHtml(JSON.stringify(result.data, null, 2))}</pre></div>` : ''}
    `;

    elements.testResults.classList.add('show');
    if (result.ok) {
      if (elements.apiStatusCard) elements.apiStatusCard.style.display = 'none';
    } else {
      updateApiStatusCard('disconnected', 'Connection Failed', result.error || 'Test failed');
    }
    addLog(result.ok ? 'info' : 'error', `Full API test ${result.ok ? 'passed' : 'failed'}: ${result.error || 'Success'}`);

  } catch (error) {
    elements.testResults.innerHTML = `
      <h4>API Test Results</h4>
      <div class="test-result-item error">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
    elements.testResults.classList.add('show');
    addLog('error', `Full API test error: ${error.message}`);
    updateApiStatusCard('disconnected', 'Connection Error', error.message);
  } finally {
    elements.fullApiTest.disabled = false;
    elements.fullApiTest.innerHTML = '<i class="fas fa-flask"></i> Run Full API Test';
  }
}

// Theme mode: 'system' | 'dark' | 'light', persisted under the same
// localStorage key the old binary toggle used. 'system' resolves live from
// the OS via matchMedia instead of hardening into 'light'/'dark' on first run.
let _systemThemeMediaQuery = null;
let _systemThemeChangeHandler = null;

function resolveEffectiveTheme(preference) {
  if (preference === 'system') {
    return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return preference;
}

function renderThemeModeToggle(preference) {
  const tg = elements.themeModeToggle;
  if (!tg) return;
  const btns = tg.querySelectorAll('.detail-btn[data-theme-mode]');
  btns.forEach((btn) => {
    const active = btn.dataset.themeMode === preference;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function updateSystemThemeListener(preference) {
  if (_systemThemeMediaQuery) {
    _systemThemeMediaQuery.removeEventListener('change', _systemThemeChangeHandler);
    _systemThemeMediaQuery = null;
    _systemThemeChangeHandler = null;
  }
  if (preference === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    _systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    _systemThemeChangeHandler = () => applyTheme('system');
    _systemThemeMediaQuery.addEventListener('change', _systemThemeChangeHandler);
  }
}

function applyTheme(preference) {
  const effective = resolveEffectiveTheme(preference);
  document.documentElement.setAttribute('data-theme', effective);
  renderThemeModeToggle(preference);
  // No-ops naturally on the initial load's applyTheme() call, since the chart
  // isn't created until analytics.initPromise resolves, later in startup.
  if (window.analytics && window.analytics.chart) {
    window.analytics.updateChartTheme();
  }
}

function setThemePreference(preference) {
  localStorage.setItem('fsb-theme', preference);
  applyTheme(preference);
  updateSystemThemeListener(preference);
}

function setupTheme() {
  let preference = localStorage.getItem('fsb-theme');
  if (!['system', 'dark', 'light'].includes(preference)) {
    preference = 'system';
  }
  setThemePreference(preference);
}

function initializeLogs() {
  addLog('info', 'FSB Control Panel loaded successfully');
}

function addLog(level, message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, level, message };
  
  statsData.logs.unshift(logEntry);
  
  // Limit log history
  if (statsData.logs.length > 1000) {
    statsData.logs = statsData.logs.slice(0, 1000);
  }
  
  updateLogsDisplay();
}

function updateLogsDisplay() {
  if (!elements.logsDisplay) return;
  
  const levelFilter = elements.logLevel?.value || 'all';
  const filteredLogs = statsData.logs.filter(log => {
    if (levelFilter === 'all') return true;
    if (levelFilter === 'error') return log.level === 'error';
    if (levelFilter === 'warn') return ['error', 'warn'].includes(log.level);
    if (levelFilter === 'info') return ['error', 'warn', 'info'].includes(log.level);
    return true;
  });
  
  elements.logsDisplay.innerHTML = filteredLogs.slice(0, 100).map(log => `
    <div class="log-entry ${escapeHtml(log.level)}">
      <span class="log-time">${escapeHtml(log.timestamp)}</span>
      <span class="log-level">${escapeHtml(log.level.toUpperCase())}</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>
  `).join('');
}

function clearLogs() {
  statsData.logs = [];
  updateLogsDisplay();
  addLog('info', 'Logs cleared');
  showToast('Logs cleared', 'info');
}

function exportLogs() {
  const logsText = statsData.logs.map(log => 
    `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
  ).join('\n');
  
  const blob = new Blob([logsText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `fsb-logs-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('Logs exported successfully', 'success');
  addLog('info', 'Logs exported to file');
}

function filterLogs() {
  updateLogsDisplay();
}

// ============================================================================
// Phase 30 (GOV-07/GOV-08, D-13/D-14): Consent & Audit section render + actions.
//
// The UI is the user's control surface over the consent spine (Plans 02/03). It
// is the ONLY surface that mutates consent from user intent; the GATE
// (background.js, wrapping FsbCapabilityRouter.invoke) remains the authoritative
// enforcement. Sensitive is informational for capability invokes under the
// opt-out posture; the network-capture discovery path keeps its own sensitive
// confirmation. Denylisted origins are rendered non-enableable.
// ============================================================================

let _consentAuditDebounceHandle = null;

function scheduleRenderConsentAudit() {
  // 100ms debounce (mirror the cap-counter scheduleRefresh) so a burst of audit
  // appends during an automation run collapses to a single re-render.
  if (_consentAuditDebounceHandle !== null) {
    clearTimeout(_consentAuditDebounceHandle);
  }
  _consentAuditDebounceHandle = setTimeout(() => {
    _consentAuditDebounceHandle = null;
    renderConsentAudit();
  }, 100);
}

// renderConsentAudit() -- reads the consent envelope + the redacted audit ring
// and (re)paints the per-origin list + the audit table. Best-effort: a store
// hiccup must never throw into the options page (it degrades to the empty state).
function renderConsentAudit() {
  // Only paint when the section exists in the DOM.
  if (!elements.consentOriginList && !elements.auditLogBody) return;

  const consentStore = (typeof globalThis !== 'undefined') ? globalThis.FsbConsentPolicyStore : null;
  const auditStore = (typeof globalThis !== 'undefined') ? globalThis.FsbAuditLog : null;

  // One fetch feeds the per-origin list, the audit table AND the pending
  // requests card (which needs envelope + entries together to decide what is
  // still awaiting a user decision). Per-source catch so one store hiccup
  // degrades that renderer only, never throws into the options page.
  const envelopeP = (consentStore && typeof consentStore.readPolicies === 'function')
    ? Promise.resolve(consentStore.readPolicies()).catch(() => null)
    : Promise.resolve(null);
  const originsP = (auditStore && typeof auditStore.getDistinctOrigins === 'function')
    ? Promise.resolve(auditStore.getDistinctOrigins()).catch(() => [])
    : Promise.resolve([]);
  const entriesP = (auditStore && typeof auditStore.getEntries === 'function')
    ? Promise.resolve(auditStore.getEntries())
        .then((result) => (result && Array.isArray(result.entries)) ? result.entries : [])
        .catch(() => [])
    : Promise.resolve([]);

  Promise.all([envelopeP, originsP, entriesP])
    .then(([envelope, auditOrigins, entries]) => {
      // ---- Per-origin consent list (merged from policies + audit-seen origins) ----
      if (envelope) {
        renderConsentOriginList(envelope, auditOrigins);
        renderDefaultModeToggle(envelope.defaultMode);
      }
      // ---- Audit log table ----
      renderAuditTable(entries);
      // ---- Pending requests card ----
      renderPendingRequests(envelope, entries);
    })
    .catch(() => { /* degrade silently; existing rows untouched */ });
}

// Paint the per-origin rows from the consent envelope. Applies
// FsbServiceDenylist.classify(origin) for the Sensitive/Blocked friction.
function renderConsentOriginList(envelope, auditOrigins) {
  const list = elements.consentOriginList;
  const tmpl = elements.consentOriginRowTemplate;
  if (!list || !tmpl || !tmpl.content) return;

  const policies = (envelope && envelope.policies && typeof envelope.policies === 'object')
    ? envelope.policies : {};
  const defaultMode = (envelope && typeof envelope.defaultMode === 'string') ? envelope.defaultMode : 'auto';

  // Union: explicit-policy origins + audit-seen origins (so a blocked/attempted
  // site surfaces for opt-out, not only stored policies).
  const originSet = Object.create(null);
  Object.keys(policies).forEach((o) => { originSet[o] = true; });
  (Array.isArray(auditOrigins) ? auditOrigins : []).forEach((o) => {
    if (typeof o === 'string' && o) originSet[o] = true;
  });
  const origins = Object.keys(originSet);

  // Clear previously-rendered rows (keep the empty-state node).
  const existing = list.querySelectorAll('.consent-origin-row');
  existing.forEach((node) => node.remove());

  if (origins.length === 0) {
    if (elements.consentOriginEmptyState) elements.consentOriginEmptyState.style.display = '';
    return;
  }
  if (elements.consentOriginEmptyState) elements.consentOriginEmptyState.style.display = 'none';

  const denylist = (typeof globalThis !== 'undefined') ? globalThis.FsbServiceDenylist : null;

  origins.sort();
  origins.forEach((origin) => {
    const hasExplicit = Object.prototype.hasOwnProperty.call(policies, origin);
    const policy = hasExplicit ? (policies[origin] || {}) : {};
    const mode = (typeof policy.mode === 'string') ? policy.mode : defaultMode;
    const mutating = !!policy.mutating;

    const frag = tmpl.content.cloneNode(true);
    const row = frag.querySelector('.consent-origin-row');
    if (!row) return;
    row.dataset.origin = origin;

    const nameEl = row.querySelector('.consent-origin-name');
    if (nameEl) nameEl.textContent = origin;

    const radiogroup = row.querySelector('.consent-mode-toggle');
    if (radiogroup) radiogroup.setAttribute('aria-label', 'Consent mode for ' + origin);

    // classify() is the gate's source of truth. denied => Blocked + all controls
    // disabled; sensitive => amber badge only for capability invokes.
    let classified = { sensitive: false, denied: false };
    if (denylist && typeof denylist.classify === 'function') {
      try { classified = denylist.classify(origin) || classified; } catch (_e) { /* degrade */ }
    }

    const modeButtons = row.querySelectorAll('.detail-btn[data-mode]');
    modeButtons.forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      // Denylisted: every control disabled (non-enableable).
      if (classified.denied) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
    });

    const mutInput = row.querySelector('.consent-mutating-input');
    if (mutInput) {
      mutInput.checked = mutating;
      // Mutating is meaningless when mode == Off; disabled then. Always disabled
      // for a denylisted origin.
      mutInput.disabled = classified.denied || mode === 'off';
    }

    const hint = row.querySelector('.consent-origin-hint');
    const sensBadge = row.querySelector('.consent-sensitive-badge');
    const blockBadge = row.querySelector('.consent-blocked-badge');
    if (classified.denied) {
      row.classList.add('consent-origin-denied');
      row.style.opacity = '0.6';
      if (blockBadge) blockBadge.style.display = '';
      if (hint) {
        hint.style.display = '';
        hint.textContent = 'Automation prohibited for this origin. '
          + (classified.reason || '');
      }
    } else if (classified.sensitive) {
      if (sensBadge) sensBadge.style.display = '';
      if (hint) {
        hint.style.display = '';
        hint.textContent = 'Sensitive origin. Capability invocations can run under Auto; network-capture discovery still requires confirmation.';
      }
    }

    list.appendChild(frag);
  });
}

// Paint the global "Default for new sites" segmented control from the envelope's
// defaultMode (off/ask/auto). Best-effort: a missing toggle is a no-op.
function renderDefaultModeToggle(defaultMode) {
  const tg = elements.consentDefaultModeToggle;
  if (!tg) return;
  const mode = (typeof defaultMode === 'string' && defaultMode) ? defaultMode : 'auto';
  const btns = tg.querySelectorAll('.detail-btn[data-default-mode]');
  btns.forEach((btn) => {
    const active = btn.dataset.defaultMode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

// Paint the redacted audit rows (newest first). Renders ONLY the seven
// whitelisted columns -- never args/tokens/cookies/bodies (GOV-06 at the UI layer;
// the ring is already redacted by audit-log.js, this is defense in depth).
function renderAuditTable(entries) {
  const body = elements.auditLogBody;
  if (!body) return;

  // Remove prior data rows (keep the empty-row node reference).
  const dataRows = body.querySelectorAll('tr.audit-entry-row');
  dataRows.forEach((node) => node.remove());

  const list = Array.isArray(entries) ? entries.slice() : [];
  if (list.length === 0) {
    if (elements.auditLogEmptyRow) elements.auditLogEmptyRow.style.display = '';
    return;
  }
  if (elements.auditLogEmptyRow) elements.auditLogEmptyRow.style.display = 'none';

  // Newest first.
  list.reverse();
  list.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const tr = document.createElement('tr');
    tr.className = 'log-entry audit-entry-row';
    const outcome = String(entry.outcome || '');
    // Failed-outcome rows get the error tint (mirror .log-entry.error).
    if (/fail|error|block|deny|denied/i.test(outcome)) {
      tr.classList.add('error');
    }
    const ts = (typeof entry.ts === 'number') ? new Date(entry.ts).toLocaleString() : '';
    // STRICT whitelist: only these seven fields are ever read off the entry.
    const cells = [
      ts,
      String(entry.origin || ''),
      String(entry.slug || ''),
      String(entry.method || ''),
      String(entry.sideEffectClass || ''),
      String(entry.consentDecision || ''),
      outcome
    ];
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;   // textContent, never innerHTML -- no injection
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

// Export the redacted audit ring as JSON (mirror exportLogs / diagnostics export).
function exportAuditLog() {
  const auditStore = (typeof globalThis !== 'undefined') ? globalThis.FsbAuditLog : null;
  if (!auditStore || typeof auditStore.getEntries !== 'function') {
    showToast('Audit log unavailable', 'error');
    return;
  }
  Promise.resolve(auditStore.getEntries()).then((result) => {
    const entries = (result && Array.isArray(result.entries)) ? result.entries : [];
    const json = JSON.stringify({ exportedAt: Date.now(), entries: entries }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fsb-audit-log-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Audit log exported', 'success');
  }).catch(() => {
    showToast('Audit log export failed', 'error');
  });
}

// Clear the audit ring after a destructive confirm (mirror clearLogs but guarded).
function clearAuditLog() {
  const confirmed = (typeof window !== 'undefined' && typeof window.confirm === 'function')
    ? window.confirm('Clear audit log: This permanently deletes all local audit entries. Export first if you want a copy. Continue?')
    : true;
  if (!confirmed) return;
  const auditStore = (typeof globalThis !== 'undefined') ? globalThis.FsbAuditLog : null;
  if (!auditStore || typeof auditStore.getEntries !== 'function') {
    showToast('Audit log unavailable', 'error');
    return;
  }
  Promise.resolve(auditStore.getEntries({ clear: true })).then(() => {
    renderAuditTable([]);
    showToast('Audit log cleared', 'warning');
  }).catch(() => {
    showToast('Could not clear audit log', 'error');
  });
}

// Origins dismissed via Deny this PAGE SESSION. Deny is deliberately
// dismiss-only (no policy write -- a durable Off lives in the per-origin list
// above); a reload brings the row back since the underlying audit entry still
// awaits a decision.
const _dismissedPendingOrigins = new Set();

// Paint the Pending Requests card from the audit ring + the live consent
// envelope (both already fetched by renderConsentAudit). An entry is pending
// when its blocked outcome is still unresolved under the CURRENT policy:
//   'ask'               -> origin's effective mode is still 'ask'
//   'mutating_required' -> origin is 'auto' without the mutating opt-in
// Denylist-'blocked' and 'off' decisions are never pending (non-grantable /
// user already opted out). Deduped per origin: a mutating-scope entry outranks
// read, a newer entry wins for display. Grant/Deny wiring is the delegated
// click handler in setupEventListeners; data-scope must be 'mutating'|'read'
// because grantPendingRequest keys setOriginMutating off scope === 'mutating'.
function renderPendingRequests(envelope, entries) {
  const list = elements.pendingRequestList;
  const tmpl = elements.pendingRequestRowTemplate;
  if (!list || !tmpl || !tmpl.content) return;

  const store = (typeof globalThis !== 'undefined') ? globalThis.FsbConsentPolicyStore : null;
  const canEvaluate = !!(envelope && store && typeof store.getConsentForOrigin === 'function');

  // origin -> { entry, scope }; ring is oldest -> newest, so a later entry
  // replaces unless it would downgrade a mutating row to read.
  const pendingByOrigin = Object.create(null);
  if (canEvaluate && Array.isArray(entries)) {
    entries.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.outcome !== 'blocked') return;
      const origin = (typeof entry.origin === 'string') ? entry.origin : '';
      if (!origin || _dismissedPendingOrigins.has(origin)) return;

      const decision = String(entry.consentDecision || '');
      const consent = store.getConsentForOrigin(envelope, origin);
      const stillPending =
        (decision === 'ask' && consent.mode === 'ask')
        || (decision === 'mutating_required' && consent.mode === 'auto' && !consent.mutating);
      if (!stillPending) return;

      const scope = (entry.sideEffectClass && entry.sideEffectClass !== 'read') ? 'mutating' : 'read';
      const existing = pendingByOrigin[origin];
      if (!existing || !(existing.scope === 'mutating' && scope === 'read')) {
        pendingByOrigin[origin] = { entry: entry, scope: scope };
      }
    });
  }

  // Clear previously-rendered rows (keep the empty-state node) -- mirror
  // renderConsentOriginList.
  const existingRows = list.querySelectorAll('.pending-request-row');
  existingRows.forEach((node) => node.remove());

  Object.keys(pendingByOrigin).sort().forEach((origin) => {
    const pending = pendingByOrigin[origin];
    const frag = tmpl.content.cloneNode(true);
    const row = frag.querySelector('.pending-request-row');
    if (!row) return;
    row.dataset.origin = origin;
    row.dataset.scope = pending.scope;

    const originEl = row.querySelector('.pending-request-origin');
    if (originEl) originEl.textContent = origin;

    const metaEl = row.querySelector('.pending-request-meta');
    if (metaEl) {
      // Same timestamp treatment as renderAuditTable (toLocaleString).
      const ts = (typeof pending.entry.ts === 'number') ? new Date(pending.entry.ts).toLocaleString() : '';
      metaEl.textContent = String(pending.entry.slug || '') + (ts ? ' - ' + ts : '');
    }

    if (pending.scope === 'mutating') {
      const badge = row.querySelector('.pending-write-badge');
      if (badge) badge.style.display = '';
    }

    list.appendChild(frag);
  });

  updatePendingCount();
}

// Grant a pending request: write consent for that EXACT origin/scope only
// (T-30-16 -- never a global enable), remove the row, surface a toast.
//
// Grant classifies the origin first via FsbServiceDenylist.classify:
//   - DENIED origin -> refuse the grant outright (the gate blocks it anyway;
//                      writing any mode would be a dishonest stored policy).
//   - otherwise     -> grant 'auto', including sensitive non-denied origins. The
//                      invoke gate allows sensitive origins under Auto; discovery
//                      keeps its separate sensitive-confirm path.
function grantPendingRequest(row) {
  if (!row || !row.dataset) return;
  const origin = row.dataset.origin || '';
  const scope = row.dataset.scope || '';
  if (!origin) return;

  const denylist = (typeof globalThis !== 'undefined') ? globalThis.FsbServiceDenylist : null;
  let cls = { denied: false, sensitive: false };
  if (denylist && typeof denylist.classify === 'function') {
    try { cls = denylist.classify(origin) || cls; } catch (_e) { /* degrade to non-denied/non-sensitive */ }
  }
  if (cls.denied) {
    // A denied origin can never be granted -- the gate blocks it regardless.
    showToast('This origin is blocked from automation', 'error');
    return;
  }
  const grantMode = 'auto';

  const store = (typeof globalThis !== 'undefined') ? globalThis.FsbConsentPolicyStore : null;
  if (store && typeof store.setOriginMode === 'function') {
    const writes = [store.setOriginMode(origin, grantMode)];
    // Retain the legacy mutating flag as compatibility metadata; under the
    // opt-out posture the invoke gate allows writes whenever the origin is Auto.
    if (scope === 'mutating' && grantMode === 'auto' && typeof store.setOriginMutating === 'function') {
      writes.push(store.setOriginMutating(origin, true));
    }
    Promise.all(writes.map((p) => Promise.resolve(p))).then(() => {
      row.remove();
      updatePendingCount();
      scheduleRenderConsentAudit();
      showToast(cls.sensitive ? 'Access granted (sensitive origin)' : 'Access granted', 'success');
    });
  } else {
    row.remove();
    updatePendingCount();
    showToast('Access granted', 'success');
  }
}

// Deny a pending request: remove the row WITHOUT granting. Dismiss-only for
// this page session (recorded so re-renders don't resurrect the row).
function denyPendingRequest(row) {
  if (!row) return;
  const origin = (row.dataset && row.dataset.origin) ? row.dataset.origin : '';
  if (origin) _dismissedPendingOrigins.add(origin);
  row.remove();
  updatePendingCount();
  showToast('Request denied', 'warning');
}

// Refresh the "N pending" count pill + the empty-state from the live row count.
// Draining the queue (count >0 -> 0) also clears the chrome.action badge (the
// queue is what the badge surfaces). The clear is transition-guarded: routine
// empty renders must not clobber the badge's other users (ws-client connection
// state, error alerts).
let _pendingCountLastSeen = 0;

function updatePendingCount() {
  const list = elements.pendingRequestList;
  if (!list) return;
  const count = list.querySelectorAll('.pending-request-row').length;
  if (elements.pendingRequestCount) {
    if (count > 0) {
      elements.pendingRequestCount.textContent = count + ' pending';
      elements.pendingRequestCount.style.display = '';
    } else {
      elements.pendingRequestCount.style.display = 'none';
    }
  }
  if (elements.pendingRequestEmptyState) {
    elements.pendingRequestEmptyState.style.display = count > 0 ? 'none' : '';
  }
  if (count === 0 && _pendingCountLastSeen > 0
      && typeof chrome !== 'undefined' && chrome.action
      && typeof chrome.action.setBadgeText === 'function') {
    try { chrome.action.setBadgeText({ text: '' }); } catch (_e) { /* best-effort */ }
  }
  _pendingCountLastSeen = count;
}

let _toastTimer = null;
function showToast(message, type = 'info') {
  if (!elements.statusToast) return;

  // Duration varies by severity
  const durations = { success: 2000, info: 3000, warning: 4000, error: 6000 };
  const duration = durations[type] || 3000;

  // Clear any pending dismiss timer
  if (_toastTimer) clearTimeout(_toastTimer);

  // Build toast content with dismiss button
  elements.statusToast.innerHTML = '';
  const textSpan = document.createElement('span');
  textSpan.className = 'toast-text';
  textSpan.textContent = message;
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'toast-dismiss';
  dismissBtn.textContent = 'X';
  dismissBtn.addEventListener('click', () => {
    if (_toastTimer) clearTimeout(_toastTimer);
    elements.statusToast.classList.remove('show');
  });
  elements.statusToast.appendChild(textSpan);
  elements.statusToast.appendChild(dismissBtn);

  elements.statusToast.className = `status-toast ${type}`;
  elements.statusToast.classList.add('show');

  _toastTimer = setTimeout(() => {
    elements.statusToast.classList.remove('show');
  }, duration);
}

function handleKeyboardShortcuts(e) {
  // Ctrl/Cmd + S to save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (dashboardState.hasUnsavedChanges) {
      saveSettings();
    }
  }
  
  // Escape to discard changes
  if (e.key === 'Escape' && dashboardState.hasUnsavedChanges) {
    discardChanges();
  }
  
  // Ctrl/Cmd + T to test API
  if ((e.ctrlKey || e.metaKey) && e.key === 't') {
    e.preventDefault();
    testApiConnection();
  }
}

// Utility functions
function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(Object.keys(defaultSettings), (data) => {
      resolve({ ...defaultSettings, ...data });
    });
  });
}

// Debug Functions
async function testTokenTracking() {
  if (!analytics) {
    showDebugOutput('Analytics not initialized');
    return;
  }

  showDebugOutput('Testing token tracking...');

  // Test with fake data
  const testData = {
    model: 'grok-4-1-fast',
    inputTokens: 150,
    outputTokens: 75,
    success: true
  };
  
  try {
    await analytics.trackUsage(testData.model, testData.inputTokens, testData.outputTokens, testData.success);
    
    // Show current stats
    const stats = analytics.getStats('24h');
    showDebugOutput(`Test tracking completed!\n\nCurrent Stats:\n${JSON.stringify(stats, null, 2)}`);
    
    // Force chart and dashboard update
    if (analytics.chart) {
      const timeRange = document.getElementById('chartTimeRange')?.value || '24h';
      analytics.updateChart(timeRange);
      analytics.updateDashboardWithTimeRange(timeRange);
      loadDashboardCostBreakdown();
    }
  } catch (error) {
    showDebugOutput(`Error: ${error.message}`);
  }
}

async function viewStorageData() {
  try {
    const result = await chrome.storage.local.get(['fsbUsageData', 'fsbCurrentModel']);
    showDebugOutput(`Storage Data:\n${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    showDebugOutput(`Error: ${error.message}`);
  }
}

async function clearAnalyticsData() {
  if (confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
    try {
      await chrome.storage.local.remove(['fsbUsageData', 'fsbCurrentModel']);
      if (analytics) {
        analytics.usageData = [];
        analytics.currentModel = 'grok-4-1-fast';
        analytics.updateDashboard();
        loadDashboardCostBreakdown();
        analytics.updateChart('24h');
      }
      showDebugOutput('Analytics data cleared successfully');
      showToast('Analytics data cleared', 'success');
    } catch (error) {
      showDebugOutput(`Error: ${error.message}`);
    }
  }
}

async function exportAnalyticsData() {
  try {
    const result = await chrome.storage.local.get(['fsbUsageData', 'fsbCurrentModel']);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `fsb-analytics-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showDebugOutput('Analytics data exported successfully');
    showToast('Analytics data exported', 'success');
  } catch (error) {
    showDebugOutput(`Error: ${error.message}`);
  }
}

function showDebugOutput(content) {
  const debugOutput = document.getElementById('debugOutput');
  const debugContent = document.getElementById('debugContent');
  
  if (debugOutput && debugContent) {
    debugContent.textContent = content;
    debugOutput.style.display = 'block';
  }
}

// ==========================================
// Session History Functions
// ==========================================

// Current session being viewed
let currentViewingSession = null;

// Session replay state
let currentReplayData = null;
let currentStepIndex = 0;

/**
 * Initialize session history UI and event listeners
 */
function initializeSessionHistory() {
  // Top-level control buttons
  const refreshBtn = document.getElementById('refreshSessions');
  const clearAllBtn = document.getElementById('clearAllSessions');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadSessionList);
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllSessions);
  }

  // Event delegation on session list for all item/button clicks
  const sessionList = document.getElementById('sessionList');
  if (sessionList) {
    sessionList.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('.session-action-btn');
      const sessionItem = e.target.closest('.session-item');
      if (!sessionItem) return;
      const sessionId = sessionItem.dataset.sessionId;

      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        if (action === 'view') viewSession(sessionId);
        else if (action === 'download') downloadSessionLogs(sessionId);
        else if (action === 'delete') deleteSession(sessionId);
      } else {
        viewSession(sessionId);
      }
    });
  }

  // Load initial session list
  loadSessionList();
}

/**
 * Load and display the list of saved sessions
 */
async function loadSessionList() {
  const sessionList = document.getElementById('sessionList');
  if (!sessionList) return;

  try {
    // Get session index from storage
    const stored = await chrome.storage.local.get(['fsbSessionIndex']);
    const sessions = stored.fsbSessionIndex || [];

    if (sessions.length === 0) {
      sessionList.innerHTML = `
        <div class="session-empty-state">
          <i class="fas fa-inbox"></i>
          <p>No sessions recorded yet. Run an automation task to see session logs here.</p>
        </div>
      `;
      return;
    }

    // Render session items (using data-action attributes, no inline onclick)
    sessionList.innerHTML = sessions.map(session => `
      <div class="session-item" data-session-id="${session.id}">
        <div class="session-item-info">
          <div class="session-item-task">${escapeHtml(session.task || 'Unknown task')}</div>
          <div class="session-item-meta">
            <span><i class="fas fa-clock"></i> ${formatSessionDate(session.startTime)}</span>
            <span><i class="fas fa-play-circle"></i> ${session.actionCount || 0} actions</span>
            <span><i class="fas fa-hourglass-half"></i> ${formatSessionDuration(session.startTime, session.endTime)}</span>
          </div>
        </div>
        <div class="session-item-status">
          <span class="session-status-badge ${session.status}">${session.status}</span>
        </div>
        <div class="session-item-actions">
          <button class="session-action-btn view" data-action="view" title="View logs">
            <i class="fas fa-eye"></i>
          </button>
          <button class="session-action-btn download" data-action="download" title="Download logs">
            <i class="fas fa-download"></i>
          </button>
          <button class="session-action-btn delete" data-action="delete" title="Delete session">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    addLog('info', `Loaded ${sessions.length} sessions`);

  } catch (error) {
    console.error('Failed to load session list:', error);
    sessionList.innerHTML = `
      <div class="session-empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load sessions: ${error.message}</p>
      </div>
    `;
  }
}

/**
 * View a specific session's details and logs
 * @param {string} sessionId - The session ID to view
 */
async function viewSession(sessionId) {
  const sessionList = document.getElementById('sessionList');
  if (!sessionList) return;

  const sessionItem = sessionList.querySelector(`.session-item[data-session-id="${sessionId}"]`);
  if (!sessionItem) return;

  // Toggle: if same session is already expanded, collapse it
  if (sessionItem.classList.contains('expanded')) {
    collapseSessionDetail();
    return;
  }

  // Collapse any currently expanded session first
  collapseSessionDetail();

  try {
    // Load full session data
    const stored = await chrome.storage.local.get(['fsbSessionLogs']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const session = sessionStorage[sessionId];

    if (!session) {
      showToast('Session not found', 'error');
      return;
    }

    currentViewingSession = session;

    // Mark item as expanded
    sessionItem.classList.add('expanded');

    // Create inline detail wrapper and insert after the session item
    const wrapper = document.createElement('div');
    wrapper.className = 'session-detail-wrapper';
    wrapper.innerHTML = createInlineDetailHTML(session);
    sessionItem.after(wrapper);

    // Populate logs content
    const logsEl = wrapper.querySelector('#sessionLogsContent');
    if (logsEl) {
      logsEl.textContent = formatSessionLogsForDisplay(session);
    }

    // Attach event listeners to the new inline panel
    attachInlinePanelListeners(wrapper, session);

    // Load replay data
    renderSessionReplay(sessionId);

    // Scroll expanded item into view
    sessionItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    addLog('info', `Viewing session ${sessionId}`);

  } catch (error) {
    console.error('Failed to view session:', error);
    showToast('Failed to load session details', 'error');
  }
}

/**
 * Collapse any currently expanded session detail panel
 */
function collapseSessionDetail() {
  // Remove expanded class from any session item
  const expandedItem = document.querySelector('.session-item.expanded');
  if (expandedItem) {
    expandedItem.classList.remove('expanded');
  }

  // Remove the inline detail wrapper from DOM
  const wrapper = document.querySelector('.session-detail-wrapper');
  if (wrapper) {
    wrapper.remove();
  }

  currentViewingSession = null;
  currentReplayData = null;
  currentStepIndex = 0;
}

/**
 * Close the session detail panel (alias for collapseSessionDetail)
 */
function closeSessionDetail() {
  collapseSessionDetail();
}

/**
 * Create the inline detail panel HTML for a session
 * @param {Object} session - The session data object
 * @returns {string} HTML string for the inline detail panel
 */
function createInlineDetailHTML(session) {
  return `
    <div class="session-detail-panel" data-session-id="${session.id}">
      <div class="session-detail-header">
        <div class="session-detail-title">
          <h4 id="sessionDetailTitle">${escapeHtml(session.task || 'Unknown Task')}</h4>
          <span class="session-detail-status session-status-badge ${session.status}" id="sessionDetailStatus">${session.status}</span>
        </div>
        <div class="session-detail-actions">
          <button class="control-btn" id="exportSessionText" title="Export as human-readable text">
            <i class="fas fa-file-alt"></i>
            Export Text
          </button>
          <button class="control-btn" id="downloadSessionLogs" title="Download JSON logs">
            <i class="fas fa-download"></i>
            Download JSON
          </button>
          <button class="control-btn" id="closeSessionDetail">
            <i class="fas fa-times"></i>
            Close
          </button>
        </div>
      </div>
      <div class="session-detail-meta" id="sessionDetailMeta">
        <div class="session-meta-item">
          <span class="session-meta-label">Session ID</span>
          <span class="session-meta-value">${session.id}</span>
        </div>
        <div class="session-meta-item">
          <span class="session-meta-label">Started</span>
          <span class="session-meta-value">${new Date(session.startTime).toLocaleString()}</span>
        </div>
        <div class="session-meta-item">
          <span class="session-meta-label">Ended</span>
          <span class="session-meta-value">${new Date(session.endTime).toLocaleString()}</span>
        </div>
        <div class="session-meta-item">
          <span class="session-meta-label">Duration</span>
          <span class="session-meta-value">${formatSessionDuration(session.startTime, session.endTime)}</span>
        </div>
        <div class="session-meta-item">
          <span class="session-meta-label">Actions</span>
          <span class="session-meta-value">${session.actionCount || 0}</span>
        </div>
        <div class="session-meta-item">
          <span class="session-meta-label">Iterations</span>
          <span class="session-meta-value">${session.iterationCount || 'N/A'}</span>
        </div>
      </div>
      <div class="session-replay-container" id="sessionReplayContainer">
        <div class="replay-controls">
          <button class="replay-btn" id="prevStep" disabled>
            <i class="fas fa-chevron-left"></i> Prev
          </button>
          <span class="replay-step-indicator">
            Step <span id="currentStepNum">0</span> of <span id="totalSteps">0</span>
          </span>
          <button class="replay-btn" id="nextStep" disabled>
            Next <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="replay-step-content" id="replayStepContent">
          <div class="step-placeholder">Loading replay data...</div>
        </div>
        <div class="replay-summary" id="replaySummary" style="display: none;"></div>
      </div>
      <div class="session-logs-section">
        <button class="logs-toggle-btn" id="toggleRawLogs">
          <i class="fas fa-chevron-down"></i> Show Raw Logs
        </button>
        <div class="session-logs-container" id="rawLogsContainer" style="display: none;">
          <pre class="session-logs-content" id="sessionLogsContent">Loading...</pre>
        </div>
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to the dynamically created inline panel buttons
 * @param {HTMLElement} wrapper - The .session-detail-wrapper element
 * @param {Object} session - The session data object
 */
function attachInlinePanelListeners(wrapper, session) {
  const exportTextBtn = wrapper.querySelector('#exportSessionText');
  const downloadBtn = wrapper.querySelector('#downloadSessionLogs');
  const closeBtn = wrapper.querySelector('#closeSessionDetail');
  const prevStepBtn = wrapper.querySelector('#prevStep');
  const nextStepBtn = wrapper.querySelector('#nextStep');
  const toggleRawLogsBtn = wrapper.querySelector('#toggleRawLogs');

  if (exportTextBtn) {
    exportTextBtn.addEventListener('click', () => {
      exportSessionText(session.id);
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      downloadSessionLogs(session.id);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', collapseSessionDetail);
  }

  if (prevStepBtn) {
    prevStepBtn.addEventListener('click', () => {
      if (currentStepIndex > 0) {
        renderStep(currentStepIndex - 1);
      }
    });
  }

  if (nextStepBtn) {
    nextStepBtn.addEventListener('click', () => {
      if (currentReplayData && currentStepIndex < currentReplayData.steps.length - 1) {
        renderStep(currentStepIndex + 1);
      }
    });
  }

  if (toggleRawLogsBtn) {
    toggleRawLogsBtn.addEventListener('click', () => {
      const rawLogsContainer = wrapper.querySelector('#rawLogsContainer');
      if (rawLogsContainer) {
        const isVisible = rawLogsContainer.style.display !== 'none';
        rawLogsContainer.style.display = isVisible ? 'none' : 'block';
        toggleRawLogsBtn.innerHTML = isVisible
          ? '<i class="fas fa-chevron-down"></i> Show Raw Logs'
          : '<i class="fas fa-chevron-up"></i> Hide Raw Logs';
        toggleRawLogsBtn.classList.toggle('expanded', !isVisible);
      }
    });
  }
}

/**
 * Download logs for the currently viewing session
 */
function downloadCurrentSessionLogs() {
  if (!currentViewingSession) {
    showToast('No session selected', 'warning');
    return;
  }
  downloadSessionLogs(currentViewingSession.id);
}

/**
 * Download raw JSON data for a specific session
 * @param {string} sessionId - The session ID to download
 */
async function downloadSessionLogs(sessionId) {
  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const session = sessionStorage[sessionId];

    if (!session) {
      showToast('Session not found', 'error');
      return;
    }

    // Download raw JSON session data
    const jsonStr = JSON.stringify(session, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date(session.startTime).toISOString().split('T')[0];
    const filename = `fsb-session-${timestamp}-${sessionId.replace('session_', '')}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Session JSON downloaded', 'success');
    addLog('info', `Downloaded session ${sessionId}`);

  } catch (error) {
    console.error('Failed to download session:', error);
    showToast('Failed to download session logs', 'error');
  }
}

/**
 * Delete a specific session
 * @param {string} sessionId - The session ID to delete
 */
async function deleteSession(sessionId) {
  if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) {
    return;
  }

  try {
    const stored = await chrome.storage.local.get(['fsbSessionLogs', 'fsbSessionIndex']);
    const sessionStorage = stored.fsbSessionLogs || {};
    const sessionIndex = stored.fsbSessionIndex || [];

    // Remove from storage
    delete sessionStorage[sessionId];

    // Remove from index
    const updatedIndex = sessionIndex.filter(s => s.id !== sessionId);

    // Save changes
    await chrome.storage.local.set({
      fsbSessionLogs: sessionStorage,
      fsbSessionIndex: updatedIndex
    });

    // Close detail panel if viewing this session
    if (currentViewingSession && currentViewingSession.id === sessionId) {
      closeSessionDetail();
    }

    // Refresh list
    loadSessionList();

    showToast('Session deleted', 'success');
    addLog('info', `Deleted session ${sessionId}`);

  } catch (error) {
    console.error('Failed to delete session:', error);
    showToast('Failed to delete session', 'error');
  }
}

/**
 * Clear all saved sessions
 */
async function clearAllSessions() {
  if (!confirm('Are you sure you want to delete ALL session history? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.local.remove(['fsbSessionLogs', 'fsbSessionIndex']);

    closeSessionDetail();
    loadSessionList();

    showToast('All sessions cleared', 'success');
    addLog('info', 'All sessions cleared');

  } catch (error) {
    console.error('Failed to clear sessions:', error);
    showToast('Failed to clear sessions', 'error');
  }
}

// Session functions are now accessed via event delegation - no global window exposure needed

/**
 * Format session logs for display in the detail panel
 * @param {Object} session - The session object
 * @returns {string} Formatted logs text
 */
function formatSessionLogsForDisplay(session) {
  if (!session.logs || session.logs.length === 0) {
    return 'No logs recorded for this session.';
  }

  return session.logs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let line = `[${time}] [${log.level.toUpperCase()}] ${log.message}`;

    // Add relevant data if present
    if (log.data) {
      const dataStr = formatLogDataCompact(log.data);
      if (dataStr) {
        line += `\n    ${dataStr}`;
      }
    }

    return line;
  }).join('\n');
}

/**
 * Format log data compactly for display
 * @param {Object} data - Log data object
 * @returns {string} Formatted data string
 */
function formatLogDataCompact(data) {
  if (!data) return '';

  const parts = [];

  if (data.action) {
    const paramsStr = JSON.stringify(data.action.params || {});
    parts.push(`Action: ${data.action.tool}(${paramsStr.substring(0, 100)}${paramsStr.length > 100 ? '...' : ''})`);
  }
  if (data.result && typeof data.result === 'object' && data.result.success !== undefined) {
    parts.push(`Result: ${data.result.success ? 'success' : 'failed'}`);
    if (data.result.error) {
      parts.push(`Error: ${data.result.error}`);
    }
  }
  if (data.iterationCount !== undefined) {
    parts.push(`Iteration: ${data.iterationCount}`);
  }
  if (data.taskComplete !== undefined) {
    parts.push(`Task Complete: ${data.taskComplete}`);
  }
  if (data.actionCount !== undefined && parts.length === 0) {
    parts.push(`Actions: ${data.actionCount}`);
  }

  return parts.join(' | ');
}

/**
 * Format a full session report for download
 * @param {Object} session - The session object
 * @returns {string} Formatted report text
 */
function formatSessionReport(session) {
  const lines = [];
  const divider = '='.repeat(80);
  const shortDivider = '-'.repeat(80);

  // Header
  lines.push(divider);
  lines.push('FSB Automation Session Report');
  lines.push(divider);
  lines.push('');

  // Session info
  lines.push(`Session ID: ${session.id}`);
  lines.push(`Task: ${session.task}`);
  lines.push(`Started: ${new Date(session.startTime).toLocaleString()}`);
  lines.push(`Ended: ${new Date(session.endTime).toLocaleString()}`);
  lines.push(`Status: ${session.status.toUpperCase()}`);
  lines.push(`Duration: ${formatSessionDuration(session.startTime, session.endTime)}`);
  lines.push(`Total Actions: ${session.actionCount}`);
  lines.push(`Iterations: ${session.iterationCount || 'N/A'}`);
  lines.push('');

  // Process logs to extract conversations by iteration
  const conversationLogs = extractConversationLogs(session.logs || []);
  const tokenUsageLogs = extractTokenUsageLogs(session.logs || []);
  const actionLogs = extractActionLogs(session.logs || []);
  const timingLogs = extractTimingLogs(session.logs || []);
  const commLogs = extractCommLogs(session.logs || []);
  const recoveryLogs = extractRecoveryLogs(session.logs || []);

  // AI Conversation Log Section
  if (conversationLogs.length > 0) {
    lines.push(divider);
    lines.push('AI CONVERSATION LOG');
    lines.push(divider);
    lines.push('');

    conversationLogs.forEach(conv => {
      lines.push(`${shortDivider}`);
      lines.push(`--- Iteration ${conv.iteration} ---`);
      lines.push('');

      // Prompt section
      if (conv.prompt) {
        lines.push(`[PROMPT - System] (${conv.prompt.systemPromptLength || 0} chars)`);
        if (conv.prompt.systemPrompt) {
          lines.push(conv.prompt.systemPrompt.substring(0, 2000));
          if (conv.prompt.systemPrompt.length > 2000) {
            lines.push('... [TRUNCATED]');
          }
        }
        lines.push('');
        lines.push(`[PROMPT - User] (${conv.prompt.userPromptLength || 0} chars)`);
        if (conv.prompt.userPrompt) {
          lines.push(conv.prompt.userPrompt.substring(0, 3000));
          if (conv.prompt.userPrompt.length > 3000) {
            lines.push('... [TRUNCATED]');
          }
        }
        lines.push('');
      }

      // Raw response section
      if (conv.rawResponse) {
        lines.push(`[RAW RESPONSE] (${conv.rawResponse.rawResponseLength || 0} chars, parse: ${conv.rawResponse.parseSuccess ? 'success' : 'failed'})`);
        if (conv.rawResponse.rawResponse) {
          lines.push(conv.rawResponse.rawResponse.substring(0, 2000));
          if (conv.rawResponse.rawResponse.length > 2000) {
            lines.push('... [TRUNCATED]');
          }
        }
        lines.push('');
      }

      // Reasoning section
      if (conv.reasoning) {
        lines.push('[REASONING]');
        if (conv.reasoning.situationAnalysis) {
          lines.push(`Situation: ${conv.reasoning.situationAnalysis}`);
        }
        if (conv.reasoning.goalAssessment) {
          lines.push(`Goal: ${conv.reasoning.goalAssessment}`);
        }
        if (conv.reasoning.reasoning) {
          lines.push(`Reasoning: ${conv.reasoning.reasoning}`);
        }
        if (conv.reasoning.confidence) {
          lines.push(`Confidence: ${conv.reasoning.confidence}`);
        }
        if (conv.reasoning.assumptions && conv.reasoning.assumptions.length > 0) {
          lines.push(`Assumptions: ${JSON.stringify(conv.reasoning.assumptions)}`);
        }
        if (conv.reasoning.fallbackPlan) {
          lines.push(`Fallback: ${conv.reasoning.fallbackPlan}`);
        }
        lines.push('');
      }

      // Token usage for this iteration
      if (conv.tokenUsage) {
        lines.push('[TOKEN USAGE]');
        lines.push(`Model: ${conv.tokenUsage.model} | Input: ${conv.tokenUsage.inputTokens} | Output: ${conv.tokenUsage.outputTokens} | Total: ${conv.tokenUsage.totalTokens} | Source: ${conv.tokenUsage.source}`);
        lines.push('');
      }

      lines.push('');
    });
  }

  // Timing Analysis Section
  if (timingLogs.length > 0) {
    lines.push(divider);
    lines.push('TIMING ANALYSIS');
    lines.push(divider);
    lines.push('');

    // Group timings by category
    const timingByCategory = {};
    timingLogs.forEach(t => {
      const key = t.category || 'OTHER';
      if (!timingByCategory[key]) {
        timingByCategory[key] = [];
      }
      timingByCategory[key].push(t.durationMs);
    });

    lines.push('Category        | Count | Avg (ms) | Min    | Max    | Total');
    lines.push(shortDivider);

    Object.entries(timingByCategory).forEach(([category, durations]) => {
      const count = durations.length;
      const total = durations.reduce((a, b) => a + b, 0);
      const avg = Math.round(total / count);
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      lines.push(`${category.padEnd(15)} | ${String(count).padStart(5)} | ${String(avg).padStart(8)} | ${String(min).padStart(6)} | ${String(max).padStart(6)} | ${String(total).padStart(6)}`);
    });

    lines.push('');
  }

  // Communication Log Section
  if (commLogs.length > 0) {
    lines.push(divider);
    lines.push('COMMUNICATION LOG');
    lines.push(divider);
    lines.push('');

    commLogs.slice(0, 50).forEach(comm => {
      const time = new Date(comm.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
      const direction = comm.direction.toUpperCase().padEnd(7);
      const success = comm.success ? 'OK' : 'FAIL';
      lines.push(`[${time}] ${direction} ${comm.type.padEnd(25)} ${success}`);
    });

    if (commLogs.length > 50) {
      lines.push(`... and ${commLogs.length - 50} more communication events`);
    }
    lines.push('');
  }

  // Recovery Events Section
  if (recoveryLogs.length > 0) {
    lines.push(divider);
    lines.push('RECOVERY EVENTS');
    lines.push(divider);
    lines.push('');

    recoveryLogs.forEach(recovery => {
      const time = new Date(recovery.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });
      lines.push(`[${time}] ${recovery.issue} -> ${recovery.action} -> ${recovery.result}`);
      if (recovery.details) {
        lines.push(`  Details: ${JSON.stringify(recovery.details)}`);
      }
    });

    lines.push('');
  }

  // Token Usage Summary
  if (tokenUsageLogs.length > 0) {
    lines.push(divider);
    lines.push('TOKEN USAGE SUMMARY');
    lines.push(divider);
    lines.push('');

    let totalInput = 0;
    let totalOutput = 0;

    tokenUsageLogs.forEach(usage => {
      totalInput += usage.inputTokens || 0;
      totalOutput += usage.outputTokens || 0;
      lines.push(`Iteration ${usage.iteration || 'N/A'}: Model=${usage.model}, In=${usage.inputTokens}, Out=${usage.outputTokens}, Source=${usage.source}`);
    });

    lines.push('');
    lines.push(`TOTAL: Input=${totalInput}, Output=${totalOutput}, Combined=${totalInput + totalOutput}`);
    lines.push('');
  }

  // Log entries (standard format)
  lines.push(divider);
  lines.push('SESSION LOGS');
  lines.push(divider);
  lines.push('');

  if (session.logs && session.logs.length > 0) {
    session.logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });

      lines.push(`[${time}] [${log.level.toUpperCase()}] ${log.message}`);

      if (log.data) {
        const dataStr = formatLogDataForReport(log.data);
        if (dataStr) {
          lines.push(`  ${dataStr}`);
        }
      }
      lines.push('');
    });
  } else {
    lines.push('No logs recorded for this session.');
  }

  lines.push(divider);
  lines.push(`Report generated: ${new Date().toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Extract conversation logs grouped by iteration
 * @param {Array} logs - Array of log entries
 * @returns {Array} Conversation logs grouped by iteration
 */
function extractConversationLogs(logs) {
  const iterations = new Map();

  logs.forEach(log => {
    if (!log.data || !log.data.logType) return;

    const iteration = log.data.iteration || 0;
    if (!iterations.has(iteration)) {
      iterations.set(iteration, {
        iteration: iteration,
        prompt: null,
        rawResponse: null,
        reasoning: null,
        tokenUsage: null
      });
    }

    const conv = iterations.get(iteration);

    switch (log.data.logType) {
      case 'prompt':
        conv.prompt = log.data;
        break;
      case 'rawResponse':
        conv.rawResponse = log.data;
        break;
      case 'reasoning':
        conv.reasoning = log.data;
        break;
      case 'tokenUsage':
        conv.tokenUsage = log.data;
        break;
    }
  });

  // Convert to array and sort by iteration
  return Array.from(iterations.values())
    .filter(conv => conv.prompt || conv.rawResponse || conv.reasoning)
    .sort((a, b) => a.iteration - b.iteration);
}

/**
 * Extract token usage logs
 * @param {Array} logs - Array of log entries
 * @returns {Array} Token usage log entries
 */
function extractTokenUsageLogs(logs) {
  return logs
    .filter(log => log.data && log.data.logType === 'tokenUsage')
    .map(log => log.data)
    .sort((a, b) => (a.iteration || 0) - (b.iteration || 0));
}

/**
 * Extract action logs
 * @param {Array} logs - Array of log entries
 * @returns {Array} Action log entries
 */
function extractActionLogs(logs) {
  return logs
    .filter(log => log.data && log.data.action)
    .map(log => ({
      timestamp: log.timestamp,
      action: log.data.action,
      result: log.data.result
    }));
}

/**
 * Extract timing logs
 * @param {Array} logs - Array of log entries
 * @returns {Array} Timing log entries
 */
function extractTimingLogs(logs) {
  return logs
    .filter(log => log.data && log.data.logType === 'timing')
    .map(log => ({
      timestamp: log.timestamp,
      category: log.data.category,
      operation: log.data.operation,
      durationMs: log.data.durationMs
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Extract communication logs
 * @param {Array} logs - Array of log entries
 * @returns {Array} Communication log entries
 */
function extractCommLogs(logs) {
  return logs
    .filter(log => log.data && log.data.logType === 'comm')
    .map(log => ({
      timestamp: log.timestamp,
      direction: log.data.direction,
      type: log.data.type,
      success: log.data.success
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Extract recovery event logs
 * @param {Array} logs - Array of log entries
 * @returns {Array} Recovery event log entries
 */
function extractRecoveryLogs(logs) {
  return logs
    .filter(log => log.data && log.data.logType === 'recovery')
    .map(log => ({
      timestamp: log.timestamp,
      issue: log.data.issue,
      action: log.data.action,
      result: log.data.result,
      details: log.data.details || null
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Format log data for report export
 * @param {Object} data - Log data object
 * @returns {string} Formatted data string
 */
function formatLogDataForReport(data) {
  if (!data) return '';

  const parts = [];

  // Handle new log types
  if (data.logType) {
    switch (data.logType) {
      case 'prompt':
        parts.push(`Prompt: System(${data.systemPromptLength}), User(${data.userPromptLength}), Est. tokens: ${data.estimatedTokens}`);
        break;
      case 'rawResponse':
        parts.push(`Raw Response: ${data.rawResponseLength} chars, Parse: ${data.parseSuccess ? 'OK' : 'FAILED'}`);
        break;
      case 'reasoning':
        if (data.confidence) parts.push(`Confidence: ${data.confidence}`);
        if (data.currentStep) parts.push(`Step: ${data.currentStep}`);
        break;
      case 'domState':
        parts.push(`DOM: ${data.elementCount} elements, URL: ${data.url}, Delta: ${data.isDelta}`);
        break;
      case 'contentMessage':
        parts.push(`${data.direction.toUpperCase()}: ${data.messageType}, Success: ${data.success}`);
        break;
      case 'tokenUsage':
        parts.push(`Tokens: In=${data.inputTokens}, Out=${data.outputTokens}, Model=${data.model}, Source=${data.source}`);
        break;
      case 'timing':
        parts.push(`Timing: ${data.category}/${data.operation} took ${data.durationMs}ms`);
        break;
      case 'comm':
        parts.push(`Comm: ${data.direction} ${data.type} - ${data.success ? 'success' : 'failed'}`);
        break;
      case 'recovery':
        parts.push(`Recovery: ${data.issue} -> ${data.action} -> ${data.result}`);
        break;
      case 'navigation':
        parts.push(`Navigation: ${data.type} from ${data.from} to ${data.to}`);
        break;
      case 'domOperation':
        parts.push(`DOM: ${data.operation}`);
        break;
      case 'actionExec':
        parts.push(`Action: ${data.tool} (${data.phase})`);
        break;
      case 'api':
        parts.push(`API: ${data.provider}/${data.operation}`);
        break;
      case 'serviceWorker':
        parts.push(`ServiceWorker: ${data.event}`);
        break;
      case 'init':
        parts.push(`Init: ${data.component} - ${data.status}`);
        break;
    }
    return parts.join(' | ');
  }

  // Handle legacy log formats
  if (data.action) {
    parts.push(`Action: ${data.action.tool}(${JSON.stringify(data.action.params || {})})`);
  }
  if (data.result !== undefined) {
    const resultStr = typeof data.result === 'object'
      ? JSON.stringify(data.result)
      : String(data.result);
    parts.push(`Result: ${resultStr.substring(0, 200)}${resultStr.length > 200 ? '...' : ''}`);
  }
  if (data.error) {
    parts.push(`Error: ${data.error}`);
  }
  if (data.iterationCount !== undefined) {
    parts.push(`Iteration: ${data.iterationCount}`);
  }
  if (data.domHash) {
    parts.push(`DOM Hash: ${data.domHash}`);
  }
  if (data.stuckCounter !== undefined) {
    parts.push(`Stuck Counter: ${data.stuckCounter}`);
  }

  return parts.join(' | ');
}

/**
 * Format session date for display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string
 */
function formatSessionDate(timestamp) {
  if (!timestamp) return 'Unknown';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return `${mins}m ago`;
  } else if (diffHours < 24) {
    return `${Math.floor(diffHours)}h ago`;
  } else if (diffHours < 48) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Format session duration
 * @param {number} startTime - Start timestamp
 * @param {number} endTime - End timestamp
 * @returns {string} Formatted duration string
 */
function formatSessionDuration(startTime, endTime) {
  if (!startTime || !endTime) return 'Unknown';

  const durationMs = endTime - startTime;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================
// Session Replay Functions
// ==========================================

/**
 * Render session replay data with step-by-step navigation
 * @param {string} sessionId - The session ID to render replay for
 */
async function renderSessionReplay(sessionId) {
  // Get replay data from background (automationLogger runs there)
  const response = await chrome.runtime.sendMessage({
    action: 'getSessionReplayData',
    sessionId
  });

  if (!response?.replay || !response.replay.steps || response.replay.steps.length === 0) {
    document.getElementById('replayStepContent').innerHTML = '<div class="step-placeholder">No replay data available for this session</div>';
    document.getElementById('replaySummary').style.display = 'none';
    document.getElementById('prevStep').disabled = true;
    document.getElementById('nextStep').disabled = true;
    document.getElementById('currentStepNum').textContent = '0';
    document.getElementById('totalSteps').textContent = '0';
    return;
  }

  currentReplayData = response.replay;
  currentStepIndex = 0;

  // Update controls
  document.getElementById('totalSteps').textContent = currentReplayData.steps.length;
  document.getElementById('prevStep').disabled = true;
  document.getElementById('nextStep').disabled = currentReplayData.steps.length <= 1;

  // Render first step
  renderStep(0);

  // Show summary
  renderReplaySummary();
}

/**
 * Render a specific step in the replay
 * @param {number} index - Step index to render
 */
function renderStep(index) {
  if (!currentReplayData || !currentReplayData.steps) return;

  const step = currentReplayData.steps[index];
  if (!step) return;

  currentStepIndex = index;
  document.getElementById('currentStepNum').textContent = index + 1;
  document.getElementById('prevStep').disabled = index === 0;
  document.getElementById('nextStep').disabled = index === currentReplayData.steps.length - 1;

  const statusClass = step.result.success ? 'success' : 'failed';
  const statusText = step.result.success ? 'OK' : 'FAILED';

  let html = `
    <div class="step-header">
      <span class="step-status ${statusClass}">${statusText}</span>
      <strong>${escapeHtml(step.action.tool)}</strong>
    </div>
    <div class="step-section">
      <h5>Targeting</h5>
      <div class="step-detail">Selector: <code>${escapeHtml(step.targeting.selectorUsed || step.targeting.selectorTried || 'N/A')}</code></div>
      <div class="step-detail">Element Found: ${step.targeting.elementFound ? 'Yes' : 'No'}</div>
      ${step.targeting.coordinatesUsed ? `<div class="step-detail">Coordinates: (${step.targeting.coordinatesUsed.x}, ${step.targeting.coordinatesUsed.y})</div>` : ''}
    </div>
  `;

  if (step.targeting.elementDetails) {
    const el = step.targeting.elementDetails;
    const tagDisplay = `&lt;${el.tagName || 'unknown'}${el.id ? ' id="' + escapeHtml(el.id) + '"' : ''}${el.className ? ' class="' + escapeHtml(el.className.split(' ')[0]) + '"' : ''}&gt;`;
    html += `
      <div class="step-section">
        <h5>Element</h5>
        <div class="step-detail">${tagDisplay}</div>
        ${el.text ? `<div class="step-detail">Text: "${escapeHtml(el.text.substring(0, 50))}${el.text.length > 50 ? '...' : ''}"</div>` : ''}
      </div>
    `;
  }

  // Show action parameters if any
  if (step.action.params && Object.keys(step.action.params).length > 0) {
    const paramsStr = JSON.stringify(step.action.params, null, 2);
    html += `
      <div class="step-section">
        <h5>Parameters</h5>
        <div class="step-detail" style="white-space: pre-wrap; font-size: 0.8rem;">${escapeHtml(paramsStr.substring(0, 300))}${paramsStr.length > 300 ? '...' : ''}</div>
      </div>
    `;
  }

  if (!step.result.success && step.result.diagnostic) {
    html += `
      <div class="step-section">
        <h5>Diagnostic</h5>
        <div class="step-detail" style="color: var(--error-color);">${escapeHtml(step.result.diagnostic.message || 'Unknown error')}</div>
        ${step.result.diagnostic.details ? `<div class="step-detail">${escapeHtml(step.result.diagnostic.details)}</div>` : ''}
        ${step.result.diagnostic.suggestions && step.result.diagnostic.suggestions.length > 0 ? `<div class="step-detail">Suggestions:<br>${step.result.diagnostic.suggestions.map(s => '  - ' + escapeHtml(s)).join('<br>')}</div>` : ''}
      </div>
    `;
  } else if (!step.result.success && step.result.error) {
    html += `
      <div class="step-section">
        <h5>Error</h5>
        <div class="step-detail" style="color: var(--error-color);">${escapeHtml(step.result.error)}</div>
      </div>
    `;
  }

  document.getElementById('replayStepContent').innerHTML = html;
}

/**
 * Render the replay summary section
 */
function renderReplaySummary() {
  if (!currentReplayData || !currentReplayData.summary) {
    document.getElementById('replaySummary').style.display = 'none';
    return;
  }

  const summary = currentReplayData.summary;
  let summaryHtml = `
    <strong>Summary:</strong> ${summary.successfulSteps}/${summary.totalSteps} steps successful
    ${summary.failedSteps > 0 ? ` | <span style="color: var(--error-color);">${summary.failedSteps} failed</span>` : ''}
  `;

  document.getElementById('replaySummary').innerHTML = summaryHtml;
  document.getElementById('replaySummary').style.display = 'block';
}

/**
 * Export session as human-readable text
 * @param {string} sessionId - The session ID to export
 */
async function exportSessionText(sessionId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'exportSessionHumanReadable',
      sessionId
    });

    if (response?.text) {
      const blob = new Blob([response.text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fsb-session-${sessionId.substring(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Session report exported', 'success');
      addLog('info', `Exported session ${sessionId} as text`);
    } else {
      showToast('Failed to export session', 'error');
    }
  } catch (error) {
    console.error('Failed to export session text:', error);
    showToast('Export failed: ' + error.message, 'error');
  }
}

// ==========================================
// Credential Vault Lifecycle (Passwords Beta)
// ==========================================

let _vaultPinSetup = null;
let _vaultPinConfirm = null;
let _vaultPinUnlock = null;
let _vaultSetupDigits = 6;
let _unlockSubmitting = false;

async function loadCredentialVaultStatus() {
  const statusText = document.getElementById('credentialVaultStatusText');
  const setupPanel = document.getElementById('credentialVaultSetup');
  const unlockPanel = document.getElementById('credentialVaultUnlock');
  const unlockedPanel = document.getElementById('credentialVaultUnlocked');
  const lockBtn = document.getElementById('lockCredentialVaultBtn');
  const manager = document.getElementById('credentialsManager');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCredentialVaultStatus' });
    if (!response) {
      if (statusText) statusText.textContent = 'Unable to reach vault service';
      return;
    }

    // Hide all state panels first
    if (setupPanel) setupPanel.style.display = 'none';
    if (unlockPanel) unlockPanel.style.display = 'none';
    if (unlockedPanel) unlockedPanel.style.display = 'none';
    if (lockBtn) lockBtn.style.display = 'none';

    if (!response.configured) {
      if (statusText) statusText.textContent = 'No vault configured. Create one to protect saved credentials.';
      if (setupPanel) setupPanel.style.display = 'block';
      if (manager) manager.style.display = 'none';
      // Initialize setup PIN inputs
      const setupContainer = document.getElementById('credentialVaultPinSetup');
      const confirmContainer = document.getElementById('credentialVaultPinConfirm');
      if (setupContainer && !_vaultPinSetup) {
        _vaultPinSetup = createPinInput(setupContainer, _vaultSetupDigits);
        _vaultPinConfirm = createPinInput(confirmContainer, _vaultSetupDigits);
      }
    } else if (!response.unlocked) {
      if (statusText) statusText.textContent = 'Vault is locked.';
      if (unlockPanel) unlockPanel.style.display = 'block';
      if (manager) manager.style.display = 'none';
      // Initialize unlock PIN input
      const unlockContainer = document.getElementById('credentialVaultPinUnlock');
      const pinLen = response.pinLength || 6;
      if (unlockContainer) {
        _unlockSubmitting = false;
        _vaultPinUnlock = createPinInput(unlockContainer, pinLen, {
          onComplete: (pin) => submitVaultUnlock(pin)
        });
      }
    } else {
      if (statusText) statusText.textContent = 'Vault unlocked for this session.';
      if (unlockedPanel) unlockedPanel.style.display = 'block';
      if (lockBtn) lockBtn.style.display = 'inline-flex';
      if (manager) {
        manager.style.display = 'block';
        loadCredentials();
      }
    }
  } catch (error) {
    console.error('Failed to check vault status:', error);
    if (statusText) statusText.textContent = 'Error checking vault status.';
  }
}

async function submitVaultUnlock(pin) {
  if (_unlockSubmitting) return;
  _unlockSubmitting = true;
  const unlockBtn = document.getElementById('unlockCredentialVaultBtn');
  if (unlockBtn) { unlockBtn.disabled = true; unlockBtn.textContent = 'Unlocking...'; }
  try {
    const response = await chrome.runtime.sendMessage({ action: 'unlockCredentialVault', passphrase: pin });
    if (response?.success) {
      showToast('Vault unlocked', 'success');
      loadCredentialVaultStatus();
      loadPaymentVaultStatus();
    } else {
      showToast(response?.error || 'Incorrect PIN', 'error');
      if (_vaultPinUnlock) _vaultPinUnlock.clear();
    }
  } catch (error) {
    showToast('Error unlocking vault: ' + error.message, 'error');
    if (_vaultPinUnlock) _vaultPinUnlock.clear();
  } finally {
    _unlockSubmitting = false;
    if (unlockBtn) { unlockBtn.disabled = false; unlockBtn.textContent = 'Unlock Vault'; }
  }
}

function initCredentialVaultListeners() {
  const setupBtn = document.getElementById('setupCredentialVaultBtn');
  const unlockBtn = document.getElementById('unlockCredentialVaultBtn');
  const lockBtn = document.getElementById('lockCredentialVaultBtn');

  // PIN length toggle for setup
  document.querySelectorAll('.pin-length-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const len = parseInt(btn.dataset.pinLength);
      _vaultSetupDigits = len;
      document.querySelectorAll('.pin-length-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (_vaultPinSetup) _vaultPinSetup.setDigitCount(len);
      if (_vaultPinConfirm) _vaultPinConfirm.setDigitCount(len);
    });
  });

  if (setupBtn) {
    setupBtn.addEventListener('click', async () => {
      const pin = _vaultPinSetup ? _vaultPinSetup.getValue() : '';
      const confirmPin = _vaultPinConfirm ? _vaultPinConfirm.getValue() : '';
      if (!pin || !/^\d{4}$|^\d{6}$/.test(pin)) {
        showToast('Enter all ' + _vaultSetupDigits + ' digits', 'error');
        return;
      }
      if (pin !== confirmPin) {
        showToast('PINs do not match', 'error');
        if (_vaultPinConfirm) _vaultPinConfirm.clear();
        return;
      }
      setupBtn.disabled = true;
      setupBtn.textContent = 'Creating...';
      try {
        const response = await chrome.runtime.sendMessage({ action: 'createCredentialVault', passphrase: pin });
        if (response?.success) {
          showToast('Credential vault created', 'success');
          _vaultPinSetup = null;
          _vaultPinConfirm = null;
          loadCredentialVaultStatus();
          loadPaymentVaultStatus();
        } else {
          showToast(response?.error || 'Failed to create vault', 'error');
        }
      } catch (error) {
        showToast('Error creating vault: ' + error.message, 'error');
      } finally {
        setupBtn.disabled = false;
        setupBtn.textContent = 'Set Up Vault';
      }
    });
  }

  if (unlockBtn) {
    unlockBtn.addEventListener('click', async () => {
      const pin = _vaultPinUnlock ? _vaultPinUnlock.getValue() : '';
      if (!pin || !/^\d+$/.test(pin)) {
        showToast('Enter your PIN', 'error');
        return;
      }
      submitVaultUnlock(pin);
    });
  }

  if (lockBtn) {
    lockBtn.addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'lockCredentialVault' });
        if (response?.success) {
          showToast('Vault locked', 'success');
          _vaultPinUnlock = null;
          loadCredentialVaultStatus();
          loadPaymentVaultStatus();
        }
      } catch (error) {
        showToast('Error locking vault: ' + error.message, 'error');
      }
    });
  }
}

async function loadPaymentVaultStatus() {
  const statusText = document.getElementById('paymentMethodsStatusText');
  const blockedPanel = document.getElementById('paymentMethodsBlocked');
  const unlockPanel = document.getElementById('paymentMethodsUnlock');
  const unlockedPanel = document.getElementById('paymentMethodsUnlocked');
  const lockBtn = document.getElementById('lockPaymentMethodsBtn');
  const paymentManager = document.getElementById('paymentMethodsManager');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getPaymentVaultStatus' });
    if (!response) {
      if (statusText) statusText.textContent = 'Unable to reach vault service';
      return;
    }

    // Hide all state panels first
    if (blockedPanel) blockedPanel.style.display = 'none';
    if (unlockPanel) unlockPanel.style.display = 'none';
    if (unlockedPanel) unlockedPanel.style.display = 'none';
    if (lockBtn) lockBtn.style.display = 'none';
    if (paymentManager) paymentManager.style.display = 'none';

    if (!response.configured || !response.unlocked) {
      // Credential vault not configured or locked -- payment methods blocked
      if (statusText) statusText.textContent = 'Unlock the credential vault first.';
      if (blockedPanel) blockedPanel.style.display = 'block';
    } else if (!response.paymentUnlocked) {
      // Credential vault unlocked but payment access locked
      if (statusText) statusText.textContent = 'Payment methods are locked.';
      if (unlockPanel) unlockPanel.style.display = 'block';
    } else {
      // Payment methods fully unlocked
      if (statusText) statusText.textContent = 'Payment methods unlocked for this session.';
      if (unlockedPanel) unlockedPanel.style.display = 'block';
      if (lockBtn) lockBtn.style.display = 'inline-flex';
    }
  } catch (error) {
    console.error('Failed to check payment vault status:', error);
    if (statusText) statusText.textContent = 'Error checking payment status.';
  }
}

// ==========================================
// Credential Manager Functions (Passwords Beta)
// ==========================================

// Current state for credential modal
let credentialModalMode = 'add'; // 'add' or 'edit'
let credentialEditingDomain = null;

// Show/hide credentials manager based on toggle
function updateCaptchaSolverVisibility(enabled) {
  const configPanel = document.getElementById('captchaSolverConfig');
  if (configPanel) {
    configPanel.style.display = enabled ? 'block' : 'none';
  }
}

function updateCredentialsManagerVisibility(enabled) {
  const manager = document.getElementById('credentialsManager');
  if (manager) {
    // Only show manager if vault is unlocked (vault status drives visibility now)
    if (enabled) {
      loadCredentialVaultStatus();
      loadPaymentVaultStatus();
    } else {
      manager.style.display = 'none';
    }
  }
}

// Load and display all credentials
async function loadCredentials() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllCredentials' });

    if (!response || !response.success) {
      console.error('Failed to load credentials:', response?.error);
      return;
    }

    const credentials = response.credentials || [];
    const listEl = document.getElementById('credentialsList');
    const emptyEl = document.getElementById('credentialsEmpty');

    if (credentials.length === 0) {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    if (listEl) {
      listEl.innerHTML = credentials.map(cred => renderCredentialCard(cred)).join('');
    }
  } catch (error) {
    console.error('Error loading credentials:', error);
  }
}

// Render a single credential card
function renderCredentialCard(cred) {
  const initial = (cred.domain || '?')[0].toUpperCase();
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cred.domain)}&sz=32`;
  const dateStr = cred.updatedAt ? new Date(cred.updatedAt).toLocaleDateString() : '';

  return `
    <div class="credential-card" data-domain="${escapeHtml(cred.domain)}">
      <div class="credential-card-icon">
        <img src="${faviconUrl}" alt="${initial}" onerror="this.style.display='none';this.parentNode.textContent='${initial}'">
      </div>
      <div class="credential-card-info">
        <div class="credential-card-domain">${escapeHtml(cred.domain)}</div>
        <div class="credential-card-username">${escapeHtml(cred.username || 'No username')}</div>
      </div>
      <div class="credential-card-password" data-domain="${escapeHtml(cred.domain)}">
        <span class="password-dots">--------</span>
      </div>
      <div class="credential-card-actions">
        <button class="credential-action-btn" data-cred-action="toggle-password" data-cred-domain="${escapeHtml(cred.domain)}" title="Show password">
          <i class="fas fa-eye"></i>
        </button>
        <button class="credential-action-btn" data-cred-action="edit" data-cred-domain="${escapeHtml(cred.domain)}" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="credential-action-btn delete" data-cred-action="delete" data-cred-domain="${escapeHtml(cred.domain)}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

// Filter credentials by search query
function filterCredentials(query) {
  const cards = document.querySelectorAll('.credential-card');
  const lowerQuery = query.toLowerCase();

  cards.forEach(card => {
    const domain = card.dataset.domain || '';
    const username = card.querySelector('.credential-card-username')?.textContent || '';
    const matches = domain.toLowerCase().includes(lowerQuery) ||
                    username.toLowerCase().includes(lowerQuery);
    card.style.display = matches ? 'flex' : 'none';
  });
}

// Show add/edit modal
async function showCredentialModal(mode, domain) {
  credentialModalMode = mode;
  credentialEditingDomain = domain || null;

  const modal = document.getElementById('credentialModal');
  const titleEl = document.getElementById('credentialModalTitle');
  const domainInput = document.getElementById('credModalDomain');
  const usernameInput = document.getElementById('credModalUsername');
  const passwordInput = document.getElementById('credModalPassword');
  const notesInput = document.getElementById('credModalNotes');

  if (titleEl) titleEl.textContent = mode === 'edit' ? 'Edit Credential' : 'Add Credential';

  // Clear fields
  if (domainInput) domainInput.value = '';
  if (usernameInput) usernameInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (notesInput) notesInput.value = '';

  // Pre-fill for edit mode
  if (mode === 'edit' && domain) {
    if (domainInput) {
      domainInput.value = domain;
      domainInput.readOnly = true;
    }

    // Fetch full credential (including password) for editing
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getFullCredential',
        domain: domain
      });

      if (response?.success && response.credential) {
        if (usernameInput) usernameInput.value = response.credential.username || '';
        if (passwordInput) passwordInput.value = response.credential.password || '';
        if (notesInput) notesInput.value = response.credential.notes || '';
      }
    } catch (error) {
      console.error('Failed to load credential for editing:', error);
    }
  } else {
    if (domainInput) domainInput.readOnly = false;
  }

  // Show modal
  if (modal) modal.classList.remove('hidden');
}

// Hide modal
function hideCredentialModal() {
  const modal = document.getElementById('credentialModal');
  if (modal) modal.classList.add('hidden');
  credentialModalMode = 'add';
  credentialEditingDomain = null;
}

// Save credential from modal
async function saveCredentialFromModal() {
  const domain = document.getElementById('credModalDomain')?.value?.trim();
  const username = document.getElementById('credModalUsername')?.value?.trim();
  const password = document.getElementById('credModalPassword')?.value;
  const notes = document.getElementById('credModalNotes')?.value?.trim();

  if (!domain) {
    showToast('Domain is required', 'error');
    return;
  }

  if (!username && !password) {
    showToast('Username or password is required', 'error');
    return;
  }

  try {
    const action = credentialModalMode === 'edit' ? 'updateCredential' : 'saveCredential';
    const message = credentialModalMode === 'edit'
      ? { action, domain: credentialEditingDomain || domain, updates: { username, password, notes } }
      : { action, domain, data: { username, password, notes } };

    const response = await chrome.runtime.sendMessage(message);

    if (response?.success) {
      showToast(credentialModalMode === 'edit' ? 'Credential updated' : 'Credential saved', 'success');
      hideCredentialModal();
      loadCredentials();
    } else {
      showToast('Failed to save: ' + (response?.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showToast('Error saving credential: ' + error.message, 'error');
  }
}

// Delete credential with confirmation
async function deleteCredentialConfirm(domain) {
  if (!confirm(`Delete saved credential for "${domain}"? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteCredential',
      domain: domain
    });

    if (response?.success) {
      showToast('Credential deleted', 'success');
      loadCredentials();
    } else {
      showToast('Failed to delete: ' + (response?.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showToast('Error deleting credential: ' + error.message, 'error');
  }
}

// Toggle password visibility for a credential card
async function toggleCredentialPassword(domain) {
  const passwordEl = document.querySelector(`.credential-card-password[data-domain="${domain}"]`);
  if (!passwordEl) return;

  const dotsEl = passwordEl.querySelector('.password-dots');
  if (!dotsEl) return;

  // If currently showing dots, fetch and show password
  if (dotsEl.textContent === '--------') {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getFullCredential',
        domain: domain
      });

      if (response?.success && response.credential) {
        dotsEl.textContent = response.credential.password || '(empty)';
        dotsEl.style.color = 'var(--text-primary)';

        // Find the eye icon and switch it
        const card = passwordEl.closest('.credential-card');
        const eyeBtn = card?.querySelector('.credential-action-btn:first-child i');
        if (eyeBtn) eyeBtn.className = 'fas fa-eye-slash';

        // Auto-hide after 5 seconds
        setTimeout(() => {
          dotsEl.textContent = '--------';
          dotsEl.style.color = '';
          if (eyeBtn) eyeBtn.className = 'fas fa-eye';
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to fetch password:', error);
    }
  } else {
    // Hide password
    dotsEl.textContent = '--------';
    dotsEl.style.color = '';

    const card = passwordEl.closest('.credential-card');
    const eyeBtn = card?.querySelector('.credential-action-btn:first-child i');
    if (eyeBtn) eyeBtn.className = 'fas fa-eye';
  }
}

// Initialize credential manager event listeners
function initializeCredentialManager() {
  // Event delegation for credential card action buttons (avoids inline onclick XSS risk)
  const credList = document.getElementById('credentialsList');
  if (credList) {
    credList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cred-action]');
      if (!btn) return;
      const action = btn.dataset.credAction;
      const domain = btn.dataset.credDomain;
      if (!domain) return;
      if (action === 'toggle-password') toggleCredentialPassword(domain);
      else if (action === 'edit') showCredentialModal('edit', domain);
      else if (action === 'delete') deleteCredentialConfirm(domain);
    });
  }

  // Enable login toggle
  const enableLoginToggle = document.getElementById('enableLogin');
  if (enableLoginToggle) {
    enableLoginToggle.addEventListener('change', (e) => {
      updateCredentialsManagerVisibility(e.target.checked);
      markUnsavedChanges();
    });
  }

  // Search filter
  const searchInput = document.getElementById('credentialSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterCredentials(e.target.value);
    });
  }

  // Add New button
  const addBtn = document.getElementById('addCredentialBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showCredentialModal('add'));
  }

  // Modal buttons
  const modalSave = document.getElementById('credentialModalSave');
  const modalCancel = document.getElementById('credentialModalCancel');
  const modalClose = document.getElementById('credentialModalClose');
  const modalBackdrop = document.querySelector('.credential-modal-backdrop');

  if (modalSave) modalSave.addEventListener('click', saveCredentialFromModal);
  if (modalCancel) modalCancel.addEventListener('click', hideCredentialModal);
  if (modalClose) modalClose.addEventListener('click', hideCredentialModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', hideCredentialModal);

  // Modal password toggle
  const toggleModalPw = document.getElementById('toggleCredModalPassword');
  if (toggleModalPw) {
    toggleModalPw.addEventListener('click', () => {
      const pwField = document.getElementById('credModalPassword');
      if (pwField) {
        const isPassword = pwField.type === 'password';
        pwField.type = isPassword ? 'text' : 'password';
        const icon = toggleModalPw.querySelector('i');
        if (icon) icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    });
  }

  // Load credentials when switching to passwords section (override inside init to ensure DOM is ready)
  // Also refresh memory data when switching to memory section (catches stale data)
  const origSwitchSection = switchSection;
  switchSection = function(sectionId) {
    origSwitchSection(sectionId);
    if (sectionId === 'passwords') {
      const enableLogin = document.getElementById('enableLogin');
      if (enableLogin?.checked) {
        loadCredentials();
      }
    }
    // Refresh memory tab when switching to it (picks up changes made while off-screen)
    if (sectionId === 'memory') {
      loadMemoryDashboard();
    }
    // Refresh payment vault status when switching to payments section
    if (sectionId === 'payments') {
      loadPaymentVaultStatus();
    }
    // Phase 213: Sync tab pill state machine (SYNC-02)
    if (sectionId === 'sync') {
      try { initializeSyncSection(); } catch (e) { /* benign if pill markup absent */ }
      try { _refreshSyncPill(); } catch (e) { /* benign */ }
    }
  };
}

// Initialize credential manager after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Delay slightly to ensure all other init is done
  setTimeout(initializeCredentialManager, 200);
});

// ==========================================
// Payment Manager Functions (Payments Beta)
// ==========================================

// Payment vault state
let _paymentPinUnlock = null;
let _paymentUnlockSubmitting = false;

// Load payment vault status and render appropriate UI state
async function loadPaymentVaultStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getPaymentVaultStatus' });
    if (!response) return;

    const statusText = document.getElementById('paymentMethodsStatusText');
    const blockedPanel = document.getElementById('paymentMethodsBlocked');
    const unlockPanel = document.getElementById('paymentMethodsUnlock');
    const unlockedPanel = document.getElementById('paymentMethodsUnlocked');
    const lockBtn = document.getElementById('lockPaymentMethodsBtn');
    const paymentManager = document.getElementById('paymentMethodsManager');

    // Hide all states initially
    if (blockedPanel) blockedPanel.style.display = 'none';
    if (unlockPanel) unlockPanel.style.display = 'none';
    if (unlockedPanel) unlockedPanel.style.display = 'none';
    if (lockBtn) lockBtn.style.display = 'none';
    if (paymentManager) paymentManager.style.display = 'none';

    if (!response.configured) {
      // Vault not configured -- direct user to Passwords section
      if (statusText) statusText.textContent = 'Configure a vault PIN in Passwords first.';
      if (blockedPanel) blockedPanel.style.display = 'block';
    } else if (!response.paymentUnlocked) {
      // Vault configured but payment methods locked -- show PIN unlock
      if (statusText) statusText.textContent = 'Payment methods are locked.';
      if (unlockPanel) unlockPanel.style.display = 'block';

      // Fetch pinLength and create PIN input
      const vaultStatus = await chrome.runtime.sendMessage({ action: 'getCredentialVaultStatus' });
      const pinLength = (vaultStatus && vaultStatus.pinLength) || 6;
      const container = document.getElementById('paymentMethodsPinUnlock');

      if (container && !_paymentPinUnlock) {
        _paymentPinUnlock = createPinInput(container, pinLength, {
          onComplete: (pin) => submitPaymentUnlock(pin)
        });
      }
    } else {
      // Fully unlocked
      if (statusText) statusText.textContent = 'Payment methods are unlocked.';
      if (unlockedPanel) unlockedPanel.style.display = 'block';
      if (lockBtn) lockBtn.style.display = 'inline-flex';
      if (paymentManager) paymentManager.style.display = 'block';
      loadPaymentMethods();
    }
  } catch (error) {
    console.error('Error loading payment vault status:', error);
  }
}

// Submit payment unlock with PIN
async function submitPaymentUnlock(pin) {
  if (_paymentUnlockSubmitting) return;
  _paymentUnlockSubmitting = true;

  const unlockBtn = document.getElementById('unlockPaymentMethodsBtn');
  const originalText = unlockBtn ? unlockBtn.textContent : '';
  if (unlockBtn) {
    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Unlocking...';
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'unlockPaymentMethods',
      passphrase: pin
    });

    if (response && response.success) {
      showToast('Payment methods unlocked', 'success');
      _paymentPinUnlock = null;
      loadPaymentVaultStatus();
    } else {
      showToast(response?.error || 'Incorrect PIN', 'error');
      if (_paymentPinUnlock) _paymentPinUnlock.clear();
    }
  } catch (error) {
    showToast('Error unlocking payment methods: ' + error.message, 'error');
    if (_paymentPinUnlock) _paymentPinUnlock.clear();
  } finally {
    _paymentUnlockSubmitting = false;
    if (unlockBtn) {
      unlockBtn.disabled = false;
      unlockBtn.textContent = originalText;
    }
  }
}

// Initialize payment manager event listeners
function initializePaymentManager() {
  // Lock button
  const lockBtn = document.getElementById('lockPaymentMethodsBtn');
  if (lockBtn) {
    lockBtn.addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'lockPaymentMethods' });
        if (response && response.success) {
          showToast('Payment methods locked', 'success');
          _paymentPinUnlock = null;
          loadPaymentVaultStatus();
        } else {
          showToast('Failed to lock payment methods', 'error');
        }
      } catch (error) {
        showToast('Error locking payment methods: ' + error.message, 'error');
      }
    });
  }

  // Unlock button (manual trigger when PIN is typed but not auto-submitted)
  const unlockBtn = document.getElementById('unlockPaymentMethodsBtn');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', () => {
      if (!_paymentPinUnlock) return;
      const pin = _paymentPinUnlock.getValue();
      if (!pin || !/^\d+$/.test(pin)) {
        showToast('Please enter your numeric PIN', 'error');
        return;
      }
      submitPaymentUnlock(pin);
    });
  }

  // Payment card list event delegation
  const paymentList = document.getElementById('paymentMethodsList');
  if (paymentList) {
    paymentList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-payment-action]');
      if (!btn) return;
      const action = btn.dataset.paymentAction;
      const id = btn.dataset.paymentId;
      if (!id) return;
      if (action === 'edit') showPaymentMethodModal('edit', id);
      else if (action === 'delete') deletePaymentMethodConfirm(id);
    });
  }

  // Payment search filter
  const searchInput = document.getElementById('paymentMethodSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterPaymentMethods(e.target.value);
    });
  }

  // Add Card button
  const addBtn = document.getElementById('addPaymentMethodBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showPaymentMethodModal('add'));
  }

  // Modal buttons (Save, Cancel, Close, Backdrop)
  const pmModalSave = document.getElementById('paymentMethodModalSave');
  const pmModalCancel = document.getElementById('paymentMethodModalCancel');
  const pmModalClose = document.getElementById('paymentMethodModalClose');
  const pmModalBackdrop = document.querySelector('#paymentMethodModal .credential-modal-backdrop');

  if (pmModalSave) pmModalSave.addEventListener('click', savePaymentMethodFromModal);
  if (pmModalCancel) pmModalCancel.addEventListener('click', hidePaymentMethodModal);
  if (pmModalClose) pmModalClose.addEventListener('click', hidePaymentMethodModal);
  if (pmModalBackdrop) pmModalBackdrop.addEventListener('click', hidePaymentMethodModal);

  // CVV visibility toggle
  const toggleCvv = document.getElementById('togglePaymentMethodCvv');
  if (toggleCvv) {
    toggleCvv.addEventListener('click', () => {
      const cvvField = document.getElementById('paymentMethodCvv');
      if (cvvField) {
        const isPassword = cvvField.type === 'password';
        cvvField.type = isPassword ? 'text' : 'password';
        const icon = toggleCvv.querySelector('i');
        if (icon) icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    });
  }

  // Real-time brand detection on card number input
  const cardNumInput = document.getElementById('paymentMethodCardNumber');
  if (cardNumInput) {
    cardNumInput.addEventListener('input', (e) => {
      const brand = detectPaymentCardBrand(e.target.value);
      const brandEl = document.getElementById('paymentMethodCardBrand');
      const brandLabels = { visa: 'Visa', mastercard: 'MC', amex: 'Amex', discover: 'Discover', unknown: 'Unknown' };
      if (brandEl) {
        brandEl.textContent = brandLabels[brand] || 'Unknown';
        brandEl.className = 'payment-card-brand ' + brand;
      }
    });
  }

  // Load vault status on init
  loadPaymentVaultStatus();
}

// Load and display all payment methods
async function loadPaymentMethods() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getAllPaymentMethods' });

    if (!response || !response.success) {
      console.error('Failed to load payment methods:', response?.error);
      return;
    }

    const paymentMethods = response.paymentMethods || [];
    const listEl = document.getElementById('paymentMethodsList');
    const emptyEl = document.getElementById('paymentMethodsEmpty');

    if (paymentMethods.length === 0) {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    if (listEl) {
      listEl.innerHTML = paymentMethods.map(pm => renderPaymentCard(pm)).join('');
    }
  } catch (error) {
    console.error('Error loading payment methods:', error);
  }
}

// Render a single payment card entry
function renderPaymentCard(pm) {
  const brandLabels = {
    visa: 'Visa',
    mastercard: 'MC',
    amex: 'Amex',
    discover: 'Discover',
    diners: 'Diners',
    jcb: 'JCB',
    unknown: 'Card'
  };
  const brandLabel = brandLabels[pm.cardBrand] || brandLabels.unknown;

  return `
    <div class="credential-card payment-card" data-payment-id="${escapeHtml(pm.id)}">
      <div class="credential-card-icon">
        <span class="payment-card-brand ${escapeHtml(pm.cardBrand)}">${escapeHtml(brandLabel)}</span>
      </div>
      <div class="credential-card-info">
        <div class="credential-card-domain">${escapeHtml(pm.nickname || pm.cardholderName || 'Card')}</div>
        <div class="credential-card-username">${escapeHtml(pm.maskedNumber)} -- Exp ${escapeHtml(String(pm.expiryMonth))}/${escapeHtml(String(pm.expiryYearLast2))}</div>
      </div>
      <div class="credential-card-actions">
        <button class="credential-action-btn" data-payment-action="edit" data-payment-id="${escapeHtml(pm.id)}" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="credential-action-btn delete" data-payment-action="delete" data-payment-id="${escapeHtml(pm.id)}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

// Filter payment methods by search query
function filterPaymentMethods(query) {
  const cards = document.querySelectorAll('.payment-card');
  const lowerQuery = query.toLowerCase();

  cards.forEach(card => {
    const name = card.querySelector('.credential-card-domain')?.textContent || '';
    const details = card.querySelector('.credential-card-username')?.textContent || '';
    const matches = name.toLowerCase().includes(lowerQuery) ||
                    details.toLowerCase().includes(lowerQuery);
    card.style.display = matches ? 'flex' : 'none';
  });
}

// ==========================================
// Payment Method Modal & Validation (193-02)
// ==========================================

// Client-side card brand detection (mirrors secure-config.js logic)
function detectPaymentCardBrand(cardNumber) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (!digits) return 'unknown';
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover';
  return 'unknown';
}

// Luhn algorithm for card number validation
function isValidPaymentCardNumber(cardNumber) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0, shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Validate expiry is a future date
function isValidPaymentExpiry(month, year) {
  const m = parseInt(month, 10);
  const y = String(year).length === 2 ? 2000 + parseInt(year, 10) : parseInt(year, 10);
  if (!m || m < 1 || m > 12 || !y) return false;
  const now = new Date();
  if (y < now.getFullYear()) return false;
  if (y === now.getFullYear() && m < now.getMonth() + 1) return false;
  return true;
}

// Payment modal state
let paymentModalMode = 'add'; // 'add' or 'edit'
let paymentEditingId = null;

// Show the payment method modal (add or edit mode)
async function showPaymentMethodModal(mode, id) {
  paymentModalMode = mode || 'add';
  paymentEditingId = id || null;

  const modal = document.getElementById('paymentMethodModal');
  const title = document.getElementById('paymentMethodModalTitle');
  const brandEl = document.getElementById('paymentMethodCardBrand');
  const cardNumInput = document.getElementById('paymentMethodCardNumber');

  if (title) title.textContent = mode === 'edit' ? 'Edit Payment Method' : 'Add Payment Method';

  // Clear all form fields
  const fieldIds = [
    'paymentMethodNickname', 'paymentMethodCardholderName', 'paymentMethodCardNumber',
    'paymentMethodExpiryYear', 'paymentMethodCvv',
    'paymentMethodBillingName', 'paymentMethodAddressLine1', 'paymentMethodAddressLine2',
    'paymentMethodCity', 'paymentMethodStateRegion', 'paymentMethodPostalCode', 'paymentMethodCountry'
  ];
  fieldIds.forEach(fid => {
    const el = document.getElementById(fid);
    if (el) el.value = '';
  });

  // Reset expiry month dropdown
  const expiryMonthEl = document.getElementById('paymentMethodExpiryMonth');
  if (expiryMonthEl) expiryMonthEl.value = '';

  // Reset brand badge
  if (brandEl) {
    brandEl.textContent = 'Unknown';
    brandEl.className = 'payment-card-brand unknown';
  }

  if (mode === 'edit' && id) {
    // Disable card number field in edit mode (immutable)
    if (cardNumInput) {
      cardNumInput.disabled = true;
      cardNumInput.placeholder = '(cannot change card number)';
    }

    // Fetch full card data to pre-fill
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getFullPaymentMethod', id });
      if (response && response.success && response.paymentMethod) {
        const pm = response.paymentMethod;
        const setField = (fid, val) => {
          const el = document.getElementById(fid);
          if (el && val != null) el.value = val;
        };
        setField('paymentMethodNickname', pm.nickname);
        setField('paymentMethodCardholderName', pm.cardholderName);
        setField('paymentMethodCardNumber', pm.cardNumber);
        setField('paymentMethodExpiryYear', pm.expiryYear);
        setField('paymentMethodCvv', pm.cvv);
        setField('paymentMethodBillingName', pm.billingName);
        setField('paymentMethodAddressLine1', pm.addressLine1);
        setField('paymentMethodAddressLine2', pm.addressLine2);
        setField('paymentMethodCity', pm.city);
        setField('paymentMethodStateRegion', pm.stateRegion);
        setField('paymentMethodPostalCode', pm.postalCode);
        setField('paymentMethodCountry', pm.country);
        if (expiryMonthEl && pm.expiryMonth) expiryMonthEl.value = pm.expiryMonth;

        // Set brand badge from stored data
        if (brandEl && pm.cardBrand) {
          const brandLabels = { visa: 'Visa', mastercard: 'MC', amex: 'Amex', discover: 'Discover', unknown: 'Unknown' };
          brandEl.textContent = brandLabels[pm.cardBrand] || 'Unknown';
          brandEl.className = 'payment-card-brand ' + (pm.cardBrand || 'unknown');
        }
      }
    } catch (error) {
      console.error('Failed to load payment method for editing:', error);
    }
  } else {
    // Add mode: enable card number field
    if (cardNumInput) {
      cardNumInput.disabled = false;
      cardNumInput.placeholder = '1234 5678 9012 3456';
    }
  }

  // Show modal
  if (modal) modal.classList.remove('hidden');
}

// Hide the payment method modal and reset state
function hidePaymentMethodModal() {
  const modal = document.getElementById('paymentMethodModal');
  if (modal) modal.classList.add('hidden');
  paymentModalMode = 'add';
  paymentEditingId = null;

  // Clear sensitive fields on close (T-193-04 mitigation)
  const cvvField = document.getElementById('paymentMethodCvv');
  if (cvvField) cvvField.value = '';
  const cardNumField = document.getElementById('paymentMethodCardNumber');
  if (cardNumField) cardNumField.value = '';
}

// Save or update payment method from modal data
async function savePaymentMethodFromModal() {
  const nickname = document.getElementById('paymentMethodNickname')?.value?.trim() || '';
  const cardholderName = document.getElementById('paymentMethodCardholderName')?.value?.trim() || '';
  const cardNumber = document.getElementById('paymentMethodCardNumber')?.value?.trim() || '';
  const expiryMonth = document.getElementById('paymentMethodExpiryMonth')?.value || '';
  const expiryYear = document.getElementById('paymentMethodExpiryYear')?.value?.trim() || '';
  const cvv = document.getElementById('paymentMethodCvv')?.value?.trim() || '';
  const billingName = document.getElementById('paymentMethodBillingName')?.value?.trim() || '';
  const addressLine1 = document.getElementById('paymentMethodAddressLine1')?.value?.trim() || '';
  const addressLine2 = document.getElementById('paymentMethodAddressLine2')?.value?.trim() || '';
  const city = document.getElementById('paymentMethodCity')?.value?.trim() || '';
  const stateRegion = document.getElementById('paymentMethodStateRegion')?.value?.trim() || '';
  const postalCode = document.getElementById('paymentMethodPostalCode')?.value?.trim() || '';
  const country = document.getElementById('paymentMethodCountry')?.value?.trim() || '';

  // Validate required fields
  if (paymentModalMode === 'add') {
    if (!cardholderName || !cardNumber || !expiryMonth || !expiryYear || !cvv || !billingName || !addressLine1 || !city || !stateRegion || !postalCode || !country) {
      showToast('All fields except Nickname and Address Line 2 are required', 'error');
      return;
    }
    // Validate card number with Luhn algorithm
    if (!isValidPaymentCardNumber(cardNumber)) {
      showToast('Invalid card number', 'error');
      return;
    }
    // Validate expiry date is in the future
    if (!isValidPaymentExpiry(expiryMonth, expiryYear)) {
      showToast('Card is expired or expiry is invalid', 'error');
      return;
    }
  } else {
    // Edit mode: only non-card fields are required
    if (!cardholderName || !billingName || !addressLine1 || !city || !stateRegion || !postalCode || !country) {
      showToast('All fields except Nickname and Address Line 2 are required', 'error');
      return;
    }
  }

  try {
    let response;
    if (paymentModalMode === 'edit' && paymentEditingId) {
      // Update: only send mutable fields
      response = await chrome.runtime.sendMessage({
        action: 'updatePaymentMethod',
        id: paymentEditingId,
        updates: { cardholderName, nickname, billingName, addressLine1, addressLine2, city, stateRegion, postalCode, country }
      });
    } else {
      // Create new payment method
      response = await chrome.runtime.sendMessage({
        action: 'savePaymentMethod',
        data: { cardNumber, expiryMonth, expiryYear, cvv, cardholderName, nickname, billingName, addressLine1, addressLine2, city, stateRegion, postalCode, country }
      });
    }

    if (response && response.success) {
      showToast(paymentModalMode === 'edit' ? 'Payment method updated' : 'Payment method saved', 'success');
      hidePaymentMethodModal();
      loadPaymentMethods();
    } else {
      showToast('Failed: ' + (response?.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showToast('Error saving payment method: ' + error.message, 'error');
  }
}

// Delete payment method with confirmation
async function deletePaymentMethodConfirm(id) {
  if (!confirm('Delete this payment method? This cannot be undone.')) return;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'deletePaymentMethod', id });
    if (response && response.success) {
      showToast('Payment method deleted', 'success');
      loadPaymentMethods();
    } else {
      showToast('Failed to delete: ' + (response?.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showToast('Error deleting payment method: ' + error.message, 'error');
  }
}

// Initialize payment manager after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initializePaymentManager, 250);
});

// ==========================================
// Site Explorer Functions
// ==========================================

// Track active crawler UIs: crawlerId -> DOM element
const activeCrawlerUIs = new Map();

function initializeSiteExplorer() {
  // Go button
  if (elements.explorerGoBtn) {
    elements.explorerGoBtn.addEventListener('click', startExplorer);
  }

  // Stop All button
  if (elements.explorerStopAllBtn) {
    elements.explorerStopAllBtn.addEventListener('click', stopAllExplorers);
  }

  // Enter key on URL input
  if (elements.explorerUrl) {
    elements.explorerUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startExplorer();
    });
  }

  // Research list controls
  const refreshBtn = document.getElementById('refreshResearch');
  const clearAllBtn = document.getElementById('clearAllResearch');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadResearchList(0));
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllResearchResults);
  }

  // Event delegation on research list for item/button clicks
  if (elements.researchList) {
    elements.researchList.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('.session-action-btn');
      const researchItem = e.target.closest('.session-item');
      if (!researchItem) return;
      const researchId = researchItem.dataset.researchId;

      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        if (action === 'view') viewResearch(researchId);
        else if (action === 'download') downloadResearch(researchId);
        else if (action === 'delete') deleteResearch(researchId);
        else if (action === 'saveMemory') saveResearchToMemory(researchId);
      } else {
        viewResearch(researchId);
      }
    });
  }

  // Listen for explorer status broadcasts from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'explorerStatusUpdate') {
      updateExplorerProgress(message.data);
    }
  });

  // Load initial research list
  loadResearchList();
}

async function startExplorer() {
  const url = (elements.explorerUrl?.value || '').trim();
  if (!url) {
    showToast('Please enter a URL to explore', 'error');
    return;
  }

  // Validate URL format
  let testUrl = url;
  if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
    testUrl = 'https://' + testUrl;
  }
  try {
    new URL(testUrl);
  } catch (e) {
    showToast('Invalid URL format', 'error');
    return;
  }

  const maxDepth = parseInt(elements.explorerMaxDepth?.value || '3');
  const maxPages = parseInt(elements.explorerMaxPages?.value || '25');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'startExplorer',
      url: testUrl,
      maxDepth,
      maxPages
    });

    if (!response || !response.success) {
      showToast('Failed to start explorer: ' + (response?.error || 'Unknown error'), 'error');
    } else {
      addLog('info', 'Site Explorer started for ' + testUrl);
      // Clear input for next URL, show Stop All
      if (elements.explorerUrl) elements.explorerUrl.value = '';
      updateStopAllVisibility();
    }
  } catch (error) {
    showToast('Failed to start explorer: ' + error.message, 'error');
  }
}

async function stopAllExplorers() {
  try {
    await chrome.runtime.sendMessage({ action: 'stopExplorer' });
    addLog('info', 'All Site Explorers stopped');
    showToast('All crawlers stopped', 'info');
  } catch (error) {
    console.error('Failed to stop explorers:', error);
  }
  // Clean up all crawler UIs
  activeCrawlerUIs.clear();
  if (elements.explorerCrawlers) elements.explorerCrawlers.innerHTML = '';
  updateStopAllVisibility();
}

async function stopSingleCrawler(crawlerId) {
  try {
    await chrome.runtime.sendMessage({ action: 'stopExplorer', crawlerId });
    addLog('info', 'Crawler stopped: ' + crawlerId);
  } catch (error) {
    console.error('Failed to stop crawler:', error);
  }
}

function updateStopAllVisibility() {
  if (elements.explorerStopAllBtn) {
    elements.explorerStopAllBtn.style.display = activeCrawlerUIs.size > 0 ? '' : 'none';
  }
}

function createCrawlerCard(crawlerId, domain, maxPages) {
  const card = document.createElement('div');
  card.className = 'explorer-crawler-item';
  card.dataset.crawlerId = crawlerId;
  card.innerHTML = `
    <div class="crawler-header">
      <span class="crawler-domain">${escapeHtml(domain)}</span>
      <button class="crawler-stop-btn" data-crawler-id="${crawlerId}">
        <i class="fas fa-stop"></i> Stop
      </button>
    </div>
    <div class="crawler-progress-info">
      <span class="crawler-progress-text">Starting crawl...</span>
      <span class="crawler-progress-count">0 / ${maxPages} pages</span>
    </div>
    <div class="crawler-progress-bar">
      <div class="crawler-progress-fill" style="width: 0%;"></div>
    </div>
    <div class="crawler-current-url"></div>
  `;

  // Wire up stop button
  card.querySelector('.crawler-stop-btn').addEventListener('click', () => {
    stopSingleCrawler(crawlerId);
  });

  return card;
}

function updateExplorerProgress(data) {
  if (!data || !data.crawlerId) return;

  const crawlerId = data.crawlerId;

  if (data.status === 'crawling') {
    // Create card if it doesn't exist
    if (!activeCrawlerUIs.has(crawlerId)) {
      const card = createCrawlerCard(crawlerId, data.domain || '?', data.maxPages || 0);
      activeCrawlerUIs.set(crawlerId, card);
      if (elements.explorerCrawlers) elements.explorerCrawlers.appendChild(card);
      updateStopAllVisibility();
    }

    // Update card
    const card = activeCrawlerUIs.get(crawlerId);
    if (card) {
      const percent = data.maxPages > 0 ? Math.round((data.pagesCollected / data.maxPages) * 100) : 0;
      const fill = card.querySelector('.crawler-progress-fill');
      if (fill) fill.style.width = percent + '%';
      const text = card.querySelector('.crawler-progress-text');
      if (text) text.textContent = 'Crawling ' + (data.domain || '');
      const count = card.querySelector('.crawler-progress-count');
      if (count) count.textContent = data.pagesCollected + ' / ' + data.maxPages + ' pages';
      const urlEl = card.querySelector('.crawler-current-url');
      if (urlEl) urlEl.textContent = data.currentUrl || '';
    }
  } else if (data.status === 'completed' || data.status === 'stopped' || data.status === 'error') {
    // Remove card
    const card = activeCrawlerUIs.get(crawlerId);
    if (card) {
      card.remove();
      activeCrawlerUIs.delete(crawlerId);
      updateStopAllVisibility();
    }

    if (data.status === 'completed') {
      showToast('Crawl completed: ' + data.pagesCollected + ' pages from ' + (data.domain || ''), 'success');
      addLog('info', 'Site Explorer completed: ' + data.pagesCollected + ' pages from ' + data.domain);
    } else if (data.status === 'error') {
      showToast('Crawl failed for ' + (data.domain || 'unknown'), 'error');
    }

    // Refresh research list
    loadResearchList();
  }
}

var researchPage = 0;
var researchPageSize = 10;

async function loadResearchList(page) {
  if (!elements.researchList) return;

  if (typeof page === 'number') {
    researchPage = page;
  }

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getResearchList' });
    const list = (response && response.list) || [];
    const total = list.length;

    if (total === 0) {
      elements.researchList.innerHTML = `
        <div class="session-empty-state">
          <i class="fas fa-flask"></i>
          <p>No research results yet. Use Site Explorer above to crawl a website.</p>
        </div>
      `;
      renderResearchPagination(0, researchPageSize, 0);
      return;
    }

    // Clamp page if out of bounds (e.g. after deletion)
    const maxPage = Math.max(0, Math.ceil(total / researchPageSize) - 1);
    if (researchPage > maxPage) {
      researchPage = maxPage;
    }

    const start = researchPage * researchPageSize;
    const end = Math.min(start + researchPageSize, total);
    const pageItems = list.slice(start, end);

    elements.researchList.innerHTML = pageItems.map(item => `
      <div class="session-item" data-research-id="${item.id}">
        <div class="session-item-info">
          <div class="session-item-task">${escapeHtml(item.domain || 'Unknown')}</div>
          <div class="session-item-meta">
            <span><i class="fas fa-clock"></i> ${formatSessionDate(item.startTime)}</span>
            <span><i class="fas fa-file-alt"></i> ${item.pageCount || 0} pages</span>
            <span><i class="fas fa-hourglass-half"></i> ${formatSessionDuration(item.startTime, item.endTime)}</span>
          </div>
        </div>
        <div class="session-item-status">
          <span class="session-status-badge ${item.status}">${item.status}</span>
        </div>
        <div class="session-item-actions">
          <button class="session-action-btn view" data-action="view" title="View details">
            <i class="fas fa-eye"></i>
          </button>
          <button class="session-action-btn download" data-action="download" title="Download JSON">
            <i class="fas fa-download"></i>
          </button>
          <button class="session-action-btn save-memory" data-action="saveMemory" title="Save as site map memory">
            <i class="fas fa-brain"></i>
          </button>
          <button class="session-action-btn delete" data-action="delete" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

    renderResearchPagination(total, researchPageSize, researchPage);

  } catch (error) {
    console.error('Failed to load research list:', error);
    elements.researchList.innerHTML = `
      <div class="session-empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load research results: ${error.message}</p>
      </div>
    `;
    renderResearchPagination(0, researchPageSize, 0);
  }
}

function renderResearchPagination(total, pageSize, currentPage) {
  const container = document.getElementById('researchPagination');
  if (!container) return;

  if (total <= pageSize) {
    container.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(total / pageSize);
  const start = currentPage * pageSize + 1;
  const end = Math.min((currentPage + 1) * pageSize, total);

  let html = '';

  // Prev button
  html += `<button ${currentPage === 0 ? 'disabled' : ''} onclick="loadResearchList(${currentPage - 1})">Prev</button>`;

  // Page number buttons
  for (let i = 0; i < totalPages; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="loadResearchList(${i})">${i + 1}</button>`;
  }

  // Next button
  html += `<button ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="loadResearchList(${currentPage + 1})">Next</button>`;

  // Info text
  html += `<span class="pagination-info">${start}-${end} of ${total}</span>`;

  container.innerHTML = html;
}

async function viewResearch(researchId) {
  if (!elements.researchList) return;

  const researchItem = elements.researchList.querySelector(`.session-item[data-research-id="${researchId}"]`);
  if (!researchItem) return;

  // Toggle: collapse if already expanded
  const existingDetail = researchItem.querySelector('.research-detail');
  if (existingDetail) {
    existingDetail.remove();
    researchItem.classList.remove('expanded');
    return;
  }

  // Collapse any other expanded items
  elements.researchList.querySelectorAll('.research-detail').forEach(d => d.remove());
  elements.researchList.querySelectorAll('.session-item.expanded').forEach(i => i.classList.remove('expanded'));

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getResearchData', researchId });
    if (!response || !response.success || !response.data) {
      showToast('Research data not found', 'error');
      return;
    }

    const data = response.data;
    const summary = data.summary || {};

    const detailHtml = `
      <div class="research-detail">
        <div class="research-detail-grid">
          <div class="research-stat">
            <div class="research-stat-value">${summary.totalPages || 0}</div>
            <div class="research-stat-label">Pages</div>
          </div>
          <div class="research-stat">
            <div class="research-stat-value">${summary.totalElements || 0}</div>
            <div class="research-stat-label">Elements</div>
          </div>
          <div class="research-stat">
            <div class="research-stat-value">${summary.totalForms || 0}</div>
            <div class="research-stat-label">Forms</div>
          </div>
          <div class="research-stat">
            <div class="research-stat-value">${summary.totalLinks || 0}</div>
            <div class="research-stat-label">Links</div>
          </div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">
          <strong>Start URL:</strong> ${escapeHtml(data.startUrl || '')}<br>
          <strong>Duration:</strong> ${formatSessionDuration(data.startTime, data.endTime)}<br>
          <strong>Depth:</strong> ${data.settings?.maxDepth || '?'} | <strong>Status:</strong> ${data.status}
        </div>
        ${data.pages && data.pages.length > 0 ? `
          <details style="margin-top: 0.5rem;">
            <summary style="cursor: pointer; font-size: 0.8125rem; color: var(--text-secondary);">Pages crawled (${data.pages.length})</summary>
            <ul style="margin: 0.25rem 0 0; padding-left: 1.25rem; font-size: 0.75rem; font-family: monospace; color: var(--text-muted); max-height: 200px; overflow-y: auto;">
              ${data.pages.map(p => `<li>${escapeHtml(p.url)} (${p.interactiveElements?.length || 0} elements)</li>`).join('')}
            </ul>
          </details>
        ` : ''}
      </div>
    `;

    researchItem.insertAdjacentHTML('beforeend', detailHtml);
    researchItem.classList.add('expanded');

  } catch (error) {
    console.error('Failed to view research:', error);
    showToast('Failed to load research details', 'error');
  }
}

async function downloadResearch(researchId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getResearchData', researchId });
    if (!response || !response.success || !response.data) {
      showToast('Research data not found', 'error');
      return;
    }

    const data = response.data;
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date(data.startTime).toISOString().split('T')[0];
    const filename = `fsb-research-${data.domain || 'unknown'}-${date}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Research JSON downloaded', 'success');
    addLog('info', 'Downloaded research for ' + (data.domain || researchId));

  } catch (error) {
    console.error('Failed to download research:', error);
    showToast('Failed to download research', 'error');
  }
}

async function deleteResearch(researchId) {
  if (!confirm('Are you sure you want to delete this research result?')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({ action: 'deleteResearch', researchId });
    loadResearchList();
    showToast('Research deleted', 'success');
    addLog('info', 'Deleted research ' + researchId);
  } catch (error) {
    console.error('Failed to delete research:', error);
    showToast('Failed to delete research', 'error');
  }
}

async function saveResearchToMemory(researchId) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getResearchData', researchId });
    if (!response || !response.success || !response.data) {
      showToast('Research data not found', 'error');
      return;
    }

    const research = response.data;
    const sitePattern = convertToSiteMap(research);
    if (!sitePattern) {
      showToast('Failed to convert research to site map', 'error');
      return;
    }

    const domain = research.domain || 'unknown';
    const memory = createSiteMapMemory(domain, sitePattern);
    const saved = await memoryStorage.add(memory);

    if (!saved) {
      showToast('Failed to save memory', 'error');
      return;
    }

    // Update button to show saved state
    const item = elements.researchList?.querySelector(`.session-item[data-research-id="${researchId}"]`);
    if (item) {
      const btn = item.querySelector('[data-action="saveMemory"]');
      if (btn) {
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.title = 'Saved to memory';
        btn.disabled = true;
        btn.classList.add('saved');
      }
    }

    // Tier 2: AI refinement if toggle is ON
    const settings = await chrome.storage.local.get(['autoRefineSiteMaps']);
    if (settings.autoRefineSiteMaps !== false && typeof refineSiteMapWithAI === 'function') {
      showToast('Refining site map with AI...', 'info');
      try {
        const refined = await refineSiteMapWithAI(sitePattern, research);
        if (refined && refined.refined === true) {
          memory.typeData.sitePattern = refined;
          memory.metadata.confidence = 0.95;
          memory.text = `Site map for ${domain}: ${refined.pageCount || 0} pages, ${refined.formCount || 0} forms (AI enhanced)`;
          memory.updatedAt = Date.now();
          await memoryStorage.update(memory.id, memory);
          showToast('Site map saved and refined for ' + domain, 'success');
          addLog('info', 'Saved and AI-refined site map for ' + domain);
        } else {
          showToast('Site map saved for ' + domain + ' (refinement returned no data)', 'info');
          addLog('info', 'Saved site map for ' + domain + ' (refinement returned no data)');
        }
      } catch (err) {
        console.warn('AI refinement failed, keeping Tier 1 result:', err.message);
        showToast('Site map saved (AI refinement failed: ' + err.message + ')', 'info');
        addLog('info', 'Saved site map for ' + domain + ' (refinement failed: ' + err.message + ')');
      }
    } else {
      showToast('Site map saved to memory for ' + domain, 'success');
      addLog('info', 'Saved site map memory for ' + domain);
    }
  } catch (error) {
    console.error('Failed to save research to memory:', error);
    showToast('Failed to save to memory: ' + error.message, 'error');
  }
}

async function clearAllResearchResults() {
  if (!confirm('Are you sure you want to delete ALL research results? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.local.remove(['fsbResearchData', 'fsbResearchIndex']);
    loadResearchList(0);
    showToast('All research results cleared', 'success');
    addLog('info', 'All research results cleared');
  } catch (error) {
    console.error('Failed to clear research results:', error);
    showToast('Failed to clear research results', 'error');
  }
}

// ==========================================
// Background Agent Management
// ==========================================

// Phase 212: Background Agents sunset -- replaces interactive agent UI with deprecation card + one-time names list.
// The function below is LIVE (not commented). The agent UI controllers below initializeAgentSection() are commented per-line.
function initializeBackgroundAgentsDeprecation() {
  const dismissBtn = document.getElementById('fsbSunsetNoticeDismiss');
  const noticeEl = document.getElementById('fsbSunsetNotice');
  const namesList = document.getElementById('fsbSunsetNoticeNames');

  if (!dismissBtn || !noticeEl || !namesList) {
    // Scaffolding not present (older HTML cached?); silently skip.
    return;
  }

  // Wire the "Got it" button once; subsequent clicks are no-ops because the aside is hidden.
  dismissBtn.addEventListener('click', function () {
    try {
      chrome.storage.local.set({ fsb_sunset_notice_dismissed: true });
    } catch (e) {
      // chrome.storage may be unavailable in test environments; degrade gracefully.
    }
    noticeEl.hidden = true;
  });

  // Read bgAgents + dismiss flag in parallel; render only if (bgAgents non-empty AND not dismissed).
  try {
    chrome.storage.local.get(['bgAgents', 'fsb_sunset_notice_dismissed'], function (stored) {
      const dismissed = stored && stored.fsb_sunset_notice_dismissed === true;
      // Phase 212-04 (gap-closure / WR-01): bgAgents was historically written as an object map
      // keyed by agentId (agents/agent-manager.js:86-91 -- the only writer that ever ran).
      // Array.isArray({}) returns false, which suppressed the notice on the only profiles
      // that matter. Accept both shapes defensively: array as-is, object map -> Object.values,
      // anything else -> empty array.
      const raw = stored && stored.bgAgents;
      const agents = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object' ? Object.values(raw) : []);
      if (dismissed) return;        // D-09: never re-render after dismiss
      if (agents.length === 0) return; // D-10: skip entirely if no agents ever existed

      // Defensive textContent rendering (T-01 mitigation -- agent names came from user input).
      // NEVER use innerHTML for these strings. PurifyDOM is loaded but textContent is sufficient for plain text.
      while (namesList.firstChild) {
        namesList.removeChild(namesList.firstChild);
      }
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i] || {};
        const name = (typeof a.name === 'string' && a.name.length > 0) ? a.name : '(unnamed agent)';
        const li = document.createElement('li');
        li.textContent = name;            // textContent ONLY; never innerHTML
        namesList.appendChild(li);
      }
      noticeEl.hidden = false;
    });
  } catch (e) {
    // chrome.storage unavailable; deprecation card alone is sufficient.
  }
}

function initializeSyncDeprecationAndButtons() {
  // Sync consolidation: the deprecation card + sunset notice + Server Sync buttons all
  // live in the Sync section now. Keep wiring idempotent so re-init from /clear is safe.

  initializeBackgroundAgentsDeprecation();

  // Server sync buttons
  const btnGenerate = document.getElementById('btnGenerateHashKey');
  const btnCopy = document.getElementById('btnCopyHashKey');
  const btnTest = document.getElementById('btnTestConnection');

  if (btnGenerate) btnGenerate.addEventListener('click', generateHashKey);
  if (btnCopy) btnCopy.addEventListener('click', copyHashKey);
  if (btnTest) btnTest.addEventListener('click', testServerConnection);

  // QR pairing buttons (Phase 210)
  const btnPair = document.getElementById('btnPairDashboard');
  const btnCancelPair = document.getElementById('btnCancelPairing');
  if (btnPair) btnPair.addEventListener('click', showPairingQR);
  if (btnCancelPair) btnCancelPair.addEventListener('click', cancelPairing);

  // Load server settings
  loadServerSettings();
}

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function showAgentForm(editAgent) {
//   const form = document.getElementById('agentFormCard');
//   const title = document.getElementById('agentFormTitle');
//   if (!form) return;
// 
//   if (editAgent && typeof editAgent === 'object' && editAgent.agentId) {
//     // Edit mode
//     title.textContent = 'Edit Agent';
//     document.getElementById('agentFormId').value = editAgent.agentId;
//     document.getElementById('agentName').value = editAgent.name || '';
//     document.getElementById('agentTask').value = editAgent.task || '';
//     document.getElementById('agentTargetUrl').value = editAgent.targetUrl || '';
//     document.getElementById('agentScheduleType').value = editAgent.schedule?.type || 'interval';
//     document.getElementById('agentInterval').value = editAgent.schedule?.intervalMinutes || 30;
//     document.getElementById('agentDailyTime').value = editAgent.schedule?.dailyTime || '09:00';
//     document.getElementById('agentMaxIterations').value = editAgent.maxIterations || 15;
// 
//     // Set replay toggle
//     const replayToggle = document.getElementById('agentReplayEnabled');
//     if (replayToggle) replayToggle.checked = editAgent.replayEnabled !== false;
// 
//     // Set days of week checkboxes
//     const daysContainer = document.getElementById('agentDaysOfWeek');
//     if (daysContainer) {
//       const checkboxes = daysContainer.querySelectorAll('input[type="checkbox"]');
//       checkboxes.forEach(cb => {
//         cb.checked = (editAgent.schedule?.daysOfWeek || []).includes(parseInt(cb.value));
//       });
//     }
// 
//     // Trigger schedule type change to show/hide fields
//     document.getElementById('agentScheduleType').dispatchEvent(new Event('change'));
//   } else {
//     // Create mode
//     title.textContent = 'Create New Agent';
//     document.getElementById('agentFormId').value = '';
//     document.getElementById('agentName').value = '';
//     document.getElementById('agentTask').value = '';
//     document.getElementById('agentTargetUrl').value = '';
//     document.getElementById('agentScheduleType').value = 'interval';
//     document.getElementById('agentInterval').value = 30;
//     document.getElementById('agentDailyTime').value = '09:00';
//     document.getElementById('agentMaxIterations').value = 15;
//     const replayToggleCreate = document.getElementById('agentReplayEnabled');
//     if (replayToggleCreate) replayToggleCreate.checked = true;
//     document.getElementById('agentScheduleType').dispatchEvent(new Event('change'));
//   }
// 
//   form.style.display = '';
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function hideAgentForm() {
//   const form = document.getElementById('agentFormCard');
//   if (form) form.style.display = 'none';
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function saveAgent() {
//   const agentId = document.getElementById('agentFormId').value;
//   const name = document.getElementById('agentName').value.trim();
//   const task = document.getElementById('agentTask').value.trim();
//   const targetUrl = document.getElementById('agentTargetUrl').value.trim();
//   const scheduleType = document.getElementById('agentScheduleType').value;
//   const intervalMinutes = parseInt(document.getElementById('agentInterval').value) || 30;
//   const dailyTime = document.getElementById('agentDailyTime').value;
//   const maxIterations = parseInt(document.getElementById('agentMaxIterations').value) || 15;
// 
//   if (!name || !task || !targetUrl) {
//     showToast('Please fill in all required fields', 'error');
//     return;
//   }
// 
//   // Build schedule
//   const schedule = { type: scheduleType };
//   if (scheduleType === 'interval') {
//     schedule.intervalMinutes = Math.max(1, intervalMinutes);
//   } else if (scheduleType === 'daily') {
//     schedule.dailyTime = dailyTime;
//     const daysContainer = document.getElementById('agentDaysOfWeek');
//     if (daysContainer) {
//       const checked = Array.from(daysContainer.querySelectorAll('input:checked')).map(cb => parseInt(cb.value));
//       if (checked.length > 0) {
//         schedule.daysOfWeek = checked;
//       }
//     }
//   }
// 
//   const replayEnabled = document.getElementById('agentReplayEnabled')?.checked !== false;
// 
//   const action = agentId ? 'updateAgent' : 'createAgent';
//   const payload = agentId
//     ? { action, agentId, updates: { name, task, targetUrl, schedule, maxIterations, replayEnabled } }
//     : { action, params: { name, task, targetUrl, schedule, maxIterations, replayEnabled } };
// 
//   try {
//     const response = await new Promise((resolve) => {
//       chrome.runtime.sendMessage(payload, resolve);
//     });
// 
//     if (response.success) {
//       showToast(agentId ? 'Agent updated' : 'Agent created', 'success');
//       hideAgentForm();
//       loadAgentList();
//       loadAgentStats();
//     } else {
//       showToast('Error: ' + (response.error || 'Unknown error'), 'error');
//     }
//   } catch (error) {
//     showToast('Error: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function loadAgentList() {
//   try {
//     const response = await new Promise((resolve) => {
//       chrome.runtime.sendMessage({ action: 'listAgents' }, resolve);
//     });
// 
//     const list = document.getElementById('agentList');
//     const emptyState = document.getElementById('agentEmptyState');
//     if (!list) return;
// 
//     // Remove existing agent cards (keep empty state)
//     list.querySelectorAll('.agent-card').forEach(card => card.remove());
// 
//     const agents = response?.agents || [];
// 
//     if (agents.length === 0) {
//       if (emptyState) emptyState.style.display = '';
//       return;
//     }
// 
//     if (emptyState) emptyState.style.display = 'none';
// 
//     for (const agent of agents) {
//       const card = createAgentCard(agent);
//       list.appendChild(card);
//     }
//   } catch (error) {
//     console.error('Failed to load agents:', error);
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function createAgentCard(agent) {
//   const card = document.createElement('div');
//   card.className = 'agent-card';
//   card.dataset.agentId = agent.agentId;
// 
//   const statusClass = agent.enabled ? 'active' : 'disabled';
//   const statusText = agent.enabled ? 'Active' : 'Disabled';
//   const lastRun = agent.lastRunAt ? formatTimeAgo(agent.lastRunAt) : 'Never';
//   const scheduleText = formatSchedule(agent.schedule);
// 
//   // Replay info
//   const hasScript = agent.recordedScript && agent.recordedScript.steps && agent.recordedScript.steps.length > 0;
//   const replayEnabled = agent.replayEnabled !== false;
//   const replayBadgeClass = hasScript ? 'active' : 'inactive';
//   const replayBadgeText = hasScript
//     ? 'Replay Ready - ' + agent.recordedScript.totalSteps + ' steps'
//     : 'No Script';
//   const replayStats = agent.replayStats || { totalReplays: 0, estimatedCostSaved: 0 };
//   const costSavedText = replayStats.estimatedCostSaved > 0
//     ? '$' + replayStats.estimatedCostSaved.toFixed(4)
//     : '$0';
// 
//   card.innerHTML = `
//     <div class="agent-card-header">
//       <div class="agent-card-info">
//         <h4 class="agent-card-name">${escapeHtml(agent.name)}</h4>
//         <span class="agent-status-badge ${statusClass}">${statusText}</span>
//       </div>
//       <label class="toggle-switch small">
//         <input type="checkbox" class="agent-toggle" data-agent-id="${agent.agentId}" ${agent.enabled ? 'checked' : ''}>
//         <span class="toggle-slider"></span>
//       </label>
//     </div>
//     <div class="agent-card-body">
//       <div class="agent-card-detail">
//         <span class="agent-detail-label">Task:</span>
//         <span class="agent-detail-value">${escapeHtml(agent.task.substring(0, 100))}${agent.task.length > 100 ? '...' : ''}</span>
//       </div>
//       <div class="agent-card-detail">
//         <span class="agent-detail-label">URL:</span>
//         <span class="agent-detail-value">${escapeHtml(agent.targetUrl)}</span>
//       </div>
//       <div class="agent-card-detail">
//         <span class="agent-detail-label">Schedule:</span>
//         <span class="agent-detail-value">${scheduleText}</span>
//       </div>
//       <div class="agent-card-replay">
//         <span class="replay-badge ${replayBadgeClass}">${replayBadgeText}</span>
//         ${replayStats.totalReplays > 0 ? `<span class="replay-count">${replayStats.totalReplays} replays</span>` : ''}
//         ${replayStats.estimatedCostSaved > 0 ? `<span class="cost-saved">${costSavedText} saved</span>` : ''}
//         ${hasScript ? `<button class="control-btn tiny agent-rerecord-btn" data-agent-id="${agent.agentId}" title="Clear script and re-record on next run">Re-record</button>` : ''}
//       </div>
//       <div class="agent-card-meta">
//         <span>Last run: ${lastRun}</span>
//         <span>Runs: ${agent.runCount}</span>
//         ${agent.lastRunStatus ? `<span class="run-status-${agent.lastRunStatus}">${agent.lastRunStatus}</span>` : ''}
//       </div>
//     </div>
//     <div class="agent-card-actions">
//       <button class="control-btn small agent-run-btn" data-agent-id="${agent.agentId}">
//         <i class="fas fa-play"></i> Run Now
//       </button>
//       <button class="control-btn small agent-edit-btn" data-agent-id="${agent.agentId}">
//         <i class="fas fa-edit"></i> Edit
//       </button>
//       <button class="control-btn small danger agent-delete-btn" data-agent-id="${agent.agentId}">
//         <i class="fas fa-trash"></i> Delete
//       </button>
//       <button class="control-btn small agent-history-btn" data-agent-id="${agent.agentId}">
//         <i class="fas fa-history"></i> History
//       </button>
//     </div>
//     <div class="agent-run-history" id="history-${agent.agentId}" style="display: none;"></div>
//   `;
// 
//   // Toggle handler
//   const toggle = card.querySelector('.agent-toggle');
//   if (toggle) {
//     toggle.addEventListener('change', () => toggleAgent(agent.agentId));
//   }
// 
//   // Run now
//   const runBtn = card.querySelector('.agent-run-btn');
//   if (runBtn) {
//     runBtn.addEventListener('click', () => runAgentNow(agent.agentId));
//   }
// 
//   // Edit
//   const editBtn = card.querySelector('.agent-edit-btn');
//   if (editBtn) {
//     editBtn.addEventListener('click', async () => {
//       const response = await new Promise(resolve => {
//         chrome.runtime.sendMessage({ action: 'listAgents' }, resolve);
//       });
//       const fresh = (response?.agents || []).find(a => a.agentId === agent.agentId);
//       if (fresh) showAgentForm(fresh);
//     });
//   }
// 
//   // Delete
//   const deleteBtn = card.querySelector('.agent-delete-btn');
//   if (deleteBtn) {
//     deleteBtn.addEventListener('click', () => deleteAgent(agent.agentId, agent.name));
//   }
// 
//   // History toggle
//   const historyBtn = card.querySelector('.agent-history-btn');
//   if (historyBtn) {
//     historyBtn.addEventListener('click', () => toggleAgentHistory(agent.agentId));
//   }
// 
//   // Re-record button (clear script)
//   const rerecordBtn = card.querySelector('.agent-rerecord-btn');
//   if (rerecordBtn) {
//     rerecordBtn.addEventListener('click', async (e) => {
//       e.stopPropagation();
//       if (!confirm('Clear the recorded script for "' + agent.name + '"? The next run will use AI to re-record.')) return;
//       try {
//         const response = await new Promise(resolve => {
//           chrome.runtime.sendMessage({ action: 'clearAgentScript', agentId: agent.agentId }, resolve);
//         });
//         if (response.success) {
//           showToast('Script cleared - next run will use AI', 'success');
//           loadAgentList();
//         } else {
//           showToast('Error: ' + (response.error || 'Failed to clear script'), 'error');
//         }
//       } catch (error) {
//         showToast('Error: ' + error.message, 'error');
//       }
//     });
//   }
// 
//   return card;
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function toggleAgent(agentId) {
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'toggleAgent', agentId }, resolve);
//     });
//     if (response.success) {
//       loadAgentList();
//       loadAgentStats();
//     } else {
//       showToast('Error: ' + (response.error || 'Failed to toggle agent'), 'error');
//     }
//   } catch (error) {
//     showToast('Error: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function runAgentNow(agentId) {
//   showToast('Starting agent run...', 'info');
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'runAgentNow', agentId }, resolve);
//     });
//     if (response.success) {
//       showToast('Agent execution started', 'success');
//     } else {
//       showToast('Error: ' + (response.error || 'Failed to start agent'), 'error');
//     }
//   } catch (error) {
//     showToast('Error: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function deleteAgent(agentId, name) {
//   if (!confirm('Delete agent "' + name + '"? This cannot be undone.')) return;
// 
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'deleteAgent', agentId }, resolve);
//     });
//     if (response.success) {
//       showToast('Agent deleted', 'success');
//       loadAgentList();
//       loadAgentStats();
//     } else {
//       showToast('Error: ' + (response.error || 'Failed to delete agent'), 'error');
//     }
//   } catch (error) {
//     showToast('Error: ' + error.message, 'error');
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function toggleAgentHistory(agentId) {
//   const container = document.getElementById('history-' + agentId);
//   if (!container) return;
// 
//   if (container.style.display !== 'none') {
//     container.style.display = 'none';
//     return;
//   }
// 
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'getAgentRunHistory', agentId, limit: 10 }, resolve);
//     });
// 
//     const history = response?.history || [];
//     if (history.length === 0) {
//       container.innerHTML = '<div class="history-empty">No run history yet.</div>';
//     } else {
//       container.innerHTML = history.map(run => {
//         const mode = run.executionMode || 'ai_initial';
//         let modeBadge = '';
//         if (mode === 'replay') {
//           modeBadge = '<span class="mode-badge replay">Replay</span>';
//         } else if (mode === 'ai_fallback') {
//           modeBadge = '<span class="mode-badge fallback">AI Fallback</span>';
//         } else {
//           modeBadge = '<span class="mode-badge ai">AI</span>';
//         }
//         const costSavedInfo = run.costSaved > 0
//           ? '<span class="cost-saved">$' + run.costSaved.toFixed(4) + ' saved</span>'
//           : '';
//         return `
//           <div class="history-entry ${run.success ? 'success' : 'failed'}">
//             <div class="history-entry-header">
//               <span class="history-status">${run.success ? 'Success' : 'Failed'}</span>
//               ${modeBadge}
//               <span class="history-time">${new Date(run.timestamp).toLocaleString()}</span>
//               <span class="history-duration">${formatDuration(run.duration)}</span>
//               ${costSavedInfo}
//             </div>
//             <div class="history-entry-body">
//               ${run.result ? '<p>' + escapeHtml(run.result.substring(0, 200)) + '</p>' : ''}
//               ${run.error ? '<p class="history-error">' + escapeHtml(run.error.substring(0, 200)) + '</p>' : ''}
//               <span class="history-iterations">${run.iterations || 0} iterations</span>
//               ${run.replayFailedAtStep != null ? '<span class="history-replay-fail">Replay failed at step ' + run.replayFailedAtStep + '</span>' : ''}
//             </div>
//           </div>
//         `;
//       }).join('');
//     }
// 
//     container.style.display = '';
//   } catch (error) {
//     container.innerHTML = '<div class="history-empty">Failed to load history.</div>';
//     container.style.display = '';
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// async function loadAgentStats() {
//   try {
//     const response = await new Promise(resolve => {
//       chrome.runtime.sendMessage({ action: 'getAgentStats' }, resolve);
//     });
// 
//     const stats = response?.stats;
//     if (!stats) return;
// 
//     const el = (id) => document.getElementById(id);
//     if (el('statTotalAgents')) el('statTotalAgents').textContent = stats.totalAgents;
//     if (el('statEnabledAgents')) el('statEnabledAgents').textContent = stats.enabledAgents;
//     if (el('statRunsToday')) el('statRunsToday').textContent = stats.runsToday;
//     if (el('statSuccessRate')) el('statSuccessRate').textContent = stats.totalRuns > 0 ? stats.successRate + '%' : '--';
//     if (el('statTotalCost')) el('statTotalCost').textContent = '$' + stats.totalCost.toFixed(4);
//     if (el('statReplayRuns')) el('statReplayRuns').textContent = stats.totalReplayRuns || 0;
//     if (el('statCostSaved')) el('statCostSaved').textContent = '$' + (stats.totalCostSaved || 0).toFixed(4);
//   } catch (error) {
//     console.error('Failed to load agent stats:', error);
//   }
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function formatSchedule(schedule) {
//   if (!schedule) return 'Not set';
//   switch (schedule.type) {
//     case 'interval':
//       const mins = schedule.intervalMinutes || 1;
//       if (mins >= 60) return 'Every ' + (mins / 60) + ' hour' + (mins >= 120 ? 's' : '');
//       return 'Every ' + mins + ' minute' + (mins > 1 ? 's' : '');
//     case 'daily':
//       const days = schedule.daysOfWeek;
//       const time = schedule.dailyTime || '09:00';
//       if (days && days.length > 0 && days.length < 7) {
//         const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
//         return 'Daily at ' + time + ' (' + days.map(d => dayNames[d]).join(', ') + ')';
//       }
//       return 'Daily at ' + time;
//     case 'once':
//       return 'Run once';
//     default:
//       return schedule.type;
//   }
// }

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function formatDuration(ms) {
//   if (!ms) return '--';
//   if (ms < 1000) return ms + 'ms';
//   if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
//   return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
// }

// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
// function escapeHtml(text) {
//   const div = document.createElement('div');
//   div.textContent = text;
//   return div.innerHTML;
// }

// Server sync functions
const FSB_DEFAULT_SERVER_URL = 'https://full-selfbrowsing.com';

async function loadServerSettings() {
  try {
    const stored = await chrome.storage.local.get(['serverUrl', 'serverHashKey']);
    const urlInput = document.getElementById('serverUrl');
    const keyInput = document.getElementById('serverHashKey');
    const resolvedUrl = stored.serverUrl || FSB_DEFAULT_SERVER_URL;
    if (urlInput) urlInput.value = resolvedUrl;
    if (keyInput && stored.serverHashKey) keyInput.value = stored.serverHashKey;
    if (!stored.serverUrl) {
      try { await chrome.storage.local.set({ serverUrl: resolvedUrl }); } catch (_) { /* ignore */ }
    }
  } catch (e) {
    // Fall back: still populate the field with the production default so Generate/Pair/Test work
    const urlInput = document.getElementById('serverUrl');
    if (urlInput && !urlInput.value) urlInput.value = FSB_DEFAULT_SERVER_URL;
  }
}

async function generateHashKey() {
  const serverUrl = document.getElementById('serverUrl')?.value?.trim();
  if (!serverUrl) {
    showToast('Please enter a server URL first', 'error');
    return;
  }

  try {
    const resp = await fetch(serverUrl + '/api/auth/register', { method: 'POST' });
    const data = await resp.json();
    if (data.hashKey) {
      document.getElementById('serverHashKey').value = data.hashKey;
      await chrome.storage.local.set({ serverUrl, serverHashKey: data.hashKey });
      requestDashboardRelayReconnect(serverUrl, data.hashKey);
      showToast('Hash key generated and saved', 'success');
    } else {
      showToast('Failed to generate hash key', 'error');
    }
  } catch (error) {
    showToast('Cannot connect to server: ' + error.message, 'error');
  }
}

function requestDashboardRelayReconnect(serverUrl, hashKey) {
  try {
    chrome.runtime.sendMessage({
      action: 'reconnectDashboardWebSocket',
      serverUrl: serverUrl,
      serverHashKey: hashKey
    }, function () {
      var _ = chrome.runtime.lastError;
    });
  } catch (_) {
    // The storage change listener in background.js is the primary path.
  }
}

async function copyHashKey() {
  const key = document.getElementById('serverHashKey')?.value;
  if (!key) {
    showToast('No hash key to copy', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(key);
    showToast('Hash key copied', 'success');
  } catch (error) {
    showToast('Failed to copy', 'error');
  }
}

async function testServerConnection() {
  const serverUrl = document.getElementById('serverUrl')?.value?.trim();
  const hashKey = document.getElementById('serverHashKey')?.value?.trim();
  const statusEl = document.getElementById('syncConnectionStatus');

  if (!serverUrl || !hashKey) {
    showToast('Please enter server URL and hash key', 'error');
    return;
  }

  if (statusEl) statusEl.textContent = 'Testing...';

  try {
    const resp = await fetch(serverUrl + '/api/auth/validate', {
      headers: { 'X-FSB-Hash-Key': hashKey }
    });
    const data = await resp.json();
    if (data.valid) {
      if (statusEl) statusEl.textContent = 'Connected';
      if (statusEl) statusEl.className = 'connection-status connected';
      showToast('Server connection successful', 'success');
    } else {
      if (statusEl) statusEl.textContent = 'Invalid key';
      if (statusEl) statusEl.className = 'connection-status error';
      showToast('Hash key is invalid', 'error');
    }
  } catch (error) {
    if (statusEl) statusEl.textContent = 'Failed';
    if (statusEl) statusEl.className = 'connection-status error';
    showToast('Cannot connect to server', 'error');
  }
}

// ===== QR Pairing Controller (Phase 210) =====
// Implements CONTEXT D-01 (silent hash-key auto-gen), D-02 (in-overlay
// regenerate on expiry), D-03 (urgency at <=10s). Reuses showToast,
// chrome.storage.local, and FSB_DEFAULT_SERVER_URL.

var pairingCountdownTimer = null;     // setTimeout handle
var pairingFetchInFlight = false;     // duplicate-click guard (Pitfall 2)

function clearPairingCountdown() {
  if (pairingCountdownTimer) {
    clearTimeout(pairingCountdownTimer);
    pairingCountdownTimer = null;
  }
}

async function ensureHashKey(serverUrl) {
  const stored = await chrome.storage.local.get(['serverHashKey']);
  if (stored.serverHashKey) return stored.serverHashKey;
  // D-01: silent auto-generate via existing /api/auth/register flow.
  const resp = await fetch(serverUrl + '/api/auth/register', { method: 'POST' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (!data || !data.hashKey) throw new Error('Server did not return a hash key');
  await chrome.storage.local.set({ serverUrl, serverHashKey: data.hashKey });
  requestDashboardRelayReconnect(serverUrl, data.hashKey);
  const keyInput = document.getElementById('serverHashKey');
  if (keyInput) keyInput.value = data.hashKey;
  return data.hashKey;
}

async function fetchPairingToken(serverUrl, hashKey) {
  const resp = await fetch(serverUrl + '/api/pair/generate', {
    method: 'POST',
    headers: { 'X-FSB-Hash-Key': hashKey }
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  if (!data || !data.token || !data.expiresAt) throw new Error('Malformed pairing response');
  return data; // { token, expiresAt }
}

function renderPairingQR(qrCodeEl, token, cleanUrl) {
  // QR payload contract (LOCKED): { t: token, s: serverUrl }
  const payload = JSON.stringify({ t: token, s: cleanUrl });
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  qrCodeEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
}

function startPairingCountdown(expiresAt) {
  clearPairingCountdown();
  const countdownEl = document.getElementById('pairingCountdown');
  const expiry = new Date(expiresAt).getTime();
  function tick() {
    const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
    countdownEl.textContent = remaining + 's';
    // D-03: urgency at <=10s
    if (remaining <= 10 && remaining > 0) {
      countdownEl.classList.add('pairing-countdown-urgent');
    } else if (remaining > 10) {
      countdownEl.classList.remove('pairing-countdown-urgent');
    }
    if (remaining <= 0) {
      clearPairingCountdown();
      renderExpiredState();
      return;
    }
    pairingCountdownTimer = setTimeout(tick, 1000);
  }
  tick();
}

function renderExpiredState() {
  const countdownEl = document.getElementById('pairingCountdown');
  const qrCodeEl = document.getElementById('pairingQRCode');
  if (!countdownEl || !qrCodeEl) return;
  // D-02: replace countdown text with Expired indicator
  countdownEl.classList.remove('pairing-countdown-urgent');
  countdownEl.classList.add('pairing-qr-expired');
  countdownEl.textContent = 'Expired';
  // D-02: replace QR slot with Generate new code button
  qrCodeEl.innerHTML = '';
  const regenBtn = document.createElement('button');
  regenBtn.type = 'button';
  regenBtn.className = 'control-btn accent';
  regenBtn.textContent = 'Generate new code';
  regenBtn.addEventListener('click', regeneratePairingToken);
  qrCodeEl.appendChild(regenBtn);
  // Overlay stays open (D-02): do NOT touch overlay.style.display here.
}

async function regeneratePairingToken() {
  clearPairingCountdown();
  if (pairingFetchInFlight) return;
  const countdownEl = document.getElementById('pairingCountdown');
  const qrCodeEl = document.getElementById('pairingQRCode');
  const messageEl = document.getElementById('pairingQRMessage');
  // Reset UI to live-token state before re-fetch.
  countdownEl.classList.remove('pairing-qr-expired');
  countdownEl.textContent = '60s';
  qrCodeEl.innerHTML = '';
  if (messageEl) messageEl.textContent = '';
  try {
    pairingFetchInFlight = true;
    const stored = await chrome.storage.local.get(['serverUrl', 'serverHashKey']);
    const serverUrl = (stored.serverUrl || FSB_DEFAULT_SERVER_URL).replace(/\/+$/, '');
    const hashKey = stored.serverHashKey || (await ensureHashKey(serverUrl));
    requestDashboardRelayReconnect(serverUrl, hashKey);
    const data = await fetchPairingToken(serverUrl, hashKey);
    renderPairingQR(qrCodeEl, data.token, serverUrl);
    startPairingCountdown(data.expiresAt);
  } catch (error) {
    if (messageEl) {
      messageEl.classList.add('pairing-qr-expired');
      messageEl.textContent = 'Could not generate pairing code. Try again.';
    }
    showToast('Could not generate pairing code: ' + error.message, 'error');
  } finally {
    pairingFetchInFlight = false;
  }
}

async function showPairingQR() {
  const overlay = document.getElementById('pairingQROverlay');
  // Pitfall 2: duplicate-click guard
  if (!overlay || overlay.style.display === 'flex' || pairingFetchInFlight) return;
  clearPairingCountdown();
  const qrCodeEl = document.getElementById('pairingQRCode');
  const countdownEl = document.getElementById('pairingCountdown');
  const messageEl = document.getElementById('pairingQRMessage');
  if (messageEl) {
    messageEl.classList.remove('pairing-qr-expired');
    messageEl.textContent = '';
  }
  try {
    pairingFetchInFlight = true;
    const stored = await chrome.storage.local.get(['serverUrl', 'serverHashKey']);
    // Pitfall 6: strip trailing slashes
    const serverUrl = (stored.serverUrl || FSB_DEFAULT_SERVER_URL).replace(/\/+$/, '');
    // D-01: silent hash-key auto-gen if missing. ensureHashKey throws on failure.
    let hashKey = stored.serverHashKey;
    if (!hashKey) {
      try {
        hashKey = await ensureHashKey(serverUrl);
      } catch (error) {
        showToast('Could not register hash key: ' + error.message, 'error');
        return; // abort BEFORE opening overlay
      }
    }
    requestDashboardRelayReconnect(serverUrl, hashKey);
    const data = await fetchPairingToken(serverUrl, hashKey);
    // Reset countdown DOM state before showing
    countdownEl.classList.remove('pairing-countdown-urgent');
    countdownEl.classList.remove('pairing-qr-expired');
    countdownEl.textContent = '60s';
    renderPairingQR(qrCodeEl, data.token, serverUrl);
    overlay.style.display = 'flex';
    startPairingCountdown(data.expiresAt);
  } catch (error) {
    showToast('Could not generate pairing code: ' + error.message, 'error');
  } finally {
    pairingFetchInFlight = false;
  }
}

function cancelPairing() {
  clearPairingCountdown();
  const overlay = document.getElementById('pairingQROverlay');
  const qrCodeEl = document.getElementById('pairingQRCode');
  const countdownEl = document.getElementById('pairingCountdown');
  const messageEl = document.getElementById('pairingQRMessage');
  if (overlay) overlay.style.display = 'none';
  if (qrCodeEl) qrCodeEl.innerHTML = '';
  if (countdownEl) {
    countdownEl.classList.remove('pairing-countdown-urgent');
    countdownEl.classList.remove('pairing-qr-expired');
    countdownEl.textContent = '60s';
  }
  if (messageEl) {
    messageEl.classList.remove('pairing-qr-expired');
    messageEl.textContent = '';
  }
}

// ===== Memory Dashboard =====

let memorySearchDebounce = null;

function initializeMemorySection() {
  const consolidateBtn = document.getElementById('btnConsolidateMemories');
  const exportBtn = document.getElementById('btnExportMemories');
  const clearBtn = document.getElementById('btnClearMemories');
  const searchInput = document.getElementById('memorySearchInput');
  const typeFilter = document.getElementById('memoryTypeFilter');

  if (consolidateBtn) consolidateBtn.addEventListener('click', consolidateMemories);
  if (exportBtn) exportBtn.addEventListener('click', exportMemories);
  if (clearBtn) clearBtn.addEventListener('click', clearAllMemories);

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(memorySearchDebounce);
      memorySearchDebounce = setTimeout(() => searchMemories(), 300);
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', () => searchMemories());
  }

  // Auto-analyze toggle: load saved state and persist on change
  const autoAnalyzeToggle = document.getElementById('autoAnalyzeToggle');
  if (autoAnalyzeToggle) {
    chrome.storage.local.get('autoAnalyzeMemories', (result) => {
      autoAnalyzeToggle.checked = result.autoAnalyzeMemories !== false; // default true
    });
    autoAnalyzeToggle.addEventListener('change', () => {
      chrome.storage.local.set({ autoAnalyzeMemories: autoAnalyzeToggle.checked });
      showToast(autoAnalyzeToggle.checked ? 'Auto-analyze enabled' : 'Auto-analyze disabled', 'info');
    });
  }

  // Overflow menu toggle
  const overflowBtn = document.getElementById('btnMemoryOverflow');
  const overflowDropdown = document.getElementById('memoryOverflowDropdown');
  if (overflowBtn && overflowDropdown) {
    overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      overflowDropdown.classList.toggle('visible');
    });
    document.addEventListener('click', () => {
      overflowDropdown.classList.remove('visible');
    });
    // Prevent dropdown from closing when clicking inside it
    overflowDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  loadMemoryDashboard();
}

/**
 * Smart memory refresh that preserves expanded panel state and scroll position.
 * Called by the chrome.storage.onChanged listener when fsb_memories changes.
 */
async function _smartMemoryRefresh() {
  // Save expanded panel state before re-rendering
  const expandedDetail = document.querySelector('.memory-item.detail-expanded');
  const expandedGraph = document.querySelector('.memory-item.graph-expanded');
  const expandedMemoryId = (expandedDetail || expandedGraph)?.dataset?.memoryId || null;
  const expandedType = expandedDetail ? 'detail' : (expandedGraph ? 'graph' : null);

  // Save scroll position
  const scrollContainer = document.getElementById('memoryListContainer');
  const scrollTop = scrollContainer?.scrollTop || 0;

  // Reload data (this re-renders the memory list)
  await loadMemoryDashboard();

  // Restore expanded state if an item was expanded
  if (expandedMemoryId) {
    const restoredItem = document.querySelector(`.memory-item[data-memory-id="${expandedMemoryId}"]`);
    if (restoredItem) {
      // Small delay to let the DOM settle after re-render
      setTimeout(() => {
        toggleMemoryDetail(restoredItem);
      }, 100);
    }
  }

  // Restore scroll position
  if (scrollContainer) {
    scrollContainer.scrollTop = scrollTop;
  }
}

async function loadMemoryDashboard() {
  try {
    if (typeof memoryManager === 'undefined') return;

    const stats = await memoryManager.getStats();
    updateMemoryStats(stats);

    const memories = await memoryManager.getAll();
    renderMemoryList(memories);

    // Refresh memory cost panel alongside memory data
    loadMemoryCostPanel();
  } catch (error) {
    console.error('[Options] Failed to load memory dashboard:', error);
  }
}

// Load cost breakdown by source for the Dashboard hero section
function loadDashboardCostBreakdown() {
  if (!analytics || !analytics.initialized) return;

  const automationStats = analytics.getStatsBySource('30d', 'automation');
  const memoryStats = analytics.getStatsBySource('30d', 'memory');
  const sitemapStats = analytics.getStatsBySource('30d', 'sitemap');

  const fmt = (v) => '$' + (v || 0).toFixed(2);

  const elAuto = document.getElementById('costAutomation');
  const elMem = document.getElementById('costMemory');

  if (elAuto) elAuto.textContent = fmt(automationStats.totalCost);
  if (elMem) elMem.textContent = fmt((memoryStats.totalCost || 0) + (sitemapStats.totalCost || 0));
}

// Load memory-specific cost panel in the Memory tab
function loadMemoryCostPanel() {
  if (!analytics || !analytics.initialized) return;

  const memStats = analytics.getStatsBySource('30d', 'memory');
  const sitemapStats = analytics.getStatsBySource('30d', 'sitemap');
  const totalCost = (memStats.totalCost || 0) + (sitemapStats.totalCost || 0);
  const totalRequests = (memStats.totalRequests || 0) + (sitemapStats.totalRequests || 0);
  const totalTokens = (memStats.totalTokens || 0) + (sitemapStats.totalTokens || 0);

  const elCost = document.getElementById('memCostTotal');
  const elReqs = document.getElementById('memCostRequests');
  const elTokens = document.getElementById('memCostTokens');

  if (elCost) elCost.textContent = '$' + totalCost.toFixed(4);
  if (elReqs) elReqs.textContent = totalRequests.toLocaleString();
  if (elTokens) {
    // Format tokens: 12345 -> "12.3K", 1234567 -> "1.2M"
    if (totalTokens >= 1000000) {
      elTokens.textContent = (totalTokens / 1000000).toFixed(1) + 'M';
    } else if (totalTokens >= 1000) {
      elTokens.textContent = (totalTokens / 1000).toFixed(1) + 'K';
    } else {
      elTokens.textContent = totalTokens.toLocaleString();
    }
  }
}

function updateMemoryStats(stats) {
  const el = (id, val) => {
    const e = document.getElementById(id);
    if (e) e.textContent = val;
  };

  el('memStatTotal', stats.totalCount);
  el('memStatEpisodic', stats.byType?.episodic || 0);
  el('memStatSemantic', stats.byType?.semantic || 0);
  el('memStatProcedural', stats.byType?.procedural || 0);

  const kb = Math.round(stats.estimatedBytes / 1024);
  el('memStatStorage', kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);
  el('memStatUtilization', `${stats.utilizationPercent}%`);
}

function renderMemoryList(memories) {
  const container = document.getElementById('memoryList');
  const emptyState = document.getElementById('memoryEmptyState');
  if (!container) return;

  // Clean up any active graphs and detail panels before re-render
  const activeGraphs = container.parentElement
    ? container.parentElement.querySelectorAll('.site-graph-container')
    : container.querySelectorAll('.site-graph-container');
  activeGraphs.forEach(gc => {
    if (typeof SiteGraph !== 'undefined') SiteGraph.destroy(gc);
    gc.remove();
  });
  const activeDetails = container.parentElement
    ? container.parentElement.querySelectorAll('.memory-detail-panel')
    : container.querySelectorAll('.memory-detail-panel');
  activeDetails.forEach(dp => dp.remove());

  if (memories.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      container.appendChild(emptyState);
      emptyState.style.display = '';
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  // Sort by most recently accessed
  const sorted = [...memories].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

  container.innerHTML = sorted.map(memory => {
    const typeIcon = {
      episodic: 'fa-clock',
      semantic: 'fa-lightbulb',
      procedural: 'fa-list-ol'
    }[memory.type] || 'fa-circle';

    const typeLabel = memory.type.charAt(0).toUpperCase() + memory.type.slice(1);
    const domain = memory.metadata?.domain || 'Unknown';
    const age = formatTimeAgo(memory.createdAt);
    const accesses = memory.accessCount || 0;
    const confidence = Math.round((memory.metadata?.confidence || 0) * 100);
    const tags = (memory.metadata?.tags || []).slice(0, 3).join(', ');

    const isSiteMap = memory.typeData?.category === 'site_map';
    const isRefined = memory.typeData?.sitePattern?.refined === true;
    const badgeHtml = isSiteMap
      ? `<span class="memory-badge ${isRefined ? 'refined' : 'basic'}">${isRefined ? 'Refined' : 'Basic'}</span>`
      : '';
    const refineBtn = isSiteMap && !isRefined
      ? `<button class="refine-btn-prominent" data-id="${memory.id}" data-recon-id="${memory.typeData?.sitePattern?.reconId || ''}" title="Refine sitemap"><i class="fas fa-magic"></i> Refine</button>`
      : '';

    const graphAttr = isSiteMap ? ' data-has-graph="true"' : '';
    const chevronHtml = '<i class="fas fa-chevron-right detail-toggle-icon" title="Toggle details"></i>';

    return `
      <div class="session-item memory-item" data-memory-id="${memory.id}" data-expandable="true"${graphAttr} style="cursor: pointer;">
        <div class="session-item-header" style="display: flex; align-items: center; gap: 10px;">
          <i class="fas ${typeIcon}" style="color: var(--primary); font-size: 1.1em;" title="${typeLabel}"></i>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(memory.text)} ${badgeHtml}
            </div>
            <div style="font-size: 0.82em; color: var(--text-secondary); margin-top: 2px;">
              ${typeLabel} | ${escapeHtml(domain)} | ${age} | ${accesses} accesses | ${confidence}% conf${tags ? ' | ' + escapeHtml(tags) : ''}
            </div>
          </div>
          ${refineBtn}
          ${chevronHtml}
          <button class="control-btn small memory-delete-btn" data-id="${memory.id}" title="Delete memory" style="color: var(--danger, #ef4444); flex-shrink: 0;">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach delete handlers
  container.querySelectorAll('.memory-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Delete this memory?')) {
        await memoryManager.delete(id);
        loadMemoryDashboard();
        showToast('Memory deleted', 'info');
      }
    });
  });

  // Attach refine-with-AI handlers
  container.querySelectorAll('.refine-btn-prominent').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const memoryId = btn.dataset.id;
      const reconId = btn.dataset.reconId;
      await refineMemoryWithAI(memoryId, reconId);
    });
  });

  // Attach click-to-expand handlers on all memory items
  container.querySelectorAll('.memory-item[data-expandable="true"]').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't trigger on button clicks
      if (e.target.closest('.control-btn') || e.target.closest('.refine-btn-prominent')) return;
      toggleMemoryDetail(item);
    });
  });
}

/* ── Memory Detail Panel expand/collapse (all memory types) ── */

async function toggleMemoryDetail(memoryItem) {
  const memoryId = memoryItem.dataset.memoryId;

  // If already expanded (detail or graph), collapse
  if (memoryItem.classList.contains('detail-expanded')) {
    collapseMemoryDetail(memoryItem);
    return;
  }
  if (memoryItem.classList.contains('graph-expanded')) {
    collapseMemoryGraph(memoryItem);
    return;
  }

  // Collapse any other currently expanded detail panel (accordion)
  const existingDetail = document.querySelector('.memory-item.detail-expanded');
  if (existingDetail) {
    collapseMemoryDetail(existingDetail);
  }

  // Also collapse any existing graph-expanded item (mutually exclusive)
  const existingGraph = document.querySelector('.memory-item.graph-expanded');
  if (existingGraph) {
    collapseMemoryGraph(existingGraph);
  }

  // Fetch full memory data
  let memory;
  try {
    const memories = await memoryManager.getAll();
    memory = memories.find(m => m.id === memoryId);
  } catch (err) {
    showToast('Failed to load memory data', 'error');
    return;
  }
  if (!memory) {
    showToast('Memory not found', 'error');
    return;
  }

  // Site map memories show the mind map graph visualization
  if (memory.typeData?.category === 'site_map') {
    toggleMemoryGraph(memoryItem);
    return;
  }

  // Build and insert the detail panel for non-sitemap memories
  const panelHtml = renderMemoryDetailPanel(memory);
  const panelDiv = document.createElement('div');
  panelDiv.className = 'memory-detail-panel';
  panelDiv.innerHTML = panelHtml;
  memoryItem.classList.add('detail-expanded');
  memoryItem.after(panelDiv);

  // Scroll into view
  memoryItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function collapseMemoryDetail(memoryItem) {
  memoryItem.classList.remove('detail-expanded');
  const nextSibling = memoryItem.nextElementSibling;
  if (nextSibling && nextSibling.classList.contains('memory-detail-panel')) {
    nextSibling.remove();
  }
}

function renderMemoryDetailPanel(memory) {
  let content = '';

  switch (memory.type) {
    case 'episodic':
      content = renderEpisodicDetail(memory);
      break;
    case 'semantic':
      content = renderSemanticDetail(memory);
      break;
    case 'procedural':
      content = renderProceduralDetail(memory);
      break;
    default:
      content = `<div class="detail-section"><div class="detail-value">${escapeHtml(memory.text)}</div></div>`;
  }

  const aiSection = renderAIAnalysisSection(memory.aiAnalysis);

  return `
    <div class="detail-panel-inner">
      ${content}
      ${aiSection}
    </div>
  `;
}

function renderEpisodicDetail(memory) {
  const td = memory.typeData || {};
  const outcomeClass = {
    success: 'outcome-success',
    failure: 'outcome-failure',
    partial: 'outcome-partial'
  }[td.outcome] || 'outcome-unknown';

  const outcomeLabel = (td.outcome || 'unknown').charAt(0).toUpperCase() + (td.outcome || 'unknown').slice(1);

  // Format duration
  let durationStr = 'N/A';
  if (td.duration && td.duration > 0) {
    const totalSec = Math.round(td.duration / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  const stepsHtml = (td.stepsCompleted && td.stepsCompleted.length > 0)
    ? `<ul class="detail-list">${td.stepsCompleted.map(s => `<li>${escapeHtml(String(s))}</li>`).join('')}</ul>`
    : '<span class="detail-muted">None recorded</span>';

  const failuresHtml = (td.failures && td.failures.length > 0)
    ? `<ul class="detail-list">${td.failures.map(f => `<li>${escapeHtml(String(f))}</li>`).join('')}</ul>`
    : '<span class="detail-muted">None</span>';

  const finalUrlHtml = td.finalUrl
    ? `<div class="detail-section">
        <div class="detail-label">Final URL</div>
        <div class="detail-value"><a href="${escapeHtml(td.finalUrl)}" target="_blank" rel="noopener">${escapeHtml(td.finalUrl)}</a></div>
      </div>`
    : '';

  return `
    <div class="detail-grid">
      <div class="detail-section">
        <div class="detail-label">Task</div>
        <div class="detail-value">${escapeHtml(td.task || 'N/A')}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Outcome</div>
        <div class="detail-value"><span class="${outcomeClass}">${outcomeLabel}</span></div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Duration</div>
        <div class="detail-value">${durationStr}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Iterations</div>
        <div class="detail-value">${td.iterationCount || 0}</div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Steps Completed</div>
      ${stepsHtml}
    </div>
    <div class="detail-section">
      <div class="detail-label">Failures</div>
      ${failuresHtml}
    </div>
    ${finalUrlHtml}
  `;
}

function renderSemanticDetail(memory) {
  const td = memory.typeData || {};
  const categoryLabels = {
    site_map: 'Site Map',
    selector: 'Selector',
    site_pattern: 'Site Pattern',
    general: 'General',
    cross_site_pattern: 'Cross-Site Pattern',
    user_preference: 'User Preference'
  };
  const categoryLabel = categoryLabels[td.category] || (td.category || 'General');

  let categoryContent = '';

  if (td.category === 'site_map' && td.sitePattern) {
    // Read-only sitemap detail for nerds
    const sp = td.sitePattern;
    const pageCount = sp.pageCount || Object.keys(sp.pages || {}).length || 0;
    const formCount = sp.formCount || Object.keys(sp.forms || {}).length || 0;
    const navCount = Object.keys(sp.navigation || {}).length;
    const selectorCount = Object.keys(sp.keySelectors || {}).length;
    const linkCount = (sp.pageLinks || []).length;
    const crawledAt = sp.crawledAt ? new Date(sp.crawledAt).toLocaleString() : 'Unknown';

    // Build pages list (top 15)
    const pageEntries = Object.entries(sp.pages || {}).slice(0, 15);
    const pagesHtml = pageEntries.length > 0
      ? `<ul class="detail-list">${pageEntries.map(([path, info]) => {
          const title = info.title ? ` -- ${escapeHtml(info.title)}` : '';
          return `<li><span class="detail-code">${escapeHtml(path)}</span>${title}</li>`;
        }).join('')}</ul>${Object.keys(sp.pages || {}).length > 15 ? `<div class="detail-muted">...and ${Object.keys(sp.pages).length - 15} more</div>` : ''}`
      : '<span class="detail-muted">None</span>';

    // Build forms list
    const formEntries = Object.entries(sp.forms || {});
    const formsHtml = formEntries.length > 0
      ? `<ul class="detail-list">${formEntries.map(([path, formList]) => {
          const count = Array.isArray(formList) ? formList.length : 1;
          return `<li><span class="detail-code">${escapeHtml(path)}</span> (${count} form${count !== 1 ? 's' : ''})</li>`;
        }).join('')}</ul>`
      : '<span class="detail-muted">None</span>';

    // Build navigation summary
    const navEntries = Object.entries(sp.navigation || {});
    const navHtml = navEntries.length > 0
      ? `<ul class="detail-list">${navEntries.slice(0, 10).map(([path, navItems]) => {
          const count = Array.isArray(navItems) ? navItems.length : 0;
          return `<li><span class="detail-code">${escapeHtml(path)}</span> (${count} nav item${count !== 1 ? 's' : ''})</li>`;
        }).join('')}</ul>`
      : '<span class="detail-muted">None</span>';

    categoryContent = `
      <div class="detail-grid" style="grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px;">
        <div class="detail-section">
          <div class="detail-label">Pages</div>
          <div class="detail-value" style="font-size: 1.2em; font-weight: 700;">${pageCount}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">Forms</div>
          <div class="detail-value" style="font-size: 1.2em; font-weight: 700;">${formCount}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">Nav Sections</div>
          <div class="detail-value" style="font-size: 1.2em; font-weight: 700;">${navCount}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">Links</div>
          <div class="detail-value" style="font-size: 1.2em; font-weight: 700;">${linkCount}</div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Crawled</div>
        <div class="detail-value">${crawledAt}${sp.refined ? ' (refined)' : ''}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Pages Discovered</div>
        ${pagesHtml}
      </div>
      <div class="detail-section">
        <div class="detail-label">Forms Found</div>
        ${formsHtml}
      </div>
      <div class="detail-section">
        <div class="detail-label">Navigation</div>
        ${navHtml}
      </div>
    `;
  } else if (td.category === 'selector' && td.selectorInfo) {
    // Render selector info as key-value table
    const rows = Object.entries(td.selectorInfo)
      .map(([key, val]) => `<tr><td class="detail-code">${escapeHtml(key)}</td><td>${escapeHtml(String(val))}</td></tr>`)
      .join('');
    categoryContent = `
      <div class="detail-section">
        <div class="detail-label">Selector Info</div>
        <table class="detail-table">
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else if (td.category === 'site_pattern' && td.sitePattern) {
    const sp = td.sitePattern;
    categoryContent = `
      <div class="detail-section">
        <div class="detail-label">Site Pattern</div>
        <div class="detail-grid">
          <div class="detail-section">
            <div class="detail-label">Pages</div>
            <div class="detail-value">${sp.pageCount || 0}</div>
          </div>
          <div class="detail-section">
            <div class="detail-label">Forms</div>
            <div class="detail-value">${sp.formCount || 0}</div>
          </div>
        </div>
      </div>
    `;
  } else if (td.category === 'cross_site_pattern' && td.sitePattern) {
    const sp = td.sitePattern;
    const domainsHtml = (sp.domains && sp.domains.length > 0)
      ? `<ul class="detail-list">${sp.domains.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
      : '<span class="detail-muted">None</span>';
    const formTypesHtml = (sp.commonFormTypes && sp.commonFormTypes.length > 0)
      ? `<ul class="detail-list">${sp.commonFormTypes.map(f => `<li>${escapeHtml(String(f))}</li>`).join('')}</ul>`
      : '<span class="detail-muted">None</span>';
    const sharedPatternsHtml = (sp.sharedSelectorPatterns && sp.sharedSelectorPatterns.length > 0)
      ? `<ul class="detail-list">${sp.sharedSelectorPatterns.map(p => `<li class="detail-code">${escapeHtml(String(p))}</li>`).join('')}</ul>`
      : '<span class="detail-muted">None</span>';
    categoryContent = `
      <div class="detail-section">
        <div class="detail-label">Domains Analyzed</div>
        ${domainsHtml}
      </div>
      <div class="detail-section">
        <div class="detail-label">Common Form Types</div>
        ${formTypesHtml}
      </div>
      <div class="detail-section">
        <div class="detail-label">Shared Selector Patterns</div>
        ${sharedPatternsHtml}
      </div>
    `;
  } else {
    // General or unknown category -- show the memory text prominently
    categoryContent = `
      <div class="detail-section">
        <div class="detail-value" style="font-size: 1.05em;">${escapeHtml(memory.text)}</div>
      </div>
    `;
  }

  const validatedHtml = td.validatedAt
    ? `<div class="detail-section">
        <div class="detail-label">Validated At</div>
        <div class="detail-value">${new Date(td.validatedAt).toLocaleString()}</div>
      </div>`
    : '';

  return `
    <div class="detail-grid">
      <div class="detail-section">
        <div class="detail-label">Category</div>
        <div class="detail-value">${categoryLabel}</div>
      </div>
    </div>
    ${categoryContent}
    ${validatedHtml}
  `;
}

function renderProceduralDetail(memory) {
  const td = memory.typeData || {};

  const stepsHtml = (td.steps && td.steps.length > 0)
    ? `<ol class="detail-list detail-list-ordered">${td.steps.map(s => `<li>${escapeHtml(String(s))}</li>`).join('')}</ol>`
    : '<span class="detail-muted">No steps recorded</span>';

  const selectorsHtml = (td.selectors && td.selectors.length > 0)
    ? `<ul class="detail-list">${td.selectors.map(s => `<li><code class="detail-code">${escapeHtml(String(s))}</code></li>`).join('')}</ul>`
    : '<span class="detail-muted">None</span>';

  // Success rate color
  const rate = (td.successRate ?? 1) * 100;
  const rateClass = rate >= 80 ? 'outcome-success' : rate >= 50 ? 'outcome-partial' : 'outcome-failure';

  const targetUrlHtml = td.targetUrl
    ? `<div class="detail-section">
        <div class="detail-label">Target URL</div>
        <div class="detail-value"><a href="${escapeHtml(td.targetUrl)}" target="_blank" rel="noopener">${escapeHtml(td.targetUrl)}</a></div>
      </div>`
    : '';

  return `
    <div class="detail-grid">
      <div class="detail-section">
        <div class="detail-label">Success Rate</div>
        <div class="detail-value"><span class="${rateClass}">${Math.round(rate)}%</span></div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Total Runs</div>
        <div class="detail-value">${td.totalRuns || 0}</div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Steps</div>
      ${stepsHtml}
    </div>
    <div class="detail-section">
      <div class="detail-label">Selectors Used</div>
      ${selectorsHtml}
    </div>
    ${targetUrlHtml}
  `;
}

function renderAIAnalysisSection(aiAnalysis) {
  if (!aiAnalysis || typeof aiAnalysis !== 'object') return '';

  const entries = Object.entries(aiAnalysis);
  if (entries.length === 0) return '';

  const renderValue = (val) => {
    if (Array.isArray(val)) {
      if (val.length === 0) return '<span class="detail-muted">None</span>';
      return `<ul class="detail-list">${val.map(v => `<li>${escapeHtml(String(v))}</li>`).join('')}</ul>`;
    }
    if (typeof val === 'object' && val !== null) {
      const subEntries = Object.entries(val)
        .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`)
        .join('');
      return `<ul class="detail-list">${subEntries}</ul>`;
    }
    return `<p class="detail-value">${escapeHtml(String(val))}</p>`;
  };

  const sections = entries.map(([key, val]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    return `
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(label)}</div>
        ${renderValue(val)}
      </div>
    `;
  }).join('');

  return `
    <div class="ai-analysis-section">
      <div class="ai-analysis-header"><i class="fas fa-brain"></i> Analysis</div>
      ${sections}
    </div>
  `;
}

/* ── Site Graph expand/collapse for memory items ── */

function toggleMemoryGraph(memoryItem) {
  const memoryId = memoryItem.dataset.memoryId;

  // If already expanded, collapse
  if (memoryItem.classList.contains('graph-expanded')) {
    collapseMemoryGraph(memoryItem);
    return;
  }

  // Collapse any other expanded graph first
  const existingExpanded = document.querySelector('.memory-item.graph-expanded');
  if (existingExpanded) {
    collapseMemoryGraph(existingExpanded);
  }

  // Expand the clicked item
  expandMemoryGraph(memoryItem, memoryId);
}

async function expandMemoryGraph(memoryItem, memoryId) {
  if (typeof SiteGraph === 'undefined') {
    showToast('Graph engine not available', 'error');
    return;
  }

  // Get memory data
  let memory;
  try {
    const memories = await memoryManager.getAll();
    memory = memories.find(m => m.id === memoryId);
  } catch (err) {
    showToast('Failed to load memory data', 'error');
    return;
  }
  if (!memory) {
    showToast('Memory not found', 'error');
    return;
  }

  const sitePattern = memory.typeData?.sitePattern;
  if (!sitePattern) {
    showToast('No site pattern data in this memory', 'error');
    return;
  }

  // Transform data for the graph
  const graphData = SiteGraph.transformData(sitePattern);
  if (!graphData.nodes || graphData.nodes.length === 0) {
    showToast('No pages found in site map', 'info');
    return;
  }

  // Mark item as expanded
  memoryItem.classList.add('graph-expanded');

  // Create wrapper container
  const wrapper = document.createElement('div');
  wrapper.className = 'site-graph-container';

  // Build legend based on data present
  const hasPages = graphData.nodes.some(n => n.type === 'page');
  const hasForms = graphData.nodes.some(n => n.type === 'form');
  const hasElements = graphData.nodes.some(n => n.type === 'element');
  const hasWorkflowLinks = graphData.links.some(l => l.type === 'workflow');

  const hasDiscovered = graphData.nodes.some(n => n.discovered);

  let legendItems = '';
  if (hasPages) legendItems += '<span class="site-graph-legend-item"><span class="site-graph-legend-dot" style="background: #4285f4; opacity: 0.7;"></span> Page</span>';
  if (hasDiscovered) legendItems += '<span class="site-graph-legend-item"><span class="site-graph-legend-dot" style="background: transparent; border: 1.5px dashed #4285f4; opacity: 0.5;"></span> Discovered</span>';
  if (hasForms) legendItems += '<span class="site-graph-legend-item"><span class="site-graph-legend-dot" style="background: #d97706; opacity: 0.7;"></span> Form</span>';
  if (hasElements) legendItems += '<span class="site-graph-legend-item"><span class="site-graph-legend-dot" style="background: var(--text-muted, #737373); opacity: 0.5; border: 1px dashed var(--text-muted, #737373); background: transparent;"></span> Element</span>';
  if (hasWorkflowLinks) legendItems += '<span class="site-graph-legend-item"><span class="site-graph-legend-dot" style="background: transparent; border: 1.5px dashed var(--success-color, #059669);"></span> Workflow</span>';

  if (legendItems) {
    const legend = document.createElement('div');
    legend.className = 'site-graph-legend';
    legend.innerHTML = legendItems;
    wrapper.appendChild(legend);
  }

  // Detail toggle toolbar
  const savedLevel = localStorage.getItem('fsbGraphDetailLevel') || 'simple';
  const toolbar = document.createElement('div');
  toolbar.className = 'site-graph-toolbar';
  const toggle = document.createElement('div');
  toggle.className = 'site-graph-detail-toggle';
  toggle.innerHTML =
    '<button class="detail-btn' + (savedLevel === 'simple' ? ' active' : '') + '" data-level="simple">Simple</button>' +
    '<button class="detail-btn' + (savedLevel === 'full' ? ' active' : '') + '" data-level="full">Full</button>';
  toolbar.appendChild(toggle);
  wrapper.appendChild(toolbar);

  // Insert wrapper after the memory item
  memoryItem.after(wrapper);

  // Current detail level state
  let currentDetailLevel = savedLevel;

  function renderGraph() {
    requestAnimationFrame(() => {
      const rect = wrapper.getBoundingClientRect();
      const width = Math.max(rect.width - 16, 300);
      // Scale height based on node count for larger graphs
      const nodeCount = graphData.nodes.length;
      const graphHeight = nodeCount > 40 ? 600 : nodeCount > 20 ? 520 : 440;
      SiteGraph.render(wrapper, graphData, { width, height: graphHeight, memoryId, detailLevel: currentDetailLevel });
    });
  }

  // Toggle click handler
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.detail-btn');
    if (!btn) return;
    const level = btn.dataset.level;
    if (level === currentDetailLevel) return;

    currentDetailLevel = level;
    localStorage.setItem('fsbGraphDetailLevel', level);

    // Update active state
    toggle.querySelectorAll('.detail-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Re-render with new detail level
    SiteGraph.destroy(wrapper);
    renderGraph();
  });

  // Initial render
  renderGraph();

  // Scroll into view
  memoryItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function collapseMemoryGraph(memoryItem) {
  memoryItem.classList.remove('graph-expanded');

  // Find the graph container that follows this memory item
  const nextSibling = memoryItem.nextElementSibling;
  if (nextSibling && nextSibling.classList.contains('site-graph-container')) {
    if (typeof SiteGraph !== 'undefined') SiteGraph.destroy(nextSibling);
    nextSibling.remove();
  }
}

async function refineMemoryWithAI(memoryId, reconId) {
  if (typeof refineSiteMapWithAI !== 'function') {
    showToast('AI refiner not available', 'error');
    return;
  }

  // Get the memory
  const memories = await memoryManager.getAll();
  const memory = memories.find(m => m.id === memoryId);
  if (!memory || memory.typeData?.category !== 'site_map') {
    showToast('Memory not found or not a site map', 'error');
    return;
  }

  // Get research data if available
  let researchData = null;
  if (reconId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getResearchData', researchId: reconId });
      if (response?.success) researchData = response.data;
    } catch (e) {
      // Research data not available
    }
  }

  showToast('Refining site map with AI...', 'info');
  try {
    const refined = await refineSiteMapWithAI(memory.typeData.sitePattern, researchData);
    memory.typeData.sitePattern = refined;
    memory.metadata.confidence = 0.95;
    memory.text = memory.text.replace(/\)$/, ' (AI enhanced)').replace(/ \(AI enhanced\) \(AI enhanced\)/, ' (AI enhanced)');
    if (!memory.text.includes('(AI enhanced)')) memory.text += ' (AI enhanced)';
    memory.updatedAt = Date.now();
    await memoryStorage.update(memory.id, memory);
    showToast('Site map refined successfully', 'success');
    loadMemoryDashboard();
  } catch (err) {
    showToast('AI refinement failed: ' + err.message, 'error');
  }
}

async function searchMemories() {
  if (typeof memoryManager === 'undefined') return;

  const query = document.getElementById('memorySearchInput')?.value || '';
  const type = document.getElementById('memoryTypeFilter')?.value || '';

  try {
    let results;
    if (query.trim()) {
      const filters = {};
      if (type) filters.type = type;
      results = await memoryManager.search(query, filters, { topN: 50, minScore: 0.05 });
    } else {
      results = await memoryManager.getAll();
      if (type) {
        results = results.filter(m => m.type === type);
      }
    }
    renderMemoryList(results);
  } catch (error) {
    console.error('[Options] Memory search failed:', error);
  }
}

async function consolidateMemories() {
  if (typeof memoryManager === 'undefined') return;

  try {
    showToast('Consolidating memories...', 'info');
    const result = await memoryManager.consolidate();
    showToast(`Consolidated: ${result.merged} merged, ${result.deleted} removed, ${result.total} remaining`, 'success');
    loadMemoryDashboard();
  } catch (error) {
    showToast('Consolidation failed: ' + error.message, 'error');
  }
}

async function exportMemories() {
  if (typeof memoryManager === 'undefined') return;

  try {
    const memories = await memoryManager.getAll();
    const blob = new Blob([JSON.stringify(memories, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fsb-memories-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Memories exported', 'success');
  } catch (error) {
    showToast('Export failed: ' + error.message, 'error');
  }
}

async function clearAllMemories() {
  if (typeof memoryManager === 'undefined') return;

  if (!confirm('Delete ALL memories? This cannot be undone.')) return;

  try {
    await memoryManager.deleteAll();
    loadMemoryDashboard();
    showToast('All memories cleared', 'info');
  } catch (error) {
    showToast('Failed to clear memories: ' + error.message, 'error');
  }
}

// Initialize sync section deprecation/button wiring and memory section when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initializeSyncDeprecationAndButtons, 300);
  setTimeout(initializeMemorySection, 400);
});

// ============================================================================
// Phase 213 - Sync tab pill state machine (SYNC-02)
// Subscribes to remoteControlStateChanged runtime push and derives pill state
// per CONTEXT D-19. Falls through to "disconnected" gracefully if 213-02's
// runtime action getRemoteControlState is not yet registered (dispatch-order
// tolerant per CONTEXT D-25).
// ============================================================================

var _syncSectionInitialized = false;
var _syncLastRemoteControlState = null; // last payload from runtime push or replay

function _isPairingOverlayVisible() {
  var overlay = document.getElementById('pairingQROverlay');
  if (!overlay) return false;
  // Overlay visibility toggles via inline style.display per Phase 210
  return overlay.style.display && overlay.style.display !== 'none';
}

function _hasServerHashKey() {
  var input = document.getElementById('serverHashKey');
  return !!(input && input.value && input.value.trim());
}

function _wsIsOpen() {
  // dashboardState.wsConnected is the canonical readiness flag managed by
  // the existing WS connect/disconnect handlers; fall back to false if absent.
  return !!(typeof dashboardState !== 'undefined' && dashboardState && dashboardState.wsConnected === true);
}

function _deriveSyncPillState(remoteControlState) {
  // CONTEXT D-19 derivation logic:
  //   If remoteControlState.enabled === true -> remote-active
  //   Else if WS open AND serverHashKey set -> connected
  //   Else if pairing overlay visible -> connecting
  //   Else -> disconnected
  if (remoteControlState && remoteControlState.enabled === true) {
    return 'remote-active';
  }
  if (_wsIsOpen() && _hasServerHashKey()) {
    return 'connected';
  }
  if (_isPairingOverlayVisible()) {
    return 'connecting';
  }
  return 'disconnected';
}

var _SYNC_PILL_LABELS = {
  'connected': 'Connected',
  'connecting': 'Connecting...',
  'disconnected': 'Disconnected',
  'remote-active': 'Remote control active'
};

function _applySyncPillState(state) {
  var pill = document.getElementById('syncStatusPill');
  if (!pill) return;
  var key = (state === 'connected' || state === 'connecting' || state === 'disconnected' || state === 'remote-active')
    ? state
    : 'disconnected';
  pill.setAttribute('data-state', key);
  var labelEl = pill.querySelector('.label');
  if (labelEl) {
    labelEl.textContent = _SYNC_PILL_LABELS[key];
  }
}

function _refreshSyncPill() {
  _applySyncPillState(_deriveSyncPillState(_syncLastRemoteControlState));
}

function initializeSyncSection() {
  if (_syncSectionInitialized) return;
  _syncSectionInitialized = true;

  // Replay-on-attach: ask background.js for the last cached ext:remote-control-state.
  // If 213-02 has not registered the action yet, chrome.runtime.sendMessage will
  // surface chrome.runtime.lastError and the response will be undefined -- we just
  // fall through to the "unknown -> disconnected" default per CONTEXT D-25.
  try {
    chrome.runtime.sendMessage({ action: 'getRemoteControlState' }, function (response) {
      var lastErr = chrome.runtime.lastError; // suppress lastError surface noise
      if (lastErr) {
        // Action not registered yet (213-02 dispatch-order tolerance). Stay disconnected.
        _syncLastRemoteControlState = null;
      } else if (response && typeof response === 'object') {
        // Accept either { state: {...} } or the bare payload {...}
        _syncLastRemoteControlState = response.state || response;
      }
      _refreshSyncPill();
    });
  } catch (e) {
    // chrome.runtime unavailable in this context; default to disconnected
    _refreshSyncPill();
  }

  // Seed the WS connectivity flag (the 'Connected' input to _deriveSyncPillState).
  // The SW may be cold here: the query itself wakes it, it reports
  // connected:false, and the 'dashboardWsStatusChanged' push below flips the
  // pill once the socket reopens.
  try {
    chrome.runtime.sendMessage({ action: 'getDashboardWebSocketStatus' }, function (response) {
      var lastErr = chrome.runtime.lastError; // suppress lastError surface noise
      if (!lastErr && response && typeof response === 'object') {
        dashboardState.wsConnected = response.connected === true;
      }
      _refreshSyncPill();
    });
  } catch (e) {
    _refreshSyncPill();
  }

  // Live updates via runtime push from ws/ws-client.js: remote-control state
  // (_broadcastRemoteControlState, 213-02) and relay WS connectivity
  // (_broadcastDashboardWsStatus). Never return true here -- this listener
  // never responds, and returning true would hold the message channel open.
  if (chrome.runtime && chrome.runtime.onMessage && chrome.runtime.onMessage.addListener) {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
      if (!request) return;
      if (request.action === 'remoteControlStateChanged') {
        if (request.state && typeof request.state === 'object') {
          _syncLastRemoteControlState = request.state;
          _refreshSyncPill();
        }
        return;
      }
      if (request.action === 'dashboardWsStatusChanged') {
        dashboardState.wsConnected = request.connected === true;
        _refreshSyncPill();
      }
    });
  }
}


// ---------------------------------------------------------------------------
// Phase 228 / Plan 02: FSBDiscoveryUI
//
// Discovery wiring helpers. Exposed on globalThis so tests can drive them
// directly without booting the whole DOMContentLoaded path. The DOM-bound
// event listeners below (provider change, API-key input debounce, refresh
// button click) all delegate into runDiscovery() so behavior is centralized.
//
// Out-of-scope providers (lmstudio, custom) are explicitly NOT handled here;
// updateModelOptions() retains its existing flow for those.
//
// Persistence (chrome.storage.local writes for modelName) is NOT touched by
// this module — Plan 228-03 owns the validation migration.
// ---------------------------------------------------------------------------
(function defineFSBDiscoveryUI(global) {
  'use strict';

  const IN_SCOPE_PROVIDERS = Object.freeze({
    xai: 'apiKey',
    gemini: 'geminiApiKey',
    openai: 'openaiApiKey',
    anthropic: 'anthropicApiKey',
    openrouter: 'openrouterApiKey'
  });

  // Per-provider debounce timers for API-key input handling.
  const _debounceTimers = {};
  const DEFAULT_DEBOUNCE_MS = 500;
  let _currentModels = [];
  let _currentSearchQuery = '';
  let _discoveryGeneration = 0;
  let _activeDiscoveryRun = null;

  function _doc() { return (typeof document !== 'undefined') ? document : null; }

  function _getInputValueForProvider(provider) {
    const inputId = IN_SCOPE_PROVIDERS[provider];
    if (!inputId) return '';
    const doc = _doc();
    if (!doc) return '';
    const el = doc.getElementById(inputId);
    return (el && typeof el.value === 'string') ? el.value.trim() : '';
  }

  function _captureDiscoveryUiState() {
    const doc = _doc();
    if (!doc) return null;
    const select = doc.getElementById('modelName');
    const refresh = doc.getElementById('refreshModelsBtn');
    const status = doc.getElementById('modelDiscoveryStatus');
    const optionSource = select && (select.options || select.children);
    return {
      options: optionSource ? Array.prototype.map.call(optionSource, option => ({
        value: option.value,
        textContent: option.textContent,
        disabled: option.disabled === true
      })) : [],
      value: select ? select.value : '',
      selectDisabled: select ? select.disabled === true : false,
      refreshDisabled: refresh ? refresh.disabled === true : false,
      statusText: status ? status.textContent : '',
      statusHidden: status ? status.hidden === true : true,
      statusClasses: status && status.classList
        ? ['info', 'warning', 'error', 'loading'].filter(name => status.classList.contains(name))
        : []
    };
  }

  function _restoreDiscoveryUiState(snapshot) {
    const doc = _doc();
    if (!doc || !snapshot) return;
    const select = doc.getElementById('modelName');
    const refresh = doc.getElementById('refreshModelsBtn');
    const status = doc.getElementById('modelDiscoveryStatus');
    if (select) {
      select.innerHTML = '';
      snapshot.options.forEach(saved => {
        const option = doc.createElement('option');
        option.value = saved.value;
        option.textContent = saved.textContent;
        option.disabled = saved.disabled;
        select.appendChild(option);
      });
      select.value = snapshot.value;
      select.disabled = snapshot.selectDisabled;
    }
    if (refresh) refresh.disabled = snapshot.refreshDisabled;
    if (status) {
      ['info', 'warning', 'error', 'loading'].forEach(name => status.classList.remove(name));
      snapshot.statusClasses.forEach(name => status.classList.add(name));
      status.textContent = snapshot.statusText;
      status.hidden = snapshot.statusHidden;
      if (snapshot.statusHidden) status.setAttribute('hidden', '');
      else status.removeAttribute('hidden');
    }
  }

  function invalidateDiscovery(options) {
    const activeRun = _activeDiscoveryRun;
    Object.keys(_debounceTimers).forEach(provider => {
      const timer = _debounceTimers[provider];
      if (timer !== null && timer !== undefined) clearTimeout(timer);
      _debounceTimers[provider] = null;
    });
    _discoveryGeneration += 1;
    _activeDiscoveryRun = null;
    if (options && options.restoreUi === true && activeRun) {
      _restoreDiscoveryUiState(activeRun.snapshot);
    }
  }

  function _isDiscoveryCurrent(generation) {
    return generation === _discoveryGeneration;
  }

  function _cancelledDiscoveryResult(provider) {
    return { ok: false, reason: 'cancelled', provider };
  }

  function setDiscoveryStatus(state) {
    const doc = _doc();
    if (!doc) return;
    const chip = doc.getElementById('modelDiscoveryStatus');
    if (!chip) return;
    const kind = state && state.kind;
    const text = (state && state.text) || '';

    // Reset variant classes
    ['info', 'warning', 'error', 'loading'].forEach(c => chip.classList.remove(c));

    if (kind === 'hidden' || !kind) {
      chip.hidden = true;
      chip.setAttribute('hidden', '');
      chip.textContent = '';
      return;
    }

    chip.classList.add(kind);
    chip.textContent = text;
    chip.hidden = false;
    chip.removeAttribute('hidden');
  }

  function _normalizeModelSearchText(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function _tokenizeModelSearch(query) {
    return _normalizeModelSearchText(query)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function _modelSearchText(model) {
    if (!model) return '';
    return _normalizeModelSearchText([
      model.id,
      model.displayName,
      model.name,
      model.description,
      model.provider
    ].filter(Boolean).join(' '));
  }

  function filterModelsForSearch(models, query) {
    const list = Array.isArray(models) ? models : [];
    const tokens = _tokenizeModelSearch(query);
    if (!tokens.length) return list.slice();
    return list.filter(model => {
      const haystack = _modelSearchText(model);
      return tokens.every(token => haystack.indexOf(token) !== -1);
    });
  }

  function _renderModelDropdownOptions(models, selectedId) {
    const doc = _doc();
    if (!doc) return null;
    const sel = doc.getElementById('modelName');
    if (!sel) return null;
    sel.innerHTML = '';
    const list = models || [];
    const hasSearch = _tokenizeModelSearch(_currentSearchQuery).length > 0;

    if (!list.length) {
      const opt = doc.createElement('option');
      opt.value = '';
      opt.textContent = hasSearch ? 'No models match search' : 'No models available';
      opt.disabled = true;
      sel.appendChild(opt);
      sel.value = '';
      sel.disabled = false;
      return null;
    }

    // Phase 232: sticky selection. If the user previously saved a model that's
    // not in the freshly-discovered list (preview model expired, provider
    // pruned the list, etc.), preserve it as a synthetic "(saved)" entry at
    // the top of the dropdown rather than silently reassigning the selection.
    const presentIds = new Set(list.map(m => String(m.id)));
    const savedMissing = selectedId && !presentIds.has(String(selectedId));
    if (savedMissing) {
      const opt = doc.createElement('option');
      opt.value = selectedId;
      opt.textContent = '(saved) ' + selectedId;
      sel.appendChild(opt);
    }

    let chosen = null;
    list.forEach((m, idx) => {
      const opt = doc.createElement('option');
      opt.value = m.id;
      opt.textContent = m.displayName || m.name || m.id;
      sel.appendChild(opt);
      if (selectedId && m.id === selectedId) chosen = m.id;
      if (chosen == null && !savedMissing && idx === 0) chosen = m.id;
    });
    if (savedMissing) chosen = selectedId;
    sel.value = chosen || '';
    sel.disabled = false;
    return chosen;
  }

  function renderModelDropdown(models, selectedId) {
    _currentModels = (Array.isArray(models) ? models : []).map(m => ({ ...m }));
    // The unified combobox owns search/filtering as a view concern, so the
    // native select always holds the full discovered list here.
    return _renderModelDropdownOptions(_currentModels.slice(), selectedId);
  }

  function applyModelSearch(query, opts) {
    const options = opts || {};
    _currentSearchQuery = String(query || '');
    return _renderModelDropdownOptions(
      filterModelsForSearch(_currentModels, _currentSearchQuery),
      options.previousSelection
    );
  }

  function _setControlsDisabled(disabled) {
    const doc = _doc();
    if (!doc) return;
    const sel = doc.getElementById('modelName');
    const btn = doc.getElementById('refreshModelsBtn');
    if (sel) sel.disabled = !!disabled;
    if (btn) btn.disabled = !!disabled;
  }

  function _renderLoading() {
    const doc = _doc();
    if (!doc) return;
    const sel = doc.getElementById('modelName');
    if (sel) {
      sel.innerHTML = '';
      const opt = doc.createElement('option');
      opt.value = '';
      opt.textContent = 'Discovering models...';
      sel.appendChild(opt);
    }
    _setControlsDisabled(true);
    setDiscoveryStatus({ kind: 'loading', text: 'Discovering models...' });
  }

  function _renderAuthFailed(message) {
    const doc = _doc();
    if (!doc) return;
    const sel = doc.getElementById('modelName');
    if (sel) {
      sel.innerHTML = '';
      const opt = doc.createElement('option');
      opt.value = '';
      opt.textContent = 'API key invalid';
      sel.appendChild(opt);
    }
    _setControlsDisabled(false);
    setDiscoveryStatus({ kind: 'error', text: 'API key invalid for this provider' + (message ? ' (' + message + ')' : '') });
  }

  function _renderFallback(provider, chipText) {
    const fallbackTable = global.FALLBACK_MODELS || {};
    const list = (fallbackTable[provider] || []).map(m => ({
      id: m.id,
      displayName: m.name || m.id,
      description: m.description,
      provider
    }));
    renderModelDropdown(list);
    _setControlsDisabled(false);
    setDiscoveryStatus({ kind: 'warning', text: chipText });
  }

  /**
   * runDiscovery(provider, opts?)
   *  opts.force            -> clear discovery cache before calling discoverModels
   *  opts.previousSelection-> id to retain in the rendered dropdown if present
   *  opts.silentIfNoKey    -> when true and no API key present, render fallback
   *                            silently (no chip). Used on initial page load.
   */
  async function runDiscovery(provider, opts) {
    const options = opts || {};
    if (!IN_SCOPE_PROVIDERS[provider]) {
      // Out-of-scope provider — do nothing; legacy updateModelOptions handles it.
      return { ok: false, reason: 'out-of-scope', provider };
    }
    const priorSnapshot = _activeDiscoveryRun && _activeDiscoveryRun.snapshot;
    const generation = _discoveryGeneration + 1;
    _discoveryGeneration = generation;
    _activeDiscoveryRun = {
      generation,
      snapshot: priorSnapshot || _captureDiscoveryUiState()
    };

    try {
      const apiKey = _getInputValueForProvider(provider);
      if (!apiKey) {
        // No key yet. Phase 232: prefer the persistent discovery cache
        // (chrome.storage.local) so a list discovered in a prior session is
        // shown immediately on reopen. Fall back to FALLBACK_MODELS only when
        // the persistent cache is empty/expired.
        let cachedIds = [];
        if (typeof global.hydrateDiscoveryCache === 'function') {
          try { await global.hydrateDiscoveryCache(); } catch (_) { /* noop */ }
          if (!_isDiscoveryCurrent(generation)) return _cancelledDiscoveryResult(provider);
        }
        if (typeof global.getDiscoveredModelIds === 'function') {
          try { cachedIds = global.getDiscoveredModelIds(provider) || []; } catch (_) { cachedIds = []; }
        }
        if (cachedIds.length) {
          const list = cachedIds.map(id => ({ id, displayName: id }));
          renderModelDropdown(list, options.previousSelection);
          setDiscoveryStatus(options.silentIfNoKey
            ? { kind: 'hidden' }
            : { kind: 'info', text: list.length + ' models (cached)' });
          return { ok: true, models: list, source: 'persistent-cache', provider };
        }
        if (options.silentIfNoKey) {
          const fallbackTable = global.FALLBACK_MODELS || {};
          const list = (fallbackTable[provider] || []).map(m => ({ id: m.id, displayName: m.name || m.id }));
          renderModelDropdown(list, options.previousSelection);
          setDiscoveryStatus({ kind: 'hidden' });
        } else {
          _renderFallback(provider, 'Enter an API key to discover live models');
        }
        return { ok: false, reason: 'missing-api-key', provider };
      }

      if (options.force && typeof global.clearDiscoveryCache === 'function') {
        try { global.clearDiscoveryCache(provider); } catch (_) { /* noop */ }
      }

      if (typeof global.discoverModels !== 'function') {
        _renderFallback(provider, 'Using fallback models — discovery unavailable');
        return { ok: false, reason: 'discovery-unavailable', provider };
      }

      _renderLoading();

      let result;
      try {
        result = await global.discoverModels(provider, apiKey);
      } catch (err) {
        if (!_isDiscoveryCurrent(generation)) return _cancelledDiscoveryResult(provider);
        _renderFallback(provider, 'Using fallback models — discovery unavailable');
        return { ok: false, reason: 'network-failed', provider, message: String(err && err.message || err) };
      }

      if (!_isDiscoveryCurrent(generation)) return _cancelledDiscoveryResult(provider);

      if (result && result.ok) {
        const list = (result.models || []).map(m => ({
          id: m.id,
          displayName: m.displayName || m.name || m.id,
          name: m.name,
          description: m.description,
          provider
        }));
        const chosen = renderModelDropdown(list, options.previousSelection);
        _setControlsDisabled(false);
        const cached = result.source === 'cache';
        const text = cached
          ? list.length + ' models (cached)'
          : list.length + ' models discovered';
        setDiscoveryStatus({ kind: 'info', text });
        // Phase 232: when the user's saved model is not in the discovered list,
        // renderModelDropdown now keeps it selected as a synthetic "(saved)"
        // entry, so chosen === previousSelection and no reassignment happens.
        return result;
      }

      // Failure path
      const reason = result && result.reason;
      if (reason === 'auth-failed') {
        _renderAuthFailed(result && result.message);
        return result;
      }
      if (reason === 'network-failed' || reason === 'timeout' || reason === 'empty-response') {
        _renderFallback(provider, 'Using fallback models — discovery unavailable');
        return result;
      }
      if (reason === 'missing-api-key') {
        _renderFallback(provider, 'Enter an API key to discover live models');
        return result;
      }
      // Unknown failure — best-effort fallback
      _renderFallback(provider, 'Using fallback models — discovery unavailable');
      return result || { ok: false, reason: 'unknown', provider };
    } finally {
      if (_activeDiscoveryRun && _activeDiscoveryRun.generation === generation) {
        _activeDiscoveryRun = null;
      }
    }
  }

  function scheduleDiscoveryFromKeyChange(provider, opts) {
    if (!IN_SCOPE_PROVIDERS[provider]) return;
    const wait = (opts && typeof opts.debounceMs === 'number') ? opts.debounceMs : DEFAULT_DEBOUNCE_MS;
    if (_debounceTimers[provider]) clearTimeout(_debounceTimers[provider]);
    _debounceTimers[provider] = setTimeout(() => {
      _debounceTimers[provider] = null;
      const doc = _doc();
      const activeProvider = doc && doc.getElementById('modelProvider');
      if (providerPanelState.providerKind !== 'api'
          || !activeProvider
          || activeProvider.value !== provider) {
        return;
      }
      runDiscovery(provider, { force: true });
    }, wait);
  }

  const api = {
    IN_SCOPE_PROVIDERS,
    runDiscovery,
    invalidateDiscovery,
    scheduleDiscoveryFromKeyChange,
    setDiscoveryStatus,
    renderModelDropdown,
    applyModelSearch,
    filterModelsForSearch
  };

  global.FSBDiscoveryUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

/**
 * FSBModelCombobox — a searchable, keyboard-navigable dropdown rendered as a
 * view over the native <select id="modelName"> (kept in the DOM but visually
 * hidden as the value source of truth). It unifies the former separate search
 * input + select into one control and highlights the matched search term in
 * the result list.
 *
 * The native select stays canonical: discovery (FSBDiscoveryUI) and the legacy
 * lmstudio/custom flow keep writing <option>s into it. A MutationObserver
 * mirrors those changes into the popup; committing a pick writes back to the
 * select and dispatches a native 'change' event so existing listeners fire.
 */
(function defineFSBModelCombobox(global) {
  'use strict';

  let _root = null;
  let _input = null;
  let _toggle = null;
  let _listbox = null;
  let _select = null;
  let _observer = null;
  let _initialized = false;

  let _open = false;
  let _searching = false;   // true once the user types; gates view-only filtering
  let _activeIndex = -1;    // index into _optionEls
  let _optionEls = [];      // rendered selectable <li> elements

  function _doc() { return (typeof document !== 'undefined') ? document : null; }

  function _normalize(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function _tokenize(query) {
    return _normalize(query).trim().split(/\s+/).filter(Boolean);
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Wrap occurrences of the search tokens in <mark> for a subtle orange accent.
  // Falls back to plain (escaped) text whenever normalization changes the
  // string length, which would misalign match indices against the original.
  function _highlight(text, tokens) {
    const original = String(text || '');
    if (!tokens.length) return _escapeHtml(original);
    const norm = _normalize(original);
    if (norm.length !== original.length) return _escapeHtml(original);

    const ranges = [];
    tokens.forEach((token) => {
      if (!token) return;
      let from = 0;
      let idx;
      while ((idx = norm.indexOf(token, from)) !== -1) {
        ranges.push([idx, idx + token.length]);
        from = idx + token.length;
      }
    });
    if (!ranges.length) return _escapeHtml(original);

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((range) => {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push(range.slice());
    });

    let out = '';
    let cursor = 0;
    merged.forEach((pair) => {
      out += _escapeHtml(original.slice(cursor, pair[0]));
      out += '<mark class="model-combobox__hl">' + _escapeHtml(original.slice(pair[0], pair[1])) + '</mark>';
      cursor = pair[1];
    });
    out += _escapeHtml(original.slice(cursor));
    return out;
  }

  function _selectedOption() {
    if (!_select) return null;
    const idx = _select.selectedIndex;
    return idx >= 0 ? _select.options[idx] : null;
  }

  // Render the popup list from the native select's current options.
  function _render() {
    if (!_select || !_listbox) return;
    const doc = _doc();
    if (!doc) return;
    const tokens = _searching ? _tokenize(_input.value) : [];
    const options = Array.from(_select.options || []);

    _listbox.innerHTML = '';
    _optionEls = [];
    let selectableShown = 0;

    options.forEach((opt) => {
      const value = opt.value;
      const label = opt.textContent || '';
      // Options with an empty value are status rows (loading / auth / empty
      // states), not real choices. Show them only when not actively searching.
      if (value === '') {
        if (_searching) return;
        const status = doc.createElement('li');
        status.className = 'model-combobox__status';
        status.setAttribute('role', 'presentation');
        status.textContent = label;
        _listbox.appendChild(status);
        return;
      }

      if (tokens.length) {
        const haystack = _normalize(label + ' ' + value);
        if (!tokens.every((t) => haystack.indexOf(t) !== -1)) return;
      }

      const li = doc.createElement('li');
      li.className = 'model-combobox__option';
      li.setAttribute('role', 'option');
      li.id = 'modelOption-' + _optionEls.length;
      li.dataset.value = value;
      li.innerHTML = _highlight(label, tokens);
      const isSelected = value === _select.value;
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) li.classList.add('is-selected');
      _listbox.appendChild(li);
      _optionEls.push(li);
      selectableShown += 1;
    });

    if (_searching && selectableShown === 0) {
      const empty = doc.createElement('li');
      empty.className = 'model-combobox__status';
      empty.setAttribute('role', 'presentation');
      empty.textContent = 'No models match';
      _listbox.appendChild(empty);
    }

    _setActive(_defaultActiveIndex());
  }

  function _defaultActiveIndex() {
    const selectedIdx = _optionEls.findIndex((li) => li.dataset.value === _select.value);
    if (selectedIdx !== -1) return selectedIdx;
    return _optionEls.length ? 0 : -1;
  }

  function _setActive(index) {
    _activeIndex = -1;
    _optionEls.forEach((li, i) => {
      const on = i === index;
      li.classList.toggle('is-active', on);
      if (on) {
        _activeIndex = i;
        if (_input) _input.setAttribute('aria-activedescendant', li.id);
      }
    });
    if (_activeIndex === -1 && _input) _input.removeAttribute('aria-activedescendant');
  }

  function _moveActive(delta) {
    if (!_optionEls.length) return;
    let i = _activeIndex === -1 ? _defaultActiveIndex() : _activeIndex;
    i = (i + delta + _optionEls.length) % _optionEls.length;
    _setActive(i);
    _scrollActiveIntoView();
  }

  function _scrollActiveIntoView() {
    if (_activeIndex < 0) return;
    const li = _optionEls[_activeIndex];
    if (li && typeof li.scrollIntoView === 'function') li.scrollIntoView({ block: 'nearest' });
  }

  // Mirror the selected option's label into the input (display mode). Only runs
  // when the popup is closed, so it never clobbers an in-progress search query.
  function _syncDisplay() {
    if (!_input || !_select || _open) return;
    const opt = _selectedOption();
    _input.value = (opt && opt.value !== '') ? (opt.textContent || '') : '';
  }

  function _syncDisabled() {
    if (!_select || !_root) return;
    const disabled = !!_select.disabled;
    if (_input) _input.disabled = disabled;
    if (_toggle) _toggle.disabled = disabled;
    _root.classList.toggle('is-disabled', disabled);
    if (disabled && _open) _close();
  }

  function _openList() {
    if (_open || !_select || _select.disabled) return;
    _open = true;
    _searching = false;
    if (_input) _input.value = ''; // clean search field; selection shown in-list + restored on close
    _root.classList.add('is-open');
    _listbox.hidden = false;
    _input.setAttribute('aria-expanded', 'true');
    _render();
    _scrollActiveIntoView();
  }

  function _close() {
    if (!_open) return;
    _open = false;
    _searching = false;
    _root.classList.remove('is-open');
    _listbox.hidden = true;
    _input.setAttribute('aria-expanded', 'false');
    _input.removeAttribute('aria-activedescendant');
    _syncDisplay();
  }

  function _commit(value) {
    if (value == null) return;
    if (_select.value !== value) {
      _select.value = value;
      _select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    _close();
  }

  function _onKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!_open) _openList();
        else _moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!_open) _openList();
        else _moveActive(-1);
        break;
      case 'Enter':
        if (_open && _activeIndex >= 0 && _optionEls[_activeIndex]) {
          e.preventDefault();
          _commit(_optionEls[_activeIndex].dataset.value);
        }
        break;
      case 'Escape':
        if (_open) {
          e.preventDefault();
          _close();
        }
        break;
      case 'Home':
        if (_open && _optionEls.length) {
          e.preventDefault();
          _setActive(0);
          _scrollActiveIntoView();
        }
        break;
      case 'End':
        if (_open && _optionEls.length) {
          e.preventDefault();
          _setActive(_optionEls.length - 1);
          _scrollActiveIntoView();
        }
        break;
      case 'Tab':
        if (_open) _close();
        break;
      default:
        break;
    }
  }

  function _onMutation() {
    _syncDisabled();
    if (_open) _render();
    else _syncDisplay();
  }

  function init() {
    if (_initialized) return;
    const doc = _doc();
    if (!doc) return;
    _root = doc.getElementById('modelCombobox');
    _input = doc.getElementById('modelSearch');
    _toggle = doc.getElementById('modelComboboxToggle');
    _listbox = doc.getElementById('modelListbox');
    _select = doc.getElementById('modelName');
    if (!_root || !_input || !_listbox || !_select) return;
    _initialized = true;

    _input.addEventListener('focus', () => {
      if (_select.disabled) return;
      _openList();
    });
    _input.addEventListener('click', () => {
      if (_select.disabled) return;
      if (!_open) _openList();
    });
    _input.addEventListener('input', () => {
      _searching = true;
      if (!_open) _openList();
      else _render();
    });
    _input.addEventListener('keydown', _onKeydown);
    _input.addEventListener('blur', () => { _close(); });

    // Keep focus on the input while interacting with the popup / chevron so the
    // blur-to-close handler doesn't fire before a click can commit a choice.
    _listbox.addEventListener('mousedown', (e) => { e.preventDefault(); });
    _listbox.addEventListener('click', (e) => {
      const li = e.target.closest ? e.target.closest('.model-combobox__option') : null;
      if (!li || !_listbox.contains(li)) return;
      _commit(li.dataset.value);
    });

    if (_toggle) {
      _toggle.addEventListener('mousedown', (e) => { e.preventDefault(); });
      _toggle.addEventListener('click', () => {
        if (_select.disabled) return;
        if (_open) {
          _close();
        } else {
          _input.focus();
          _openList();
        }
      });
    }

    _select.addEventListener('change', () => { if (!_searching) _syncDisplay(); });

    if (typeof MutationObserver === 'function') {
      _observer = new MutationObserver(_onMutation);
      _observer.observe(_select, { childList: true, attributes: true, attributeFilter: ['disabled'] });
    }

    _syncDisabled();
    _syncDisplay();
  }

  // Re-sync the visible state after the select's value is set programmatically
  // (e.g. loadSettings), which fires neither 'change' nor a DOM mutation.
  function refresh() {
    if (!_initialized) return;
    _syncDisabled();
    if (_open) _render();
    else _syncDisplay();
  }

  global.FSBModelCombobox = { init, refresh };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));


// Export for potential use by other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dashboardState,
    switchSection,
    addLog,
    showToast,
    loadSessionList,
    viewSession,
    deleteSession,
    FSBDiscoveryUI: globalThis.FSBDiscoveryUI
  };
}
