// YouTube Music Content Script - Playlist Transfer Extension
// Injects transfer buttons and handles playlist data extraction on YouTube Music Web Player

(function() {
    'use strict';
    
    // Configuration
    const PLATFORM = 'youtube';
    const SELECTORS = {
        playlistPage: '.playlist-header, [data-testid="playlist-header"], .ytmusic-detail-header-renderer',
        playlistTitle: '.title, [data-testid="playlist-title"], .ytmusic-detail-header-renderer .title',
        playlistDescription: '.description, [data-testid="playlist-description"], .ytmusic-description-shelf-renderer',
        playlistTracks: '.ytmusic-playlist-shelf-renderer .ytmusic-responsive-list-item-renderer, .song-row, [data-testid="track-item"]',
        trackName: '.title-column .yt-simple-endpoint, .song-title, [data-testid="track-name"]',
        trackArtist: '.secondary-flex-columns .yt-simple-endpoint, .song-artist, [data-testid="track-artist"]',
        trackAlbum: '.secondary-flex-columns .yt-simple-endpoint[href*="/browse/"], .song-album, [data-testid="track-album"]',
        playButton: '.play-pause-button, [data-testid="play-button"], .ytmusic-play-button-renderer',
        moreButton: '.dropdown-trigger, [data-testid="more-button"], .ytmusic-menu-renderer',
        actionBar: '.ytmusic-detail-header-renderer .middle-controls, .playlist-actions, [data-testid="action-bar"]'
    };
    
    // State management
    let currentPlaylist = null;
    let transferButton = null;
    let isInjected = false;
    let observerActive = false;
    
    // Initialize content script
    function init() {
        console.log('YouTube Music content script initialized');
        
        // Check if we're on YouTube Music domain
        if (!isYouTubeMusicDomain()) {
            console.log('Not on YouTube Music domain, exiting');
            return;
        }
        
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObserver);
        } else {
            startObserver();
        }
    }
    
    // Check if current domain is YouTube Music
    function isYouTubeMusicDomain() {
        return window.location.hostname === 'music.youtube.com';
    }
    
    // Start observing page changes
    function startObserver() {
        if (observerActive) return;
        observerActive = true;
        
        // Initial check
        setTimeout(checkForPlaylist, 1000);
        
        // Watch for navigation changes (YouTube Music is a SPA)
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if significant content was added
                    const hasSignificantChanges = Array.from(mutation.addedNodes).some(node => {
                        return node.nodeType === Node.ELEMENT_NODE && 
                               (node.classList.contains('ytmusic-detail-header-renderer') ||
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
            console.log('YouTube Music playlist page detected');
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
        return url.includes('/playlist?list=') || 
               url.includes('&list=') ||
               (url.includes('/browse/') && url.includes('playlist'));
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
            
            console.log('Extracted YouTube Music playlist data:', currentPlaylist);
            
        } catch (error) {
            console.error('Error extracting YouTube Music playlist data:', error);
        }
    }
    
    // Extract playlist ID from URL
    function extractPlaylistIdFromUrl() {
        const url = window.location.href;
        
        // Try different URL patterns for YouTube Music
        let match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        
        match = url.match(/\/playlist\?list=([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
        
        // Fallback to URL search params
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('list') || 'unknown';
    }
    
    // Extract track information
    function extractTracks() {
        const tracks = [];
        const trackElements = document.querySelectorAll(SELECTORS.playlistTracks);
        
        trackElements.forEach((trackElement, index) => {
            try {
                // Try multiple selectors for track name
                const nameElement = trackElement.querySelector(SELECTORS.trackName) ||
                                  trackElement.querySelector('.title .yt-simple-endpoint') ||
                                  trackElement.querySelector('.song-title') ||
                                  trackElement.querySelector('[data-testid="track-name"]');
                
                // Try multiple selectors for artist
                const artistElements = trackElement.querySelectorAll(SELECTORS.trackArtist) ||
                                     trackElement.querySelectorAll('.secondary-flex-columns .yt-simple-endpoint') ||
                                     trackElement.querySelectorAll('.song-artist a');
                
                // Try multiple selectors for album
                const albumElement = trackElement.querySelector(SELECTORS.trackAlbum) ||
                                   trackElement.querySelector('.secondary-flex-columns .yt-simple-endpoint[href*="/browse/"]') ||
                                   trackElement.querySelector('.song-album a');
                
                if (nameElement) {
                    const trackName = nameElement.textContent.trim();
                    
                    // Extract artists (YouTube Music often has multiple artists)
                    const artists = [];
                    if (artistElements && artistElements.length > 0) {
                        Array.from(artistElements).forEach(artistEl => {
                            const artistText = artistEl.textContent.trim();
                            if (artistText && !artistText.includes('•') && artistText !== trackName) {
                                artists.push(artistText);
                            }
                        });
                    }
                    
                    const album = albumElement ? albumElement.textContent.trim() : '';
                    
                    // Try to get duration
                    const durationElement = trackElement.querySelector('.time-column, .duration, [data-testid="track-duration"]');
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
                console.error('Error extracting YouTube Music track data:', error);
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
                              playlistPage.querySelector('.ytmusic-detail-header-renderer .middle-controls') ||
                              playlistPage.querySelector('.playlist-actions') ||
                              playlistPage.querySelector('.ytmusic-menu-renderer');
        
        if (!actionsContainer) {
            // Try to find play button and insert near it
            const playButton = playlistPage.querySelector(SELECTORS.playButton);
            if (playButton) {
                actionsContainer = playButton.parentElement;
            }
        }
        
        if (!actionsContainer) {
            // Create a container if none exists
            const headerRenderer = playlistPage.querySelector('.ytmusic-detail-header-renderer');
            if (headerRenderer) {
                const customContainer = document.createElement('div');
                customContainer.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 16px;
                `;
                headerRenderer.appendChild(customContainer);
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
        
        console.log('YouTube Music transfer button injected successfully');
    }
    
    // Create the transfer button element
    function createTransferButton() {
        const button = document.createElement('button');
        button.className = 'youtube-playlist-transfer-btn';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0L6.59 1.41L12.17 7H0V9H12.17L6.59 14.59L8 16L16 8L8 0Z"/>
            </svg>
            Transfer Playlist
        `;
        
        // Add styles that match YouTube Music design
        button.style.cssText = `
            background: #ff0000;
            color: white;
            border: none;
            border-radius: 18px;
            padding: 8px 16px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: 8px;
            transition: all 0.2s ease;
            font-family: "Roboto", Arial, sans-serif;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        `;
        
        // Add hover effects
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#cc0000';
            button.style.transform = 'translateY(-1px)';
            button.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = '#ff0000';
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="youtube-spinning">
                <path d="M8 0V4L12 0H8ZM8 16V12L4 16H8ZM0 8H4L0 4V8ZM16 8H12L16 12V8Z"/>
            </svg>
            Processing...
        `;
        
        // Add spinning animation
        if (!document.getElementById('youtube-spinner-style')) {
            const style = document.createElement('style');
            style.id = 'youtube-spinner-style';
            style.textContent = `
                .youtube-spinning {
                    animation: youtube-spin 1s linear infinite;
                }
                @keyframes youtube-spin {
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
        const existingNotifications = document.querySelectorAll('.youtube-playlist-transfer-notification');
        existingNotifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `youtube-playlist-transfer-notification ${type}`;
        notification.textContent = message;
        
        // Style notification to match YouTube design
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ff0000' : type === 'success' ? '#00ff00' : '#333'};
            color: ${type === 'success' ? '#000' : '#fff'};
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: "Roboto", Arial, sans-serif;
            max-width: 300px;
            word-wrap: break-word;
            border-left: 4px solid ${type === 'error' ? '#cc0000' : type === 'success' ? '#00cc00' : '#ff0000'};
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
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
            console.log(`YouTube Music: Retry attempt ${retryCount}`);
            setTimeout(checkForPlaylist, 2000 * retryCount);
        }
    }
    
    // Start retry mechanism
    setTimeout(retryInit, 3000);
    
    // Initialize when script loads
    init();
    
})();

