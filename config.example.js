// API Configuration for Playlist Transfer Extension
// Copy this file to config.js and fill in your API credentials

const API_KEYS = {
  spotify: {
    clientId: 'YOUR_SPOTIFY_CLIENT_ID',
    clientSecret: 'YOUR_SPOTIFY_CLIENT_SECRET'
  },
  youtube: {
    clientId: 'YOUR_GOOGLE_CLIENT_ID', // Same as in manifest.json oauth2.client_id
    clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
    apiKey: 'YOUR_YOUTUBE_API_KEY'
  },
  apple: {
    teamId: 'YOUR_APPLE_TEAM_ID',
    keyId: 'YOUR_APPLE_KEY_ID',
    privateKey: 'YOUR_APPLE_PRIVATE_KEY'
  },
  amazon: {
    clientId: 'YOUR_AMAZON_CLIENT_ID',
    clientSecret: 'YOUR_AMAZON_CLIENT_SECRET'
  }
};

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_KEYS };
}
