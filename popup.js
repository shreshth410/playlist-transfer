// Playlist Transfer Extension - Popup Script
// Handles the popup interface, authentication, transfers, and settings

(function() {
    'use strict';
    
    // DOM Elements
    const elements = {
        // Authentication
        authPlatforms: document.querySelectorAll('.platform-auth'),
        authButtons: {
            spotify: document.getElementById('spotify-auth'),
            apple: document.getElementById('apple-auth'),
            youtube: document.getElementById('youtube-auth'),
            amazon: document.getElementById('amazon-auth')
        },
        statusIndicators: {
            spotify: document.getElementById('spotify-status'),
            apple: document.getElementById('apple-status'),
            youtube: document.getElementById('youtube-status'),
            amazon: document.getElementById('amazon-status')
        },
        
        // Transfer
        sourcePlatform: document.getElementById('sourcePlatform'),
        targetPlatform: document.getElementById('targetPlatform'),
        startTransferBtn: document.getElementById('startTransferBtn'),
        
        // Progress
        progressSection: document.getElementById('progressSection'),
        progressFill: document.getElementById('progressFill'),
        progressPercent: document.getElementById('progressPercent'),
        progressMessage: document.getElementById('progressMessage'),
        cancelTransferBtn: document.getElementById('cancelTransferBtn'),
        
        // History
        transferHistory: document.getElementById('transferHistory'),
        
        // Settings
        settingsBtn: document.getElementById('settingsBtn'),
        settingsModal: document.getElementById('settingsModal'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
        resetSettingsBtn: document.getElementById('resetSettingsBtn'),
        
        // API Status
        configStatus: document.getElementById('configStatus'),
        platformsAvailable: document.getElementById('platformsAvailable'),
        
        // Settings
        conflictResolution: document.getElementById('conflictResolution'),
        batchSize: document.getElementById('batchSize'),
        retryAttempts: document.getElementById('retryAttempts'),
        
        // Loading
        loadingOverlay: document.getElementById('loadingOverlay')
    };
    
    // State
    let authStatus = {};
    let currentTransfer = null;
    let transferHistory = [];
    let settings = {};
    
    // Initialize popup
    function init() {
        console.log('Popup initialized');
        
        // Load initial data
        loadAuthStatus();
        loadApiConfigStatus();
        loadSettings();
        loadTransferHistory();
        
        // Set up event listeners
        setupEventListeners();
        
        // Check for ongoing transfer
        checkTransferStatus();
        
        // Update UI every 2 seconds if transfer is active
        setInterval(updateTransferProgress, 2000);
    }
    
    // Set up all event listeners
    function setupEventListeners() {
        // Authentication buttons
        Object.keys(elements.authButtons).forEach(platform => {
            elements.authButtons[platform].addEventListener('click', () => {
                handleAuthentication(platform);
            });
        });
        
        // Transfer form
        elements.sourcePlatform.addEventListener('change', updateTransferButton);
        elements.targetPlatform.addEventListener('change', updateTransferButton);
        elements.startTransferBtn.addEventListener('click', handleStartTransfer);
        elements.cancelTransferBtn.addEventListener('click', handleCancelTransfer);
        
        // Settings
        elements.settingsBtn.addEventListener('click', openSettings);
        elements.closeSettingsBtn.addEventListener('click', closeSettings);
        elements.saveSettingsBtn.addEventListener('click', saveSettings);
        elements.resetSettingsBtn.addEventListener('click', resetSettings);
        
        // Modal overlay click to close
        elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === elements.settingsModal) {
                closeSettings();
            }
        });
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener(handleBackgroundMessage);
    }
    
    // Load authentication status
    async function loadAuthStatus() {
        try {
            showLoading(true);
            
            const response = await sendMessage({ action: 'getAuthStatus' });
            if (response.success) {
                authStatus = response.status;
                updateAuthUI();
            }
        } catch (error) {
            console.error('Error loading auth status:', error);
            showNotification('Failed to load authentication status', 'error');
        } finally {
            showLoading(false);
        }
    }
    
    // Update authentication UI
    function updateAuthUI() {
        Object.keys(authStatus).forEach(platform => {
            const status = authStatus[platform];
            const indicator = elements.statusIndicators[platform];
            const button = elements.authButtons[platform];
            
            if (status.authenticated) {
                indicator.className = 'status-indicator connected';
                indicator.title = 'Connected';
                button.textContent = 'Connected';
                button.className = 'auth-btn connected';
                button.disabled = false;
            } else {
                indicator.className = 'status-indicator disconnected';
                indicator.title = 'Not connected';
                button.textContent = 'Connect';
                button.className = 'auth-btn';
                button.disabled = false;
            }
        });
        
        updatePlatformSelects();
    }
    
    // Update platform select options
    function updatePlatformSelects() {
        const connectedPlatforms = Object.keys(authStatus).filter(
            platform => authStatus[platform].authenticated
        );
        
        // Update source platform options
        updateSelectOptions(elements.sourcePlatform, connectedPlatforms);
        updateSelectOptions(elements.targetPlatform, connectedPlatforms);
        
        updateTransferButton();
    }
    
    // Update select element options
    function updateSelectOptions(selectElement, availablePlatforms) {
        const currentValue = selectElement.value;
        
        // Clear existing options except the first one
        while (selectElement.children.length > 1) {
            selectElement.removeChild(selectElement.lastChild);
        }
        
        // Add available platforms
        availablePlatforms.forEach(platform => {
            const option = document.createElement('option');
            option.value = platform;
            option.textContent = getPlatformDisplayName(platform);
            selectElement.appendChild(option);
        });
        
        // Restore selection if still valid
        if (availablePlatforms.includes(currentValue)) {
            selectElement.value = currentValue;
        }
    }
    
    // Get display name for platform
    function getPlatformDisplayName(platform) {
        const names = {
            spotify: 'Spotify',
            apple: 'Apple Music',
            youtube: 'YouTube Music',
            amazon: 'Amazon Music'
        };
        return names[platform] || platform;
    }
    
    // Handle authentication
    async function handleAuthentication(platform) {
        const button = elements.authButtons[platform];
        const originalText = button.textContent;
        
        try {
            // Prevent multiple simultaneous auth attempts
            if (button.disabled) {
                return;
            }
            
            button.textContent = 'Connecting...';
            button.disabled = true;
            
            // Add timeout to prevent infinite waiting
            const authPromise = sendMessage({ 
                action: 'authenticate', 
                platform 
            });
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Authentication timeout')), 60000); // 60 second timeout
            });
            
            const response = await Promise.race([authPromise, timeoutPromise]);
            
            if (response && response.success) {
                showNotification(`Successfully connected to ${getPlatformDisplayName(platform)}`, 'success');
                await loadAuthStatus(); // Refresh auth status
            } else {
                throw new Error(response?.error || 'Authentication failed');
            }
            
        } catch (error) {
            console.error('Authentication error:', error);
            showNotification(`Failed to connect to ${getPlatformDisplayName(platform)}: ${error.message}`, 'error');
        } finally {
            // Always reset button state
            button.textContent = 'Connect';
            button.disabled = false;
        }
    }
    
    // Update transfer button state
    function updateTransferButton() {
        const source = elements.sourcePlatform.value;
        const target = elements.targetPlatform.value;
        
        const canTransfer = source && target && source !== target && 
                           authStatus[source]?.authenticated && 
                           authStatus[target]?.authenticated;
        
        elements.startTransferBtn.disabled = !canTransfer;
    }
    
    // Handle start transfer
    async function handleStartTransfer() {
        try {
            const source = elements.sourcePlatform.value;
            const target = elements.targetPlatform.value;
            
            if (!source || !target || source === target) {
                showNotification('Please select different source and target platforms', 'error');
                return;
            }
            
            // Get current tab to check for playlist
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            
            if (!currentTab) {
                showNotification('Unable to access current tab', 'error');
                return;
            }
            
            // Check if current page has playlist data
            const playlistResponse = await chrome.tabs.sendMessage(currentTab.id, {
                action: 'getPlaylistData'
            });
            
            if (!playlistResponse || !playlistResponse.success || !playlistResponse.playlist) {
                showNotification('No playlist detected on current page. Please navigate to a playlist page.', 'error');
                return;
            }
            
            const playlist = playlistResponse.playlist;
            
            // Start transfer
            const transferData = {
                sourcePlaylist: playlist,
                sourcePlatform: source,
                targetPlatform: target,
                options: {
                    conflictResolution: settings.conflictResolution || 'skip',
                    batchSize: settings.batchSize || 50
                }
            };
            
            const response = await sendMessage({
                action: 'startTransfer',
                transferData
            });
            
            if (response.success) {
                showTransferProgress(true);
                showNotification('Transfer started successfully', 'success');
            } else {
                throw new Error(response.error || 'Failed to start transfer');
            }
            
        } catch (error) {
            console.error('Transfer start error:', error);
            showNotification(`Failed to start transfer: ${error.message}`, 'error');
        }
    }
    
    // Handle cancel transfer
    async function handleCancelTransfer() {
        try {
            const response = await sendMessage({ action: 'cancelTransfer' });
            
            if (response.success) {
                showTransferProgress(false);
                showNotification('Transfer cancelled', 'info');
            }
        } catch (error) {
            console.error('Cancel transfer error:', error);
            showNotification('Failed to cancel transfer', 'error');
        }
    }
    
    // Show/hide transfer progress
    function showTransferProgress(show) {
        elements.progressSection.style.display = show ? 'block' : 'none';
        
        if (!show) {
            elements.progressFill.style.width = '0%';
            elements.progressPercent.textContent = '0%';
            elements.progressMessage.textContent = 'Ready to start';
        }
    }
    
    // Update transfer progress
    async function updateTransferProgress() {
        try {
            const response = await sendMessage({ action: 'getTransferStatus' });
            
            if (response.isTransferring) {
                showTransferProgress(true);
                
                elements.progressFill.style.width = `${response.progress}%`;
                elements.progressPercent.textContent = `${Math.round(response.progress)}%`;
                elements.progressMessage.textContent = response.message || 'Processing...';
                
                if (response.progress >= 100) {
                    setTimeout(() => {
                        showTransferProgress(false);
                        loadTransferHistory(); // Refresh history
                    }, 2000);
                }
            } else if (elements.progressSection.style.display !== 'none') {
                showTransferProgress(false);
            }
        } catch (error) {
            // Silently handle errors during progress updates
            console.log('Progress update error:', error);
        }
    }
    
    // Check transfer status on popup open
    async function checkTransferStatus() {
        try {
            const response = await sendMessage({ action: 'getTransferStatus' });
            
            if (response.isTransferring) {
                showTransferProgress(true);
            }
        } catch (error) {
            console.log('Transfer status check error:', error);
        }
    }
    
    // Load transfer history
    async function loadTransferHistory() {
        try {
            const result = await chrome.storage.local.get(['transferHistory']);
            transferHistory = result.transferHistory || [];
            
            updateHistoryUI();
        } catch (error) {
            console.error('Error loading transfer history:', error);
        }
    }
    
    // Update history UI
    function updateHistoryUI() {
        const container = elements.transferHistory;
        
        if (transferHistory.length === 0) {
            container.innerHTML = '<div class="no-history">No recent transfers</div>';
            return;
        }
        
        container.innerHTML = '';
        
        transferHistory.slice(0, 5).forEach(transfer => {
            const item = document.createElement('div');
            item.className = 'history-item';
            
            const date = new Date(transfer.timestamp).toLocaleDateString();
            const time = new Date(transfer.timestamp).toLocaleTimeString();
            
            item.innerHTML = `
                <div class="history-header">
                    <span class="history-title">${transfer.sourcePlaylist.name}</span>
                    <span class="history-date">${date}</span>
                </div>
                <div class="history-details">
                    <span class="history-platforms">
                        ${getPlatformDisplayName(transfer.sourcePlatform)} → ${getPlatformDisplayName(transfer.targetPlatform)}
                    </span>
                    <span class="history-stats">
                        ${transfer.transferredTracks}/${transfer.totalTracks} tracks
                    </span>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
    
    // Settings functions
    function openSettings() {
        elements.settingsModal.style.display = 'flex';
        loadSettingsUI();
    }
    
    function closeSettings() {
        elements.settingsModal.style.display = 'none';
    }
    
    // Load and display API configuration status
    async function loadApiConfigStatus() {
        try {
            const result = await chrome.storage.local.get(['apiKeys']);
            const apiKeys = result.apiKeys || {};
            
            // Check which platforms have API keys configured
            const configuredPlatforms = [];
            const platforms = ['spotify', 'youtube', 'apple', 'amazon'];
            
            platforms.forEach(platform => {
                if (apiKeys[platform] && Object.keys(apiKeys[platform]).length > 0) {
                    // Check if the platform has required keys
                    const keys = apiKeys[platform];
                    let hasRequiredKeys = false;
                    
                    switch (platform) {
                        case 'spotify':
                            hasRequiredKeys = keys.clientId && keys.clientSecret;
                            break;
                        case 'youtube':
                            hasRequiredKeys = keys.clientId && keys.apiKey;
                            break;
                        case 'apple':
                            hasRequiredKeys = keys.teamId && keys.keyId && keys.privateKey;
                            break;
                        case 'amazon':
                            hasRequiredKeys = keys.clientId && keys.clientSecret;
                            break;
                    }
                    
                    if (hasRequiredKeys) {
                        configuredPlatforms.push(platform.charAt(0).toUpperCase() + platform.slice(1));
                    }
                }
            });
            
            // Update UI elements
            if (elements.configStatus) {
                if (configuredPlatforms.length > 0) {
                    elements.configStatus.textContent = 'Configured';
                    elements.configStatus.className = 'status-value status-success';
                } else {
                    elements.configStatus.textContent = 'Not Configured';
                    elements.configStatus.className = 'status-value status-error';
                }
            }
            
            if (elements.platformsAvailable) {
                if (configuredPlatforms.length > 0) {
                    elements.platformsAvailable.textContent = configuredPlatforms.join(', ');
                    elements.platformsAvailable.className = 'status-value status-success';
                } else {
                    elements.platformsAvailable.textContent = 'None';
                    elements.platformsAvailable.className = 'status-value status-error';
                }
            }
            
        } catch (error) {
            console.error('Error loading API config status:', error);
            if (elements.configStatus) {
                elements.configStatus.textContent = 'Error';
                elements.configStatus.className = 'status-value status-error';
            }
            if (elements.platformsAvailable) {
                elements.platformsAvailable.textContent = 'Error loading';
                elements.platformsAvailable.className = 'status-value status-error';
            }
        }
    }
    
    async function loadSettings() {
        try {
            const response = await sendMessage({ action: 'getSettings' });
            if (response.success) {
                settings = response.settings || {};
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }
    
    function loadSettingsUI() {
        // Load API configuration status
        loadApiConfigStatus();
        
        // Load settings
        elements.conflictResolution.value = settings.conflictResolution || 'skip';
        elements.batchSize.value = settings.batchSize || 50;
        elements.retryAttempts.value = settings.retryAttempts || 3;
    }
    
    async function saveSettings() {
        try {
            // Save settings (API keys are handled via config.js)
            const newSettings = {
                conflictResolution: elements.conflictResolution.value,
                batchSize: parseInt(elements.batchSize.value),
                retryAttempts: parseInt(elements.retryAttempts.value)
            };
            
            await sendMessage({ action: 'updateSettings', settings: newSettings });
            
            settings = newSettings;
            
            showNotification('Settings saved successfully', 'success');
            closeSettings();
            
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotification('Failed to save settings', 'error');
        }
    }
    
    function resetSettings() {
        elements.conflictResolution.value = 'skip';
        elements.batchSize.value = 50;
        elements.retryAttempts.value = 3;
        
        showNotification('Settings reset to defaults', 'info');
    }
    
    // Handle messages from background script
    function handleBackgroundMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'transferProgress':
                updateTransferProgress();
                break;
                
            case 'transferComplete':
                showTransferProgress(false);
                loadTransferHistory();
                showNotification('Transfer completed successfully', 'success');
                break;
                
            case 'transferError':
                showTransferProgress(false);
                showNotification(`Transfer failed: ${message.error}`, 'error');
                break;
        }
        
        sendResponse({ success: true });
    }
    
    // Utility functions
    async function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    function showLoading(show) {
        elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }
    
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `popup-notification ${type}`;
        notification.textContent = message;
        
        // Style notification
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            max-width: 250px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease;
        `;
        
        // Add animation styles
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 3000);
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();

