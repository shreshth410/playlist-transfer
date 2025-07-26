// Playlist Transfer Chrome Extension - Background Service Worker
// Handles API calls, authentication, and cross-platform playlist transfers
importScripts('config.js');

// Extension state management
let transferState = {
  isTransferring: false,
  currentTransfer: null,
  progress: 0,
  errors: []
};

// Platform configurations
const PLATFORMS = {
  spotify: {
    name: 'Spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    apiBase: 'https://api.spotify.com/v1',
    scopes: 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private'
  },
  apple: {
    name: 'Apple Music',
    authUrl: 'https://authorize.music.apple.com',
    apiBase: 'https://api.music.apple.com/v1',
    scopes: 'library-read library-modify'
  },
  youtube: {
    name: 'YouTube Music',
    authUrl: 'https://accounts.google.com/oauth2/auth',
    apiBase: 'https://www.googleapis.com/youtube/v3',
    scopes: 'https://www.googleapis.com/auth/youtube'
  },
  amazon: {
    name: 'Amazon Music',
    authUrl: 'https://www.amazon.com/ap/oa',
    apiBase: 'https://api.amazonalexa.com',
    scopes: 'alexa:music:read alexa:music:write'
  }
};

// Installation and startup
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Playlist Transfer Extension installed:', details.reason);
  
  // Initialize storage with API keys from config
  initializeApiKeys();
  
  chrome.storage.local.set({
    authTokens: {},
    transferHistory: [],
    settings: {
      conflictResolution: 'skip', // 'skip', 'replace', 'ask'
      batchSize: 50,
      retryAttempts: 3
    }
  });
});

// Initialize API keys from config.js
async function initializeApiKeys() {
  try {
    // Check if API_KEYS is available from config.js
    if (typeof API_KEYS !== 'undefined') {
      console.log('Loading API keys from config.js');
      await chrome.storage.local.set({ apiKeys: API_KEYS });
      console.log('API keys loaded successfully');
    } else {
      console.warn('API_KEYS not found in config.js. Please ensure config.js is properly configured.');
      // Initialize with empty object if config is missing
      await chrome.storage.local.set({ apiKeys: {} });
    }
  } catch (error) {
    console.error('Error loading API keys from config:', error);
    // Initialize with empty object on error
    await chrome.storage.local.set({ apiKeys: {} });
  }
}

// Message handling from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  switch (message.action) {
    case 'getAuthStatus':
      handleGetAuthStatus(sendResponse);
      break;
    
    case 'authenticate':
      handleAuthentication(message.platform, sendResponse);
      break;
    
    case 'getPlaylists':
      handleGetPlaylists(message.platform, sendResponse);
      break;
    
    case 'startTransfer':
      handleStartTransfer(message.transferData, sendResponse);
      break;
    
    case 'getTransferStatus':
      sendResponse(transferState);
      break;
    
    case 'cancelTransfer':
      handleCancelTransfer(sendResponse);
      break;
    
    case 'saveApiKeys':
      handleSaveApiKeys(message.apiKeys, sendResponse);
      break;
    
    case 'getSettings':
      handleGetSettings(sendResponse);
      break;
    
    case 'updateSettings':
      handleUpdateSettings(message.settings, sendResponse);
      break;
    
    default:
      console.warn('Unknown message action:', message.action);
      sendResponse({ error: 'Unknown action' });
  }
  
  return true; // Keep message channel open for async responses
});

// Authentication status check
async function handleGetAuthStatus(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['authTokens']);
    const authTokens = result.authTokens || {};
    
    const status = {};
    for (const platform of Object.keys(PLATFORMS)) {
      status[platform] = {
        authenticated: !!authTokens[platform],
        expires: authTokens[platform]?.expires || null
      };
    }
    
    sendResponse({ success: true, status });
  } catch (error) {
    console.error('Error getting auth status:', error);
    sendResponse({ error: error.message });
  }
}

// Platform authentication
async function handleAuthentication(platform, sendResponse) {
  try {
    if (!PLATFORMS[platform]) {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    
    const result = await chrome.storage.local.get(['apiKeys']);
    const apiKeys = result.apiKeys || {};
    
    if (!apiKeys[platform]) {
      throw new Error(`API key not configured for ${platform}`);
    }
    
    // Build OAuth URL
    const authUrl = buildAuthUrl(platform, apiKeys[platform]);
    console.log(`Starting auth flow for ${platform} with URL: ${authUrl}`);
    
    // Use chrome.identity.launchWebAuthFlow with proper error handling
    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, async (redirectUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Chrome identity error:', chrome.runtime.lastError);
        sendResponse({ error: `Authentication failed: ${chrome.runtime.lastError.message}` });
        return;
      }
      
      if (!redirectUrl) {
        console.error('No redirect URL received');
        sendResponse({ error: 'Authentication was cancelled or failed' });
        return;
      }
      
      try {
        const token = extractTokenFromUrl(redirectUrl, platform);
        await saveAuthToken(platform, token);
        sendResponse({ success: true, platform });
      } catch (error) {
        console.error('Token extraction error:', error);
        sendResponse({ error: `Failed to process authentication: ${error.message}` });
      }
    });
    
  } catch (error) {
    console.error('Authentication error:', error);
    sendResponse({ error: error.message });
  }
}



// Get playlists from platform
async function handleGetPlaylists(platform, sendResponse) {
  try {
    const token = await getAuthToken(platform);
    if (!token) {
      throw new Error(`Not authenticated with ${platform}`);
    }
    
    const playlists = await fetchPlaylists(platform, token);
    sendResponse({ success: true, playlists });
    
  } catch (error) {
    console.error('Error fetching playlists:', error);
    sendResponse({ error: error.message });
  }
}

// Start playlist transfer
async function handleStartTransfer(transferData, sendResponse) {
  try {
    if (transferState.isTransferring) {
      throw new Error('Transfer already in progress');
    }
    
    transferState.isTransferring = true;
    transferState.currentTransfer = transferData;
    transferState.progress = 0;
    transferState.errors = [];
    
    sendResponse({ success: true, message: 'Transfer started' });
    
    // Start transfer in background
    performTransfer(transferData);
    
  } catch (error) {
    console.error('Error starting transfer:', error);
    transferState.isTransferring = false;
    sendResponse({ error: error.message });
  }
}

// Cancel ongoing transfer
async function handleCancelTransfer(sendResponse) {
  transferState.isTransferring = false;
  transferState.currentTransfer = null;
  transferState.progress = 0;
  sendResponse({ success: true, message: 'Transfer cancelled' });
}

// Save API keys
async function handleSaveApiKeys(apiKeys, sendResponse) {
  try {
    await chrome.storage.local.set({ apiKeys });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error saving API keys:', error);
    sendResponse({ error: error.message });
  }
}

// Get settings
async function handleGetSettings(sendResponse) {
  try {
    const result = await chrome.storage.local.get(['settings']);
    sendResponse({ success: true, settings: result.settings });
  } catch (error) {
    console.error('Error getting settings:', error);
    sendResponse({ error: error.message });
  }
}

// Update settings
async function handleUpdateSettings(settings, sendResponse) {
  try {
    await chrome.storage.local.set({ settings });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    sendResponse({ error: error.message });
  }
}

// Build OAuth URL for platform
function buildAuthUrl(platform, apiKey) {
  const config = PLATFORMS[platform];
  const redirectUri = chrome.identity.getRedirectURL();
  
  console.log(`Building auth URL for ${platform}, redirect URI: ${redirectUri}`);
  
  const params = new URLSearchParams({
    client_id: apiKey.clientId,
    response_type: 'code',
    scope: config.scopes,
    redirect_uri: redirectUri
  });
  
  const authUrl = `${config.authUrl}?${params.toString()}`;
  console.log(`Auth URL: ${authUrl}`);
  
  return authUrl;
}

// Extract token from OAuth redirect URL
function extractTokenFromUrl(url, platform) {
  const urlObj = new URL(url);
  
  if (platform === 'spotify' || platform === 'youtube') {
    const code = urlObj.searchParams.get('code');
    if (!code) throw new Error('No authorization code received');
    return { code, type: 'authorization_code' };
  }
  
  // For other platforms, extract access token directly
  const token = urlObj.searchParams.get('access_token') || 
                urlObj.hash.match(/access_token=([^&]*)/)?.[1];
  
  if (!token) throw new Error('No access token received');
  
  return {
    access_token: token,
    expires_in: urlObj.searchParams.get('expires_in') || 3600,
    type: 'bearer'
  };
}

// Save authentication token
async function saveAuthToken(platform, tokenData) {
  const result = await chrome.storage.local.get(['authTokens']);
  const authTokens = result.authTokens || {};
  
  authTokens[platform] = {
    ...tokenData,
    expires: Date.now() + (tokenData.expires_in * 1000),
    platform
  };
  
  await chrome.storage.local.set({ authTokens });
}

// Get authentication token
async function getAuthToken(platform) {
  const result = await chrome.storage.local.get(['authTokens']);
  const authTokens = result.authTokens || {};
  
  const token = authTokens[platform];
  if (!token) return null;
  
  // Check if token is expired
  if (token.expires && Date.now() > token.expires) {
    console.log(`Token expired for ${platform}`);
    return null;
  }
  
  return token;
}

// Fetch playlists from platform
async function fetchPlaylists(platform, token) {
  const config = PLATFORMS[platform];
  
  switch (platform) {
    case 'spotify':
      return fetchSpotifyPlaylists(token);
    case 'apple':
      return fetchApplePlaylists(token);
    case 'youtube':
      return fetchYouTubePlaylists(token);
    case 'amazon':
      return fetchAmazonPlaylists(token);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Spotify API calls
async function fetchSpotifyPlaylists(token) {
  const response = await fetch('https://api.spotify.com/v1/me/playlists', {
    headers: {
      'Authorization': `Bearer ${token.access_token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.items.map(playlist => ({
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    trackCount: playlist.tracks.total,
    platform: 'spotify',
    url: playlist.external_urls.spotify
  }));
}

// Apple Music API calls
async function fetchApplePlaylists(token) {
  const response = await fetch('https://api.music.apple.com/v1/me/library/playlists', {
    headers: {
      'Authorization': `Bearer ${token.access_token}`,
      'Music-User-Token': token.userToken
    }
  });
  
  if (!response.ok) {
    throw new Error(`Apple Music API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data.map(playlist => ({
    id: playlist.id,
    name: playlist.attributes.name,
    description: playlist.attributes.description?.standard || '',
    trackCount: playlist.attributes.trackCount || 0,
    platform: 'apple',
    url: playlist.attributes.url
  }));
}

// YouTube Music API calls
async function fetchYouTubePlaylists(token) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true', {
    headers: {
      'Authorization': `Bearer ${token.access_token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.items.map(playlist => ({
    id: playlist.id,
    name: playlist.snippet.title,
    description: playlist.snippet.description,
    trackCount: playlist.contentDetails.itemCount,
    platform: 'youtube',
    url: `https://music.youtube.com/playlist?list=${playlist.id}`
  }));
}

// Amazon Music API calls
async function fetchAmazonPlaylists(token) {
  // Note: Amazon Music API implementation would depend on their specific endpoints
  // This is a placeholder implementation
  throw new Error('Amazon Music API integration not yet implemented');
}

// Main transfer function
async function performTransfer(transferData) {
  try {
    const { sourcePlaylist, sourcePlatform, targetPlatform, options } = transferData;
    
    // Get source tracks
    updateProgress(10, 'Fetching source playlist tracks...');
    const sourceTracks = await getPlaylistTracks(sourcePlatform, sourcePlaylist.id);
    
    // Search for tracks on target platform
    updateProgress(30, 'Searching for tracks on target platform...');
    const matchedTracks = await searchTracksOnPlatform(targetPlatform, sourceTracks);
    
    // Create target playlist
    updateProgress(60, 'Creating target playlist...');
    const targetPlaylist = await createPlaylist(targetPlatform, {
      name: sourcePlaylist.name,
      description: sourcePlaylist.description
    });
    
    // Add tracks to target playlist
    updateProgress(80, 'Adding tracks to target playlist...');
    await addTracksToPlaylist(targetPlatform, targetPlaylist.id, matchedTracks);
    
    // Save transfer history
    await saveTransferHistory({
      sourcePlaylist,
      sourcePlatform,
      targetPlatform,
      targetPlaylist,
      transferredTracks: matchedTracks.filter(t => t.found).length,
      totalTracks: sourceTracks.length,
      timestamp: Date.now()
    });
    
    updateProgress(100, 'Transfer completed successfully!');
    
  } catch (error) {
    console.error('Transfer error:', error);
    transferState.errors.push(error.message);
    updateProgress(transferState.progress, `Transfer failed: ${error.message}`);
  } finally {
    transferState.isTransferring = false;
  }
}

// Update transfer progress
function updateProgress(progress, message) {
  transferState.progress = progress;
  transferState.message = message;
  
  // Notify popup if open
  chrome.runtime.sendMessage({
    action: 'transferProgress',
    progress,
    message
  }).catch(() => {
    // Popup might not be open, ignore error
  });
}

// Get tracks from playlist
async function getPlaylistTracks(platform, playlistId) {
  const token = await getAuthToken(platform);
  
  switch (platform) {
    case 'spotify':
      return getSpotifyPlaylistTracks(token, playlistId);
    case 'apple':
      return getApplePlaylistTracks(token, playlistId);
    case 'youtube':
      return getYouTubePlaylistTracks(token, playlistId);
    default:
      throw new Error(`Platform ${platform} not supported for track fetching`);
  }
}

// Search for tracks on target platform
async function searchTracksOnPlatform(platform, tracks) {
  const token = await getAuthToken(platform);
  const results = [];
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    try {
      const searchResult = await searchTrack(platform, token, track);
      results.push({
        original: track,
        found: !!searchResult,
        match: searchResult
      });
    } catch (error) {
      console.error(`Error searching for track ${track.name}:`, error);
      results.push({
        original: track,
        found: false,
        error: error.message
      });
    }
    
    // Update progress
    updateProgress(30 + (i / tracks.length) * 30, `Searching: ${track.name}`);
  }
  
  return results;
}

// Create playlist on platform
async function createPlaylist(platform, playlistData) {
  const token = await getAuthToken(platform);
  
  switch (platform) {
    case 'spotify':
      return createSpotifyPlaylist(token, playlistData);
    case 'apple':
      return createApplePlaylist(token, playlistData);
    case 'youtube':
      return createYouTubePlaylist(token, playlistData);
    default:
      throw new Error(`Platform ${platform} not supported for playlist creation`);
  }
}

// Add tracks to playlist
async function addTracksToPlaylist(platform, playlistId, tracks) {
  const token = await getAuthToken(platform);
  const validTracks = tracks.filter(t => t.found && t.match);
  
  switch (platform) {
    case 'spotify':
      return addTracksToSpotifyPlaylist(token, playlistId, validTracks);
    case 'apple':
      return addTracksToApplePlaylist(token, playlistId, validTracks);
    case 'youtube':
      return addTracksToYouTubePlaylist(token, playlistId, validTracks);
    default:
      throw new Error(`Platform ${platform} not supported for adding tracks`);
  }
}

// Save transfer history
async function saveTransferHistory(transferRecord) {
  const result = await chrome.storage.local.get(['transferHistory']);
  const history = result.transferHistory || [];
  
  history.unshift(transferRecord);
  
  // Keep only last 50 transfers
  if (history.length > 50) {
    history.splice(50);
  }
  
  await chrome.storage.local.set({ transferHistory: history });
}

// Platform-specific implementations would continue here...
// (Spotify, Apple Music, YouTube Music specific functions)

// Error handling and retry logic
async function retryOperation(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      console.log(`Attempt ${attempt} failed, retrying...`, error);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Rate limiting helper
class RateLimiter {
  constructor(requestsPerSecond = 10) {
    this.requestsPerSecond = requestsPerSecond;
    this.requests = [];
  }
  
  async waitForSlot() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < 1000);
    
    if (this.requests.length >= this.requestsPerSecond) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = 1000 - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requests.push(now);
  }
}

const rateLimiter = new RateLimiter(10);

console.log('Playlist Transfer Extension background script loaded');
