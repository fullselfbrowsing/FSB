// Initialize configuration with environment variables
// This script helps set up the extension with pre-configured values

const defaultConfig = {
  // Model configuration
  modelProvider: 'xai',
  modelName: 'grok-4-1-fast',

  // API keys
  apiKey: '', // Will be set from environment or user input
  geminiApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  openrouterApiKey: '',
  customApiKey: '',
  customEndpoint: '',
  lmstudioBaseUrl: 'http://localhost:1234',

  // Legacy support
  speedMode: 'normal',

  // Automation Settings
  maxIterations: 100,
  debugMode: false,

  // DOM Optimization Settings
  domOptimization: true,
  maxDOMElements: 2000,
  elementCacheSize: 200,
  prioritizeViewport: true,
  animatedActionHighlights: true,
  showSidepanelProgress: false,

  // Credential Manager (Beta)
  enableLogin: false,
  enableSavedPayments: false,

  // CAPTCHA Solver
  captchaSolverEnabled: false,
  captchaApiKey: '',

  // Speech-to-Text provider ('browser' | 'whisper'); read by ui/speech-to-text.js
  sttProvider: 'browser',

  // Background Agents Server
  serverUrl: 'https://fsb-server.fly.dev',
  serverHashKey: '',
  serverSyncEnabled: false
};

// Function to initialize with test/development keys
async function initializeDevConfig() {
  // In development, you can hardcode test API keys here
  // NEVER commit real API keys to the repository
  const devConfig = {
    ...defaultConfig,
    modelProvider: 'xai',
    modelName: 'grok-4-1-fast',
    // Example: apiKey: 'test-key-for-development',
    debugMode: true
  };
  
  // Save to Chrome storage
  await chrome.storage.local.set(devConfig);
  console.log('Development configuration initialized');
}

// Function to initialize from external config file
async function initializeFromFile(configUrl) {
  try {
    const response = await fetch(configUrl);
    const config = await response.json();
    
    // Merge with defaults
    const finalConfig = { ...defaultConfig, ...config };
    
    // Save to Chrome storage
    await chrome.storage.local.set(finalConfig);
    console.log('Configuration loaded from file');
    
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Check if running in development
function isDevelopment() {
  return !chrome.runtime.getManifest().update_url;
}

async function openOnboardingPage() {
  const onboardingUrl = chrome.runtime.getURL('ui/onboarding.html');
  try {
    await chrome.storage.local.set({ fsbOnboardingAutoOpenedAt: new Date().toISOString() });
  } catch (error) {
    console.warn('Failed to record onboarding open timestamp:', error && error.message);
  }

  if (chrome.tabs && typeof chrome.tabs.create === 'function') {
    await chrome.tabs.create({ url: onboardingUrl, active: true });
    return;
  }

  if (chrome.windows && typeof chrome.windows.create === 'function') {
    await chrome.windows.create({ url: onboardingUrl, type: 'popup', width: 760, height: 860 });
  }
}

// Auto-initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Check if config already exists
    const existing = await chrome.storage.local.get('modelProvider');
    
    if (!existing.modelProvider) {
      // First time installation
      if (isDevelopment()) {
        // Initialize with dev config
        await initializeDevConfig();
      } else {
        // Initialize with defaults
        await chrome.storage.local.set(defaultConfig);
      }
    }

    await openOnboardingPage();
  }
});

// Export functions for use in other scripts
if (typeof window !== 'undefined') {
  window.initConfig = {
    initializeDevConfig,
    initializeFromFile,
    defaultConfig,
    openOnboardingPage
  };
}
