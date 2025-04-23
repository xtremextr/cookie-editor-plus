import { GenericCookieHandler } from '../lib/genericCookieHandler.js';

/**
 * implements Cookie API handling for the popup and other similar interfaces.
 */
export class CookieHandlerPopup extends GenericCookieHandler {
  /**
   * Constructs and initializes the cookie handler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super(browserDetector);
    
    this.dynamicCookies = new Set(['_dd_s', 'datadome']);
    this.cookieChangeHistory = {};
    this.dynamicDetectionThreshold = 3;
    this.dynamicDetectionWindow = 3500;

    this.isReady = false;
    this.currentTabId = null;

    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .tabs.query({ active: true, currentWindow: true })
        .then(this.init);
    } else {
      this.browserDetector
        .getApi()
        .tabs.query({ active: true, currentWindow: true }, this.init);
    }
  }

  /**
   * Initialise the cookie handler after getting our first contact with the
   * current tab.
   * @param {*} tabInfo Info about the current tab.
   */
  init = (tabInfo) => {
    this.currentTabId = tabInfo[0].id;
    this.currentTab = tabInfo[0];
    const api = this.browserDetector.getApi();
    api.tabs.onUpdated.addListener(this.onTabsChanged);
    api.tabs.onActivated.addListener(this.onTabActivated);
    if (!this.browserDetector.isSafari()) {
      api.cookies.onChanged.addListener(this.onCookiesChanged);
    }

    this.emit('ready');
    this.isReady = true;
  };

  /**
   * Handles events that is triggered when a cookie changes.
   * @param {object} changeInfo An object containing details of the change that
   *     occurred.
   */
  onCookiesChanged = (changeInfo) => {
    // Skip if domain or tab info is missing
    if (!this.currentTab || !this.currentTab.url || !changeInfo.cookie.domain) {
      return;
    }
    
    // Throttle event handling to reduce race conditions
    if (this._isProcessingCookieChange) {
      // Queue this change for later if already processing
      if (!this._pendingCookieChanges) {
        this._pendingCookieChanges = [];
      }
      this._pendingCookieChanges.push({
        timestamp: Date.now(),
        changeInfo: changeInfo
      });
      return;
    }
    
    this._processCookieChange(changeInfo);
  };
  
  /**
   * Process cookie change with race condition handling
   * @param {object} changeInfo - Information about the cookie change
   * @private
   */
  _processCookieChange = (changeInfo) => {
    // Set flag to prevent re-entry
    this._isProcessingCookieChange = true;
    
    try {
      if (changeInfo.cookie) {
        const name = changeInfo.cookie.name;
        if (this.dynamicCookies.has(name)) {
          return;
        }
        const now = Date.now();
        if (!this.cookieChangeHistory[name]) {
          this.cookieChangeHistory[name] = [];
        }
        this.cookieChangeHistory[name].push(now);
        this.cookieChangeHistory[name] = this.cookieChangeHistory[name].filter(timestamp => now - timestamp <= this.dynamicDetectionWindow);
        if (this.cookieChangeHistory[name].length > this.dynamicDetectionThreshold) {
          this.dynamicCookies.add(name);
          return;
        }
      }
      
      // Get domain from the cookie
      const domain = changeInfo.cookie.domain.startsWith('.') ? 
        changeInfo.cookie.domain.substring(1) : 
        changeInfo.cookie.domain;
      
      // Only emit change events if:
      // 1. The domain matches the current tab URL
      // 2. The cookie store ID matches
      // 3. The change is relevant (not just a same-value update)
      if (
        this.currentTab.url.indexOf(domain) !== -1 &&
        changeInfo.cookie.storeId === (this.currentTab.cookieStoreId || '0') &&
        (changeInfo.cause === 'explicit' || changeInfo.removed)
      ) {
        // Create a unique timestamp for this change
        const changeTimestamp = Date.now();
        
        // We store the last change timestamp to filter out rapid duplicate events
        // Increase minimum time between changes to 1000ms (1 second)
        if (!this._lastChangeTimestamp || changeTimestamp - this._lastChangeTimestamp > 1000) {
          this._lastChangeTimestamp = changeTimestamp;
          this.emit('cookiesChanged', changeInfo);
        } else {
//          console.log('Throttling cookie change event, too soon after previous change');
        }
      }
    } finally {
      // Clear the processing flag
      this._isProcessingCookieChange = false;
      
      // Process any pending changes
      if (this._pendingCookieChanges && this._pendingCookieChanges.length > 0) {
        // Sort by timestamp to process in order
        this._pendingCookieChanges.sort((a, b) => a.timestamp - b.timestamp);
        
        // Take the first change and process it
        const nextChange = this._pendingCookieChanges.shift();
        
        // Schedule the processing to happen after a longer delay
        setTimeout(() => {
          this._processCookieChange(nextChange.changeInfo);
        }, 500); // Increased from 10ms to 500ms for more throttling
      }
    }
  };

  /**
   * Handles the event that is fired when a tab is updated.
   * @param {object} tabId Id of the tab that changed.
   * @param {object} changeInfo Properties of the tab that changed.
   * @param {object} _tab
   */
  onTabsChanged = (tabId, changeInfo, _tab) => {
    if (
      tabId === this.currentTabId &&
      (changeInfo.url || changeInfo.status === 'complete')
    ) {
      
      if (this.browserDetector.supportsPromises()) {
        this.browserDetector
          .getApi()
          .tabs.query({ active: true, currentWindow: true })
          .then(this.updateCurrentTab);
      } else {
        this.browserDetector
          .getApi()
          .tabs.query(
            { active: true, currentWindow: true },
            this.updateCurrentTab,
          );
      }
    }
  };

  /**
   * Event handler for when a tab is being activated.
   * @param {object} activeInfo Info about the event.
   */
  onTabActivated = (activeInfo) => {
    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .tabs.query({ active: true, currentWindow: true })
        .then(this.updateCurrentTab);
    } else {
      this.browserDetector
        .getApi()
        .tabs.query(
          { active: true, currentWindow: true },
          this.updateCurrentTab,
        );
    }
  };

  /**
   * Emits a signal that the current tab changed if needed.
   * @param {object} tabInfo Info about the new current tab.
   */
  updateCurrentTab = (tabInfo) => {
    const newTab =
      tabInfo[0].id !== this.currentTabId ||
      tabInfo[0].url !== this.currentTab.url;
    this.currentTabId = tabInfo[0].id;
    this.currentTab = tabInfo[0];

    if (newTab && this.isReady) {
      // Reset change timestamp when tab changes
      this._lastChangeTimestamp = null;
      this.emit('cookiesChanged');
    }
  };
}

