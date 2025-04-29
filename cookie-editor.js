import { BrowserDetector } from './interface/lib/browserDetector.js';
import { PermissionHandler } from './interface/lib/permissionHandler.js';
import { extractSharedDataFromUrl } from './interface/lib/sharing/cookieSharing.js';
import { GenericStorageHandler } from './interface/lib/genericStorageHandler.js';
import { OptionsHandler } from './interface/lib/optionsHandler.js';

(function () {
  
  // TODO: Separate connections from CookieHandler and OptionsHandler.
  // It would also be cool to separate their whole behavior in separate class
  // that extends a generic one.
  const connections = {};
  const browserDetector = new BrowserDetector();
  const permissionHandler = new PermissionHandler(browserDetector);
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionsHandler = new OptionsHandler(browserDetector, storageHandler);

  // Track domains we have permission for
  const permittedDomains = new Set();
  
  // Periodically prune stale connections whose sender tab has closed
  setInterval(async () => {
    try {
      const tabs = await browserDetector.getApi().tabs.query({});
      const validIds = tabs.map(t => t.id);
      for (const key in connections) {
        const port = connections[key];
        // Port.sender.tab.id exists for tab connections
        const tabId = port.sender?.tab?.id;
        if (typeof tabId === 'number' && !validIds.includes(tabId)) {
          delete connections[key];
        }
      }
    } catch (e) {
      // ignore errors in cleanup
    }
  }, 300000); // every 5 minutes
  
  // Variables for badge pulsing effect
  let badgePulseInterval = null;
  let badgePulseState = false;
  
  // Variable for cookie change debouncing
  let cookieChangeTimeout = null;
  // Initialize dynamic cookie detection for background script
  const dynamicCookieNames = new Set(['_dd_s', 'datadome']);
  const cookieChangeHistory = {};
  const dynamicDetectionThreshold = 3; // number of changes to detect dynamic cookies
  const dynamicDetectionWindow = 3500; // detection time window in ms

  browserDetector.getApi().runtime.onConnect.addListener(onConnect);
  browserDetector.getApi().runtime.onMessage.addListener(handleMessage);
  browserDetector.getApi().tabs.onUpdated.addListener(onTabsChanged);

  // Set up options page redirection based on user preference
  setupOptionsRedirect();

  if (!browserDetector.isSafari()) {
    browserDetector.getApi().cookies.onChanged.addListener(onCookiesChanged);
  }

  // Initialize badge state
  resetBadgeState();

  /**
   * Reset the badge state when the extension is loaded
   */
  function resetBadgeState() {
    try {
      // Stop any pulsing
      stopBadgePulsing();
      
      // Clear any existing badge
      const action = browserDetector.getApi().action || browserDetector.getApi().browserAction;
      if (action && action.setBadgeText) {
        try {
          action.setBadgeText({ text: "" });
        } catch (e) {
          console.warn('Error resetting badge text (ignored):', e.message);
        }
        if (browserDetector.getApi().runtime.lastError) {
          // Log but don't throw, prevent unchecked error
          console.warn('runtime.lastError after resetting badge text:', browserDetector.getApi().runtime.lastError.message);
        }
      }
    } catch (error) {
      console.error('Error resetting badge state:', error);
    }
  }

  /**
   * Update the extension badge
   * @param {string} text - Badge text
   * @param {string} color - Badge color
   * @param {string} title - Badge tooltip text
   */
  function updateBadge(text, color, title) {
    try {
      const action = browserDetector.getApi().action || browserDetector.getApi().browserAction;
      if (action) {
        if (action.setBadgeText) {
          try {
            action.setBadgeText({ text: text });
          } catch (e) {
             console.warn('Error setting badge text (ignored):', e.message);
          }
          if (browserDetector.getApi().runtime.lastError) {
            console.warn('runtime.lastError after setting badge text:', browserDetector.getApi().runtime.lastError.message);
          }
        }
        if (action.setBadgeBackgroundColor) {
          try {
            action.setBadgeBackgroundColor({ color: color });
          } catch (e) {
            console.warn('Error setting badge background color (ignored):', e.message);
          }
          if (browserDetector.getApi().runtime.lastError) {
            console.warn('runtime.lastError after setting badge background color:', browserDetector.getApi().runtime.lastError.message);
          }
        }
        if (action.setTitle) {
          try {
            action.setTitle({ title: title });
          } catch (e) {
             console.warn('Error setting badge title (ignored):', e.message);
          }
          if (browserDetector.getApi().runtime.lastError) {
            console.warn('runtime.lastError after setting badge title:', browserDetector.getApi().runtime.lastError.message);
          }
        }
      }
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }

  // Load permitted domains from storage on startup
  loadPermittedDomains();

  /**
   * Load the list of domains we have permission for from storage
   */
  function loadPermittedDomains() {
    browserDetector.getApi().storage.local.get('permittedDomains', (result) => {
      if (browserDetector.getApi().runtime.lastError) {
        console.warn('Error loading permitted domains:', browserDetector.getApi().runtime.lastError.message);
        return;
      }
      if (result && result.permittedDomains && Array.isArray(result.permittedDomains)) {
        result.permittedDomains.forEach(domain => permittedDomains.add(domain));
      }
    });
  }

  /**
   * Save the current set of permitted domains to storage
   */
  function savePermittedDomains() {
    browserDetector.getApi().storage.local.set({
      permittedDomains: Array.from(permittedDomains)
    });
  }

  /**
   * Add a domain to our permitted domains list
   * @param {string} url - The URL to extract domain from and add to permitted list
   */
  function addPermittedDomain(url) {
    try {
      const domain = getDomainFromUrl(url);
      if (domain) {
        permittedDomains.add(domain);
        savePermittedDomains();
        
        // Also check this URL for shared cookies right away
        checkUrlForSharedCookies(url);
      }
    } catch (error) {
      console.error('Error adding permitted domain:', error);
    }
  }

  /**
   * Check if we have permission for a domain
   * @param {string} url - The URL to check
   * @returns {Promise<boolean>} - True if we have permission
   */
  async function hasPermissionForUrl(url) {
    try {
      // Handle null or undefined URL
      if (!url) {
        return false;
      }
      
      // Special case for internal browser URLs and extension pages
      for (const prefix of ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'moz-extension:', 'safari-web-extension:']) {
        if (url.startsWith(prefix)) {
          // No need to log errors for internal pages - just silently return false
          return false;
        }
      }
      
      return await permissionHandler.checkPermissions(url);
    } catch (error) {
      console.warn('Permission check failed:', error.message || error);
      return false;
    }
  }

  /**
   * Check a URL for shared cookies or profiles and update badge if found
   * @param {string} url - The URL to check
   */
  function checkUrlForSharedCookies(url) {
    // Only check URLs that could contain shared data
    if (!url || !url.includes('#')) return;
    
    try {
      // Skip checking extension or internal browser URLs
      for (const prefix of ['chrome:', 'chrome-extension:', 'about:', 'edge:', 'moz-extension:', 'safari-web-extension:']) {
        if (url.startsWith(prefix)) {
          return;
        }
      }
      
      const sharedData = extractSharedDataFromUrl(url);
      if (!sharedData) return;
      
      const dataType = sharedData.type || 'cookies';
      const isProfiles = dataType === 'profiles';
      
      // Get a descriptive count for the badge tooltip
      let count = 0;
      let description = '';
      
      if (isProfiles) {
        // For profiles, count the number of profiles
        count = Object.keys(sharedData.p || {}).length;
        description = `${count} profile${count !== 1 ? 's' : ''} available to import for ${sharedData.d || 'this site'}`;
      } else {
        // For cookies, count the number of cookies
        count = sharedData.c?.length || 0;
        description = `${count} cookie${count !== 1 ? 's' : ''} available to import for ${sharedData.d || 'this site'}`;
      }
      
      // Update badge
      updateBadge(
        "!",
        "#FF0000",
        `Cookie-Editor Plus: ${description}`
      );
      
      // Store in local storage for the popup to find
      browserDetector.getApi().storage.local.set({
        pendingSharedData: sharedData
      });
      
      // Start pulsing the badge to draw attention
      startBadgePulsing();
    } catch (error) {
      // Don't log errors for extension pages - just silently return
      if (url && (url.startsWith('chrome-extension:') || url.startsWith('moz-extension:'))) {
        return;
      }
      console.warn('Error checking URL for shared data:', error.message || error);
    }
  }

  /**
   * Start pulsing the badge to draw attention to shared cookies
   */
  function startBadgePulsing() {
    // Don't start a new pulse if one is already running
    if (badgePulseInterval) return;
    
    badgePulseInterval = setInterval(() => {
      const action = browserDetector.getApi().action || browserDetector.getApi().browserAction;
      if (!action) return;
      
      if (badgePulseState) {
        action.setBadgeBackgroundColor({ color: "#FF0000" });
      } else {
        action.setBadgeBackgroundColor({ color: "#FF9900" });
      }
      
      badgePulseState = !badgePulseState;
    }, 750); // Pulse every 750ms
    
    // After 10 seconds, stop pulsing and just show solid color
    setTimeout(() => {
      stopBadgePulsing();
      
      // Set back to red
      const action = browserDetector.getApi().action || browserDetector.getApi().browserAction;
      if (action) {
        action.setBadgeBackgroundColor({ color: "#FF0000" });
      }
    }, 10000);
  }
  
  /**
   * Stop badge pulsing effect
   */
  function stopBadgePulsing() {
    if (badgePulseInterval) {
      clearInterval(badgePulseInterval);
      badgePulseInterval = null;
    }
  }

  isFirefoxAndroid(function (response) {
    if (response) {
      const popupOptions = {
        popup: '/interface/popup-mobile/cookie-list.html',
      };
      browserDetector.getApi().action.setPopup(popupOptions);
    }
  });
  isSafariIos(function (response) {
    if (response) {
      
      const popupOptions = {
        popup: '/interface/popup-mobile/cookie-list.html',
      };
      browserDetector.getApi().action.setPopup(popupOptions);
    }
  });

  if (browserDetector.supportsSidePanel()) {
    browserDetector
      .getApi()
      .sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      // eslint-disable-next-line prettier/prettier
      .catch((error) => {
        
      });
  }

  /**
   * Handle messages from content scripts and other extension components
   * @param {Object} request - The message object
   * @param {Object} sender - The sender info
   * @param {Function} sendResponse - Function to send response
   * @returns {boolean} - Whether the response will be sent asynchronously
   */
  function handleMessage(request, sender, sendResponse) {
    try {
      // Check if this is a shared cookie or profile message
      if (request.type === 'checkForSharedData') {
        if (request.url) {
          checkUrlForSharedCookies(request.url);
        }
        sendResponse({ success: true });
        return false;
      }
      
      // Handle clear shared data request
      if (request.type === 'clearSharedData') {
        resetBadgeState();
        browserDetector.getApi().storage.local.remove('pendingSharedData');
        sendResponse({ success: true });
        return false;
      }
      
      // Handle optionsChanged message
      if (request.type === 'optionsChanged') {
        console.log('Received optionsChanged message, reloading options...');
        optionsHandler.loadOptions().then(() => {
          for (let id in connections) {
            const port = connections[id];
            if (port) {
              try {
                port.postMessage({
                  type: 'optionsChanged',
                });
              } catch (e) {
                console.warn(`Failed to forward optionsChanged to port ${port.name || 'unknown'}:`, e.message);
              }
            }
          }
        }).catch(error => {
          console.error('Error reloading options after optionsChanged message:', error);
        });
        return false;
      }
      
      // Check if this is a permission request for a specific URL
      if (request.type === 'requestPermission') {
        console.log('Received permission request for URL:', request.url);
        
        // Need to handle this async
        permissionHandler.requestPermission(request.url)
          .then(result => {
            console.log('Permission request result:', result);
            if (result && request.url) {
              // Add to our list of permitted domains
              addPermittedDomain(request.url);
            }
            sendResponse({ success: result });
          })
          .catch(error => {
            console.error('Error requesting permission:', error);
            sendResponse({ success: false, error: error.message || 'Unknown error' });
          });
        
        return true; // Will respond asynchronously
      }

      // Check if this is a permission request for ALL URLs
      if (request.type === 'permissionsRequest' && request.params === '<all_urls>') {
        console.log('Received permission request for <all_urls>');
        
        // Need to handle this async
        permissionHandler.requestPermission('<all_urls>')
          .then(result => {
            console.log('Permission request result for <all_urls>:', result);
            sendResponse(result); // Send back true/false based on grant
          })
          .catch(error => {
            console.error('Error requesting <all_urls> permission:', error);
            sendResponse(false); // Send false on error
          });
        
        return true; // Will respond asynchronously
      }
      
      // Check if this is a permission check
      if (request.type === 'checkPermission') {
        console.log('Received permission check for URL:', request.url);
        
        // Need to handle this async
        hasPermissionForUrl(request.url)
          .then(result => {
            console.log('Permission check result:', result);
            sendResponse({ hasPermission: result });
          })
          .catch(error => {
            console.error('Error checking permission:', error);
            sendResponse({ hasPermission: false, error: error.message || 'Unknown error' });
          });
        
        return true; // Will respond asynchronously
      }
      
      // If this is a cookie-related message, check permissions first
      if (['getAllCookies', 'getCookies', 'saveCookie', 'removeCookie'].includes(request.type)) {
        if (request.url) {
          // Add this URL's domain to our permitted list (if we can)
          hasPermissionForUrl(request.url)
            .then(hasPermission => {
              if (hasPermission) {
                addPermittedDomain(request.url);
              }
            })
            .catch(error => {
              console.warn('Error checking permission during cookie request:', error);
            });
        }
      }
      
      // Everything else is handled by the extension listener
      if (request.type && request.type !== 'getCookieCount') {
        for (let id in connections) {
          connections[id].postMessage(request);
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message || 'Unknown error' });
      return false;
    }
  }

  /**
   * Handle connection from popup, content script, or devtools
   * @param {Port} port - The connection port
   */
  function onConnect(port) {
    console.log('New connection established:', port.name);
    
    // Store the connection
    var extensionListener = function (request, port) {
      try {
        if (request.action === 'initCount') {
          // Special handler for cookie count initialization
          const address = request.payload;
          if (address) {
            connections[address] = port;
            port.postMessage({
              action: 'countUpdate',
              payload: { count: 'N/A' }
            });
          }
          return;
        }

        if (request.type) {
          if (request.type === 'getPermissionStatus') {
            // Handle permission status request
            hasPermissionForUrl(request.url)
              .then(result => {
                port.postMessage({ 
                  type: 'permissionResponse', 
                  hasPermission: result 
                });
              })
              .catch(error => {
                console.error('Error getting permission status:', error);
                port.postMessage({ 
                  type: 'permissionResponse', 
                  hasPermission: false,
                  error: error.message || 'Unknown error'
                });
              });
          return;
      }

          // Log cookie operations for debugging purposes
          if (['getAllCookies', 'getCookies', 'saveCookie', 'removeCookie'].includes(request.type)) {
            console.log(`Cookie operation requested: ${request.type}`, 
                         request.url ? `for URL: ${request.url}` : '');
          }
        }
      } catch (error) {
        console.error('Error handling port message:', error);
        port.postMessage({ 
          type: 'error', 
          error: error.message || 'Unknown error in background script'
        });
      }
    };

    // Listen for messages on this connection
    port.onMessage.addListener(extensionListener);

    // Clean up when connection is closed
    port.onDisconnect.addListener(function(port) {
      port.onMessage.removeListener(extensionListener);
          
      // Remove from connections
      for (let id in connections) {
        if (connections[id] === port) {
          delete connections[id];
          break;
        }
      }
    });
  }

  /**
   * Gets the ID of a tab with the same domain from an url.
   * @return {Promise}
   */
  function getTabId(url) {
    return new Promise(function (resolve) {
      browserDetector.getApi().tabs.query({}, function (tabs) {
        if (!tabs) {
          return resolve(null);
        }
        for (let i = 0; i < tabs.length; i++) {
          if (tabs[i].url.indexOf(getDomainFromUrl(url)) != -1) {
            return resolve(tabs[i].id);
          }
        }
        resolve(null);
      });
    });
  }

  /**
   * Gets the domain of an URL.
   * @param {string} url URL to extract the domain from.
   * @return {string} The domain extracted.
   */
  function getDomainFromUrl(url) {
    if (!url) return '';
    const matches = url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
    return matches && matches[1];
  }

  /**
   * Sends a message to all the clients of this script.
   * @param {string} type Type of message to send.
   * @param {object} params Payload of the message.
   */
  function sendMessageToAllTabs(type, params) {
    const tabs = Object.keys(connections);

    for (let i = 0; i < tabs.length; i++) {
      const port = connections[tabs[i]];
      // Check if port exists before trying to post (belt-and-suspenders)
      if (port) { 
        try {
          port.postMessage({
            type: type,
            params: params,
          });
        } catch (e) {
          console.warn(`Failed to send message type '${type}' to port ${port.name || 'unknown'}:`, e.message);
          // Optionally, consider disconnecting/removing the port here if postMessage fails
          // delete connections[tabs[i]]; 
          // port.disconnect(); 
        }
      }
    }
  }

  /**
   * Get notified of changes in the cookies.
   * @param {object} changeInfo Information about the change that happened.
   * Sends the tab id key to all connections of ther broadcast.
   */
  function onCookiesChanged(changeInfo) {
    if (Object.keys(connections).length === 0) {
      return;
    }

    // Skip changes for known dynamic cookies that update frequently
    if (changeInfo && changeInfo.cookie) {
      const name = changeInfo.cookie.name;
      // Skip known or detected dynamic cookies
      if (dynamicCookieNames.has(name)) {
        return;
      }
      // Detect dynamic cookies by change frequency
      const now = Date.now();
      if (!cookieChangeHistory[name]) {
        cookieChangeHistory[name] = [];
      }
      cookieChangeHistory[name].push(now);
      // Keep only recent changes within detection window
      cookieChangeHistory[name] = cookieChangeHistory[name].filter(timestamp => now - timestamp <= dynamicDetectionWindow);
      // Remove empty history entries to prevent memory buildup
      if (cookieChangeHistory[name].length === 0) {
        delete cookieChangeHistory[name];
      }
      // If changes exceed threshold, mark as dynamic and skip
      if (cookieChangeHistory[name].length > dynamicDetectionThreshold) {
        dynamicCookieNames.add(name);
        return;
      }
    }

    // Clear any existing timeout to debounce rapid changes
    if (cookieChangeTimeout !== null) {
      clearTimeout(cookieChangeTimeout);
    }
    
    // Set a timeout to delay sending the update
    cookieChangeTimeout = setTimeout(function() {
      cookieChangeTimeout = null;
      
      // Only send the message when the timeout fires
      for (const tabId in connections) {
        if (tabId.indexOf('options-') === 0) {
          continue;
        }
        const port = connections[tabId];
        // Check if port exists before trying to post
        if (port) {
          try {
            port.postMessage({
              type: 'cookiesChanged',
              params: {
                changeInfo: changeInfo,
              },
            });
          } catch (e) {
             console.warn(`Failed to send cookiesChanged message to port ${port.name || 'unknown'}:`, e.message);
             // Optionally remove problematic port
             // delete connections[tabId];
             // port.disconnect();
          }
        }
      }
    }, 800); // Increased debounce delay to reduce frequency of updates
  }

  /**
   * Gets notified when a tab has been updated.
   * @param {number} tabId Id of the tab that has been updated.
   * @param {object} changeInfo Information about the change in the tab.
   * @param {Tab} tab New state of the tab.
   */
  function onTabsChanged(tabId, changeInfo, tab) {
    // Only process complete page loads or URL changes
    if (changeInfo.status !== 'complete' && !changeInfo.url) {
      return;
    }
    
    // Always check if we have permission and if so, check for shared cookies
    hasPermissionForUrl(tab.url).then(hasPermission => {
      if (hasPermission) {
        checkUrlForSharedCookies(tab.url);
      }
    }).catch(error => {
      console.error('Error checking permissions for URL:', error);
    });
    
    // Handle tab change notifications
    if (Object.keys(connections).length === 0 && !browserDetector.getApi().runtime.sendMessage) {
      // No connections and no way to broadcast, so return
      return;
    }

    // Send a 'requestCookieRefresh' message via runtime.sendMessage to reach popup/sidepanel listeners
    try {
      browserDetector.getApi().runtime.sendMessage({
        action: 'requestCookieRefresh', // Use 'action' to match listener
        tabId: tabId,
        url: tab.url // Include the updated URL
      }).catch(error => {
        // Explicitly handle the "Receiving end does not exist" error.
        // This is expected if no UI (popup, sidepanel, devtools) is open to receive the message.
        if (error.message.includes('Receiving end does not exist')) {
           // Log as a warning, not an error, as this is expected behavior.
           // console.warn('No active UI found to receive requestCookieRefresh message.'); // Optional: uncomment for debugging
           return; // Explicitly return to mark the promise as handled.
        } else {
          // Log other unexpected errors.
          console.error('Error sending requestCookieRefresh message:', error);
        }
      });
    } catch (error) {
        console.error('Error attempting to send requestCookieRefresh message:', error);
    }

    // Commented out old connection-based message
    // sendMessageToAllTabs('requestCookieRefresh', {
    //   tabId: tabId,
    //   url: tab.url // Include the updated URL
    // });

    // Commented out original devtools message
    // if (connections[tabId]) { 
    //   const port = connections[tabId];
    //   port.postMessage({
    //     type: 'tabChanged', 
    //     params: {
    //       changeInfo: changeInfo,
    //       tab: tab,
    //     },
    //   });
    // }
  }

  /**
   * Checks if the current browser is firefox android.
   * @param {function} callback
   */
  function isFirefoxAndroid(callback) {
    if (browserDetector.isFirefox() && browserDetector.isMobile()) {
      callback(true);
      return;
    }

    callback(false);
    return;
  }

  /**
   * Checks if the current browser is safari iOS.
   * @param {function} callback
   */
  function isSafariIos(callback) {
    if (browserDetector.isSafari() && browserDetector.isMobile()) {
      callback(true);
      return;
    }

    callback(false);
    return;
  }

  /**
   * Set up a listener to redirect the options page based on user preference
   */
  function setupOptionsRedirect() {
    try {
      // Safari doesn't support chrome.runtime.onOpenOptionsPage
      if (browserDetector.isSafari()) {
        return;
      }

      const api = browserDetector.getApi();
      if (api.runtime.onOpenOptionsPage) {
        api.runtime.onOpenOptionsPage.addListener(async () => {
          // Load options to get the latest preference
          await optionsHandler.loadOptions();
          const preferredPage = optionsHandler.getPreferredOptionsPage();
          
          // Open the appropriate options page based on preference
          if (preferredPage === 'v2') {
            // Open v2 in a new tab
            api.tabs.create({
              url: api.runtime.getURL('interface/options/options-v2.html')
            });
          } else {
            // Open original options as a popup
            api.runtime.openOptionsPage();
          }
          
          // Prevent the default options page from opening
          return true;
        });
      }
    } catch (error) {
      console.error('Error setting up options redirect:', error);
    }
  }
})();

