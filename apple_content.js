// Apple Music Content Script - Playlist Transfer Extension
// Injects transfer buttons and handles playlist data extraction on Apple Music Web Player

(function() {
    'use strict';
    
    // Configuration
    const PLATFORM = 'apple';
    const SELECTORS = {
        playlistPage: '.product-page-header, [data-testid="playlist-header"], .headings',
        playlistTitle: '.product-page-header__title, [data-testid="playlist-title"], .headings__title',
        playlistDescription: '.product-page-header__metadata, [data-testid="playlist-description"], .headings__metadata',
        playlistTracks: '.songs-list-row, .tracklist-item, [data-testid="track-item"]',
        trackName: '.songs-list-row__song-name, .song-name, [data-testid="track-name"]',
        trackArtist: '.songs-list-row__by-line a, .by-line a, [data-testid="track-artist"]',
        trackAlbum: '.songs-list-row__album-name, .album-name, [data-testid="track-album"]',
        playButton: '.play-button, [data-testid="play-button"], .product-page-header__play-button',
        moreButton: '.more-button, [data-testid="more-button"], .context-menu-trigger',
        actionBar: '.product-page-header__actions, .playlist-actions, [data-testid="action-bar"]'
    };
    
    // State management
    let currentPlaylist = null;
    let transferButton = null;
    let isInjected = false;
    let observerActive = false;
    
    // Initialize content script
    function init() {
        console.log('Apple Music content script initialized');
        
        // Check if we're on Apple Music domain
        if (!isAppleMusicDomain()) {
            console.log('Not on Apple Music domain, exiting');
            return;
        }
        
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserver);
        } else {
            startObserver();
        }
    }
    
    // Check if current domain is Apple Music
    function isAppleMusicDomain() {
        return window.location.hostname === 'music.apple.com';
    }
    
    // Start observing page changes
    function startObserver() {
        if (observerActive) return;
        observerActive = true;
        
        // Initial check
        setTimeout(checkForPlaylist, 1000);
        
        // Watch for navigation changes (Apple Music is a SPA)
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if significant content was added
                    const hasSignificantChanges = Array.from(mutation.addedNodes).some(node => {
                        return node.nodeType === Node.ELEMENT_NODE && 
                               (node.classList.contains('product-page-header') ||
                                node.classList.contains('headings') ||
                                node.querySelector && node.querySelector(SELECTORS.playlistPage));
                    });
                    
                    if (hasSignificantChanges) {
                        shouldCheck = true;
                    }
                }
            });
            
            if (shouldCheck) {
                setTimeout(checkForPlaylist, 800);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Listen for URL changes
        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(checkForPlaylist, 1200);
            }
        });
        
        urlObserver.observe(document, { subtree: true, childList: true });
        
        // Also listen for hash changes and popstate
        window.addEventListener('popstate', () => {
            setTimeout(checkForPlaylist, 1000);
        });
        
        window.addEventListener('hashchange', () => {
            setTimeout(checkForPlaylist, 1000);
        });
    }
    
    // Check if current page is a playlist
    function checkForPlaylist() {
        const playlistPage = document.querySelector(SELECTORS.playlistPage);
        
        if (playlistPage && isPlaylistPage()) {
            console.log('Apple Music playlist page detected');
            if (!isInjected) {
                setTimeout(injectTransferButton, 500);
            }
            setTimeout(extractPlaylistData, 800);
        } else {
            removeTransferButton();
        }
    }
    
    // Check if current URL is a playlist page
    function isPlaylistPage() {
        const url = window.location.href;
        return url.includes('/playlist/') || 
               url.includes('/playlists/') ||
               (url.includes('/library/') && url.includes('playlist')) ||
               url.includes('/browse/') && url.includes('playlist');
    }
    
    // Extract playlist data from the page
    function extractPlaylistData() {
        try {
            const titleElement = document.querySelector(SELECTORS.playlistTitle);
            const descriptionElement = document.querySelector(SELECTORS.playlistDescription);
            
            if (!titleElement) {
                console.log('No title element found, trying alternative selectors');
                return;
            }
            
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
            
            console.log('Extracted Apple Music playlist data:', currentPlaylist);
            
        } catch (error) {
            console.error('Error extracting Apple Music playlist data:', error);
        }
    }
    
    // Extract playlist ID from URL
    function extractPlaylistIdFromUrl() {
        const url = window.location.href;
        
        // Try different URL patterns for Apple Music
        let match = url.match(/\/playlist\/([a-zA-Z0-9.-]+)/);
        if (match) return match[1];
        
        match = url.match(/\/playlists\/([a-zA-Z0-9.-]+)/);
        if (match) return match[1];
        
        match = url.match(/\/browse\/([a-zA-Z0-9.-]+)/);
        if (match) return match[1];
        
        // Fallback to last segment of path
        const pathSegments = url.split('/').filter(segment => segment.length > 0);
        return pathSegments[pathSegments.length - 1] || 'unknown';
    }
    
    // Extract track information
    function extractTracks() {
        const tracks = [];
        const trackElements = document.querySelectorAll(SELECTORS.playlistTracks);
        
        trackElements.forEach((trackElement, index) => {
            try {
                // Try multiple selectors for track name
                const nameElement = trackElement.querySelector(SELECTORS.trackName) ||
                                  trackElement.querySelector('.songs-list-row__song-name') ||
                                  trackElement.querySelector('.song-name') ||
                                  trackElement.querySelector('[data-testid="track-name"]');
                
                // Try multiple selectors for artist
                const artistElements = trackElement.querySelectorAll(SELECTORS.trackArtist) ||
                                     trackElement.querySelectorAll('.songs-list-row__by-line a') ||
                                     trackElement.querySelectorAll('.by-line a');
                
                // Try multiple selectors for album
                const albumElement = trackElement.querySelector(SELECTORS.trackAlbum) ||
                                   trackElement.querySelector('.songs-list-row__album-name') ||
                                   trackElement.querySelector('.album-name');
                
                if (nameElement) {
                    const trackName = nameElement.textContent.trim();
                    
                    // Extract artists
                    const artists = [];
                    if (artistElements && artistElements.length > 0) {
                        Array.from(artistElements).forEach(artistEl => {
                            const artistText = artistEl.textContent.trim();
                            if (artistText && artistText !== trackName) {
                                artists.push(artistText);
                            }
                        });
                    }
                    
                    const album = albumElement ? albumElement.textContent.trim() : '';
                    
                    // Try to get duration
                    const durationElement = trackElement.querySelector('.songs-list-row__length, .duration, [data-testid="track-duration"]');
                    const duration = durationElement ? durationElement.textContent.trim() : '';
                    
                    tracks.push({
                        name: trackName,
                        artists: artists.length > 0 ? artists : ['Unknown Artist'],
                        album: album,
                        duration: duration,
                        position: index + 1,
                        platform: PLATFORM
                    });
                }
            } catch (error) {
                console.error('Error extracting Apple Music track data:', error);
            }
        });
        
        return tracks;
    }
    
    // Inject transfer button into the page
    function injectTransferButton() {
        if (transferButton) return;
        
        const playlistPage = document.querySelector(SELECTORS.playlistPage);
        if (!playlistPage) return;
        
        // Try to find action bar or button container
        let actionsContainer = playlistPage.querySelector(SELECTORS.actionBar) ||
                              playlistPage.querySelector('.product-page-header__actions') ||
                              playlistPage.querySelector('.playlist-actions') ||
                              playlistPage.querySelector('.headings__actions');
        
        if (!actionsContainer) {
            // Try to find play button and insert near it
            const playButton = playlistPage.querySelector(SELECTORS.playButton);
            if (playButton) {
                actionsContainer = playButton.parentElement;
            }
        }
        
        if (!actionsContainer) {
            // Create a container if none exists
            const headerElement = playlistPage.querySelector('.product-page-header') || 
                                 playlistPage.querySelector('.headings');
            if (headerElement) {
                const customContainer = document.createElement('div');
                customContainer.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 16px;
                `;
                headerElement.appendChild(customContainer);
                actionsContainer = customContainer;
            }
        }
        
        if (!actionsContainer) {
            console.log('Could not find suitable container for transfer button');
            return;
        }
        
        // Create transfer button
        transferButton = createTransferButton();
        
        // Insert button
        actionsContainer.appendChild(transferButton);
        isInjected = true;
        
        console.log('Apple Music transfer button injected successfully');
    }
    
    // Create the transfer button element
    function createTransferButton() {
        const button = document.createElement('button');
        button.className = 'apple-playlist-transfer-btn';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0L6.59 1.41L12.17 7H0V9H12.17L6.59 14.59L8 16L16 8L8 0Z"/>
            </svg>
            Transfer Playlist
        `;
        
        // Add styles that match Apple Music design
        button.style.cssText = `
            background: linear-gradient(135deg, #fa233b 0%, #fb5c74 100%);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: 12px;
            transition: all 0.2s ease;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Helvetica, Arial, sans-serif;
            box-shadow: 0 2px 8px rgba(250, 35, 59, 0.3);
            text-transform: none;
            letter-spacing: -0.01em;
        `;
        
        // Add hover effects
        button.addEventListener('mouseenter', () => {
            button.style.background = 'linear-gradient(135deg, #e8213a 0%, #f04968 100%)';
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 4px 16px rgba(250, 35, 59, 0.4)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = 'linear-gradient(135deg, #fa233b 0%, #fb5c74 100%)';
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 2px 8px rgba(250, 35, 59, 0.3)';
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="apple-spinning">
                <path d="M8 0V4L12 0H8ZM8 16V12L4 16H8ZM0 8H4L0 4V8ZM16 8H12L16 12V8Z"/>
            </svg>
            Processing...
        `;
        
        // Add spinning animation
        if (!document.getElementById('apple-spinner-style')) {
            const style = document.createElement('style');
            style.id = 'apple-spinner-style';
            style.textContent = `
                .apple-spinning {
                    animation: apple-spin 1s linear infinite;
                }
                @keyframes apple-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
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
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.apple-playlist-transfer-notification');
        existingNotifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `apple-playlist-transfer-notification ${type}`;
        notification.textContent = message;
        
        // Style notification to match Apple design
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#fa233b' : type === 'success' ? '#30d158' : '#1d1d1f'};
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            z-index: 9999;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Helvetica, Arial, sans-serif;
            max-width: 320px;
            word-wrap: break-word;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%) scale(0.9)';
                notification.style.transition = 'all 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 4000);
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
                
            case 'checkPlaylistPage':
                const isPlaylist = isPlaylistPage();
                sendResponse({ 
                    success: true, 
                    isPlaylistPage: isPlaylist,
                    url: window.location.href
                });
                break;
                
            default:
                sendResponse({ error: 'Unknown action' });
        }
        
        return true;
    });
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isPlaylistPage()) {
            setTimeout(checkForPlaylist, 1500);
        }
    });
    
    // Handle focus events (when user returns to tab)
    window.addEventListener('focus', () => {
        if (isPlaylistPage()) {
            setTimeout(checkForPlaylist, 1000);
        }
    });
    
    // Retry mechanism for initial load
    let retryCount = 0;
    const maxRetries = 5;
    
    function retryInit() {
        if (retryCount < maxRetries && !isInjected && isPlaylistPage()) {
            retryCount++;
            console.log(`Apple Music: Retry attempt ${retryCount}`);
            setTimeout(checkForPlaylist, 2000 * retryCount);
        }
    }
    
    // Start retry mechanism
    setTimeout(retryInit, 3000);
    
    // Initialize when script loads
    init();
    
})();

