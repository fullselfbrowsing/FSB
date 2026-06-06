// Initialize configuration with environment variables
// This script helps set up the extension with pre-configured values

const defaultConfig = {
  // AI Provider Configuration
  aiProvider: 'xai',
  apiKey: '', // Will be set from environment or user input

  // Alternative providers
  openaiApiKey: '',
  customApiEndpoint: '',

  // Automation Settings
  maxIterations: 100,
  debugMode: false,

  // DOM Optimization Settings
  domOptimization: true,
  maxDOMElements: 2000,
  prioritizeViewport: true,
  animatedActionHighlights: true
};

// Function to initialize with test/development keys
async function initializeDevConfig() {
  // In development, you can hardcode test API keys here
  // NEVER commit real API keys to the repository
  const devConfig = {
    ...defaultConfig,
    aiProvider: 'xai',
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

// Auto-initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Check if config already exists
    const existing = await chrome.storage.local.get('aiProvider');
    
    if (!existing.aiProvider) {
      // First time installation
      if (isDevelopment()) {
        // Initialize with dev config
        await initializeDevConfig();
      } else {
        // Initialize with defaults
        await chrome.storage.local.set(defaultConfig);
      }
      
      // Open options page for user to configure
      chrome.runtime.openOptionsPage();
    }
  }
});

// Export functions for use in other scripts
if (typeof window !== 'undefined') {
  window.initConfig = {
    initializeDevConfig,
    initializeFromFile,
    defaultConfig
  };
}