import { BrowserDetector } from './interface/lib/browserDetector.js';
import { PermissionHandler } from './interface/lib/permissionHandler.js';
import { extractSharedDataFromUrl } from './interface/lib/sharing/cookieSharing.js';

(function () {
  
  // TODO: Separate connections from CookieHandler and OptionsHandler.
  // It would also be cool to separate their whole behavior in separate class
  // that extends a generic one.
  const connections = {};
  const browserDetector = new BrowserDetector();
  const permissionHandler = new PermissionHandler(browserDetector);

  // Track domains we have permission for
  const permittedDomains = new Set();
  
  // Variables for badge pulsing effect
  let badgePulseInterval = null;
  let badgePulseState = false;
  
  // Variable for cookie change debouncing
  let cookieChangeTimeout = null;

  browserDetector.getApi().runtime.onConnect.addListener(onConnect);
  browserDetector.getApi().runtime.onMessage.addListener(handleMessage);
  browserDetector.getApi().tabs.onUpdated.addListener(onTabsChanged);

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
        action.setBadgeText({ text: "" });
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
          action.setBadgeText({ text: text });
        }
        if (action.setBadgeBackgroundColor) {
          action.setBadgeBackgroundColor({ color: color });
        }
        if (action.setTitle) {
          action.setTitle({ title: title });
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
      if (result && result.permittedDomains && Array.isArray(result.permittedDomains)) {
        result.permittedDomains.forEach(domain => permittedDomains.add(domain));
        console.log('Loaded permitted domains:', permittedDomains.size);
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
      return await permissionHandler.checkPermissions(url);
    } catch (error) {
      console.error('Error checking permissions:', error);
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
      const sharedData = extractSharedDataFromUrl(url);
      if (!sharedData) return;
      
      const dataType = sharedData.type || 'cookies';
      const isProfiles = dataType === 'profiles';
      
      console.log(`Background: Found shared ${dataType} in URL:`, url);
      
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
      console.error('Error checking URL for shared data:', error);
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
   * Handles messages coming from the front end, mostly from the dev tools.
   * Devtools require special handling because not all APIs are available in
   * there, such as tab and permissions.
   * @param {object} request contains the message.
   * @param {MessageSender} sender references the sender of the message, not
   *    used.
   * @param {function} sendResponse callback to respond to the sender.
   * @return {boolean} sometimes
   */
  function handleMessage(request, sender, sendResponse) {
    
    switch (request.type) {
      case 'getTabs': {
        browserDetector.getApi().tabs.query({}, function (tabs) {
          sendResponse(tabs);
        });
        return true;
      }
      case 'getCurrentTab': {
        browserDetector
          .getApi()
          .tabs.query(
            { active: true, currentWindow: true },
            function (tabInfo) {
              sendResponse(tabInfo);
            },
          );
        return true;
      }
      case 'getAllCookies': {
        const getAllCookiesParams = {
          url: request.params.url,
        };
        if (browserDetector.supportsPromises()) {
          browserDetector
            .getApi()
            .cookies.getAll(getAllCookiesParams)
            .then(sendResponse);
        } else {
          browserDetector
            .getApi()
            .cookies.getAll(getAllCookiesParams, sendResponse);
        }
        return true;
      }
      case 'saveCookie': {
        if (browserDetector.supportsPromises()) {
          browserDetector
            .getApi()
            .cookies.set(request.params.cookie)
            .then(
              (cookie) => {
                sendResponse(null, cookie);
              },
              (error) => {
                
                sendResponse(error.message, null);
              },
            );
        } else {
          browserDetector
            .getApi()
            .cookies.set(request.params.cookie, (cookie) => {
              if (cookie) {
                sendResponse(null, cookie);
              } else {
                const error = browserDetector.getApi().runtime.lastError;
                
                sendResponse(error.message, cookie);
              }
            });
        }
        return true;
      }
      case 'removeCookie': {
        const removeParams = {
          name: request.params.name,
          url: request.params.url,
        };
        if (browserDetector.supportsPromises()) {
          browserDetector
            .getApi()
            .cookies.remove(removeParams)
            .then(sendResponse);
        } else {
          browserDetector.getApi().cookies.remove(removeParams, sendResponse);
        }
        return true;
      }
      case 'permissionsContains': {
        permissionHandler.checkPermissions(request.params).then(sendResponse);
        return true;
      }
      case 'permissionsRequest': {
        // When a permission is granted, add it to our permitted domains list
        permissionHandler.requestPermission(request.params).then((result) => {
          if (result) {
            addPermittedDomain(request.params);
          }
          sendResponse(result);
        });
        return true;
      }
      case 'optionsChanged': {
        sendMessageToAllTabs('optionsChanged', {
          from: request.params.from,
        });
        return true;
      }
      case 'updateBadge': {
        // Update badge for cookie sharing/importing
        try {
          if (request.params && request.params.text) {
            updateBadge(
              request.params.text,
              request.params.color || "#FF0000",
              request.params.title || "Cookie-Editor Plus"
            );
          } else {
            resetBadgeState();
          }
          sendResponse({ success: true });
        } catch (error) {
          console.error('Error updating badge:', error);
          sendResponse({ success: false, error: error.message });
        }
        return true;
      }
      case 'clearBadge': {
        // Clear the badge when requested (after cookies are imported)
        resetBadgeState();
        return true;
      }
      case 'checkForSharedCookies': {
        // Check the current tab for shared cookies
        if (request.params && request.params.url) {
          checkUrlForSharedCookies(request.params.url);
        }
        return true;
      }
    }
  }

  /**
   * Handles connections from clients to this script.
   * @param {Port} port An object which allows two way communication with other
   *    pages.
   */
  function onConnect(port) {
    const extensionListener = function (request, port) {
      
      switch (request.type) {
        case 'init_cookieHandler':
          
          connections[request.tabId] = port;
          return;
        case 'init_optionsHandler':
          
          connections[port.name] = port;
          return;
      }

      // other message handling.
    };

    // Listen to messages sent from the DevTools page.
    port.onMessage.addListener(extensionListener);

    port.onDisconnect.addListener(function (port) {
      port.onMessage.removeListener(extensionListener);
      const tabs = Object.keys(connections);
      for (let i = 0; i < tabs.length; i++) {
        if (connections[tabs[i]] === port) {
          
          delete connections[tabs[i]];
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
      port.postMessage({
        type: type,
        params: params,
      });
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
        port.postMessage({
          type: 'cookiesChanged',
          params: {
            changeInfo: changeInfo,
          },
        });
      }
    }, 1500); // Add a 1.5 second debounce time
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
    
    // Check if this is a URL we have permission for
    if (tab.url) {
      const domain = getDomainFromUrl(tab.url);
      
      // If this domain is in our permitted list or we find we have permission for it
      if (domain && permittedDomains.has(domain)) {
        console.log('Background: Checking permitted domain for shared cookies:', domain);
        
        // Proactively check for shared cookies since we have permission
        checkUrlForSharedCookies(tab.url);
      } else if (domain) {
        // Check if we actually have permission for this domain
        hasPermissionForUrl(tab.url).then(hasPermission => {
          if (hasPermission) {
            console.log('Background: Adding domain to permitted list:', domain);
            // Add to permitted domains and check for shared cookies
            permittedDomains.add(domain);
            savePermittedDomains();
            checkUrlForSharedCookies(tab.url);
          }
        }).catch(error => {
          console.error('Error checking permissions for URL:', error);
        });
      }
    }
    
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
        // Ignore errors like "Could not establish connection. Receiving end does not exist."
        // which happen if no popup/sidepanel is open.
        if (!error.message.includes('Receiving end does not exist')) {
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
})();
