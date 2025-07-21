// Spotify Content Script - Playlist Transfer Extension
// Injects transfer buttons and handles playlist data extraction on Spotify Web Player

(function() {
    'use strict';
    
    // Configuration
    const PLATFORM = 'spotify';
    const SELECTORS = {
        playlistHeader: '[data-testid="playlist-page"]',
        playlistTitle: '[data-testid="entityTitle"]',
        playlistDescription: '[data-testid="description"]',
        playlistTracks: '[data-testid="tracklist-row"]',
        trackName: '[data-testid="tracklist-row"] [dir="auto"]',
        trackArtist: '[data-testid="tracklist-row"] a[href*="/artist/"]',
        playButton: '[data-testid="play-button"]',
        moreButton: '[data-testid="more-button"]',
        contextMenu: '[data-testid="context-menu"]'
    };
    
    // State management
    let currentPlaylist = null;
    let transferButton = null;
    let isInjected = false;
    
    // Initialize content script
    function init() {
        console.log('Spotify content script initialized');
        
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserver);
        } else {
            startObserver();
        }
    }
    
    // Start observing page changes
    function startObserver() {
        // Initial check
        checkForPlaylist();
        
        // Watch for navigation changes (Spotify is a SPA)
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldCheck = true;
                }
            });
            
            if (shouldCheck) {
                setTimeout(checkForPlaylist, 500); // Delay to ensure DOM is ready
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Also listen for URL changes
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(checkForPlaylist, 1000);
            }
        }).observe(document, { subtree: true, childList: true });
    }
    
    // Check if current page is a playlist
    function checkForPlaylist() {
        const playlistHeader = document.querySelector(SELECTORS.playlistHeader);
        
        if (playlistHeader && isPlaylistPage()) {
            if (!isInjected) {
                injectTransferButton();
            }
            extractPlaylistData();
        } else {
            removeTransferButton();
        }
    }
    
    // Check if current URL is a playlist page
    function isPlaylistPage() {
        const url = window.location.href;
        return url.includes('/playlist/') && !url.includes('/episode/') && !url.includes('/show/');
    }
    
    // Extract playlist data from the page
    function extractPlaylistData() {
        try {
            const titleElement = document.querySelector(SELECTORS.playlistTitle);
            const descriptionElement = document.querySelector(SELECTORS.playlistDescription);
            
            if (!titleElement) return;
            
            const playlistId = extractPlaylistIdFromUrl();
            const title = titleElement.textContent.trim();
            const description = descriptionElement ? descriptionElement.textContent.trim() : '';
            
            // Get track count
            const trackElements = document.querySelectorAll(SELECTORS.playlistTracks);
            const trackCount = trackElements.length;
            
            currentPlaylist = {
                id: playlistId,
                name: title,
                description: description,
                trackCount: trackCount,
                platform: PLATFORM,
                url: window.location.href,
                tracks: extractTracks()
            };
            
            console.log('Extracted playlist data:', currentPlaylist);
            
        } catch (error) {
            console.error('Error extracting playlist data:', error);
        }
    }
    
    // Extract playlist ID from URL
    function extractPlaylistIdFromUrl() {
        const match = window.location.href.match(/\/playlist\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
    
    // Extract track information
    function extractTracks() {
        const tracks = [];
        const trackElements = document.querySelectorAll(SELECTORS.playlistTracks);
        
        trackElements.forEach((trackElement, index) => {
            try {
                const nameElement = trackElement.querySelector('[dir="auto"]');
                const artistElements = trackElement.querySelectorAll('a[href*="/artist/"]');
                
                if (nameElement) {
                    const trackName = nameElement.textContent.trim();
                    const artists = Array.from(artistElements).map(el => el.textContent.trim());
                    
                    // Try to get album info
                    const albumElement = trackElement.querySelector('a[href*="/album/"]');
                    const album = albumElement ? albumElement.textContent.trim() : '';
                    
                    // Try to get duration
                    const durationElement = trackElement.querySelector('[data-testid="duration"]');
                    const duration = durationElement ? durationElement.textContent.trim() : '';
                    
                    tracks.push({
                        name: trackName,
                        artists: artists,
                        album: album,
                        duration: duration,
                        position: index + 1,
                        platform: PLATFORM
                    });
                }
            } catch (error) {
                console.error('Error extracting track data:', error);
            }
        });
        
        return tracks;
    }
    
    // Inject transfer button into the page
    function injectTransferButton() {
        if (transferButton) return;
        
        const playlistHeader = document.querySelector(SELECTORS.playlistHeader);
        if (!playlistHeader) return;
        
        // Find the action buttons container
        const actionsContainer = playlistHeader.querySelector('[data-testid="action-bar-row"]') ||
                                playlistHeader.querySelector('.playlist-playlist-playlistContent');
        
        if (!actionsContainer) {
            console.log('Could not find actions container, trying alternative approach');
            injectTransferButtonAlternative();
            return;
        }
        
        // Create transfer button
        transferButton = createTransferButton();
        
        // Insert button
        actionsContainer.appendChild(transferButton);
        isInjected = true;
        
        console.log('Transfer button injected successfully');
    }
    
    // Alternative injection method
    function injectTransferButtonAlternative() {
        const playButton = document.querySelector(SELECTORS.playButton);
        if (!playButton) return;
        
        const buttonContainer = playButton.parentElement;
        if (!buttonContainer) return;
        
        transferButton = createTransferButton();
        buttonContainer.appendChild(transferButton);
        isInjected = true;
    }
    
    // Create the transfer button element
    function createTransferButton() {
        const button = document.createElement('button');
        button.className = 'playlist-transfer-btn';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0L6.59 1.41L12.17 7H0V9H12.17L6.59 14.59L8 16L16 8L8 0Z"/>
            </svg>
            Transfer Playlist
        `;
        
        // Add styles
        button.style.cssText = `
            background: #1db954;
            color: white;
            border: none;
            border-radius: 500px;
            padding: 8px 16px;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: 8px;
            transition: all 0.2s ease;
            font-family: var(--font-family, CircularSp, CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Devanagari, sans-serif);
        `;
        
        // Add hover effects
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.04)';
            button.style.backgroundColor = '#1ed760';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.backgroundColor = '#1db954';
        });
        
        // Add click handler
        button.addEventListener('click', handleTransferClick);
        
        return button;
    }
    
    // Handle transfer button click
    function handleTransferClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (!currentPlaylist) {
            showNotification('Please wait for playlist data to load', 'error');
            return;
        }
        
        // Show loading state
        transferButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="spinning">
                <path d="M8 0V4L12 0H8ZM8 16V12L4 16H8ZM0 8H4L0 4V8ZM16 8H12L16 12V8Z"/>
            </svg>
            Processing...
        `;
        
        // Add spinning animation
        const style = document.createElement('style');
        style.textContent = `
            .spinning {
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        // Send playlist data to background script
        chrome.runtime.sendMessage({
            action: 'openTransferDialog',
            playlist: currentPlaylist,
            platform: PLATFORM
        }, (response) => {
            // Reset button
            transferButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0L6.59 1.41L12.17 7H0V9H12.17L6.59 14.59L8 16L16 8L8 0Z"/>
                </svg>
                Transfer Playlist
            `;
            
            if (response && response.error) {
                showNotification(response.error, 'error');
            } else {
                showNotification('Transfer dialog opened', 'success');
            }
        });
    }
    
    // Remove transfer button
    function removeTransferButton() {
        if (transferButton && transferButton.parentNode) {
            transferButton.parentNode.removeChild(transferButton);
            transferButton = null;
            isInjected = false;
        }
    }
    
    // Show notification to user
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `playlist-transfer-notification ${type}`;
        notification.textContent = message;
        
        // Style notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#e22134' : type === 'success' ? '#1db954' : '#333'};
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: var(--font-family, CircularSp, sans-serif);
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
            case 'getPlaylistData':
                sendResponse({
                    success: true,
                    playlist: currentPlaylist
                });
                break;
                
            case 'refreshPlaylist':
                extractPlaylistData();
                sendResponse({ success: true });
                break;
                
            case 'showNotification':
                showNotification(message.message, message.type);
                sendResponse({ success: true });
                break;
                
            default:
                sendResponse({ error: 'Unknown action' });
        }
        
        return true;
    });
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isPlaylistPage()) {
            setTimeout(checkForPlaylist, 1000);
        }
    });
    
    // Initialize when script loads
    init();
    
})();

