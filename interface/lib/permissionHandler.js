/**
 * interface/devtools/permissionHandler.js needs to be kept in sync to the functions in this file
 */
export class PermissionHandler {
  /**
   * Constructs a PermissionHandler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    this.browserDetector = browserDetector;
    // Urls that start with these values can't be requested for permission.
    this.impossibleUrls = [
      'about:',
      'moz-extension:',
      'chrome:',
      'chrome-extension:',
      'edge:',
      'safari-web-extension:',
    ];
    
    // Cache for permission checks
    this.permissionCache = {};
    this.cacheExpiration = 60000; // 1 minute in ms
  }

  /**
   * Check if it is possible for a website to have permissions. for example, on
   * firefox, it is impossible to check for permission on internal pages
   * (about:[...]).
   * @param {*} url Url to check.
   * @return {boolean} True if it's possible to request permission, otherwise
   *     false.
   */
  canHavePermissions(url) {
    if (!url || url === '') {
      return false;
    }
    
    for (const impossibleUrl of this.impossibleUrls) {
      if (url.indexOf(impossibleUrl) === 0) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Checks if the extension has permissions to access the cookies for a
   * specific url. Now checks for both HTTP and HTTPS origins for the domain.
   * @param {string} url Url to check.
   * @param {boolean} [forceRecheck=false] If true, bypasses the cache for this check.
   * @return {Promise<boolean>}
   */
  async checkPermissions(url, forceRecheck = false) {
    // Check cache first, unless forceRecheck is true
    const now = Date.now();
    if (!forceRecheck && this.permissionCache[url] && 
        now - this.permissionCache[url].timestamp < this.cacheExpiration) {
      return this.permissionCache[url].hasPermission;
    }
    
    // First check if this URL can have permissions at all
    if (!this.canHavePermissions(url) && url !== '<all_urls>') {
      this.cacheResult(url, false);
      return false;
    }
    
    // If we don't have access to the permission API, assume we have
    // access. Safari devtools can't access the API.
    if (typeof this.browserDetector.getApi().permissions === 'undefined') {
      this.cacheResult(url, true);
      return true;
    }

    // Special case: check for <all_urls> permission
    if (url === '<all_urls>') {
      try {
        const testPermission = {
          origins: ['<all_urls>']
        };
        const result = await this.browserDetector.getApi().permissions.contains(testPermission);
        this.cacheResult(url, result);
        return result;
      } catch (error) {
        console.warn('Permission check for <all_urls> failed:', error);
        this.cacheResult(url, false);
        return false;
      }
    }

    // Validate URL format to ensure we don't even try to create invalid permission patterns
    try {
      const urlObj = new URL(url);
      const { hostname } = urlObj;
      const rootDomain = this.getRootDomainName(hostname);
      // Always check both http and https origins for this domain
      const origins = [
        `https://${hostname}/*`,
        `http://${hostname}/*`,
        `https://*.${rootDomain}/*`,
        `http://*.${rootDomain}/*`
      ];
      const testPermission = { origins };
      try {
        const result = await this.browserDetector.getApi().permissions.contains(testPermission);
        this.cacheResult(url, result);
        return result;
      } catch (error) {
        console.warn('Permission check failed:', error);
        this.cacheResult(url, false);
        return false;
      }
    } catch (err) {
      // If URL parsing fails, return false as we can't properly check permissions
      console.warn('URL parsing failed in permission check:', err);
      this.cacheResult(url, false);
      return false;
    }
  }

  /**
   * Cache a permission check result
   * @param {string} url - URL that was checked
   * @param {boolean} result - Permission result
   */
  cacheResult(url, result) {
    this.permissionCache[url] = {
      hasPermission: result,
      timestamp: Date.now()
    };
  }

  /**
   * Clear permission cache for a specific URL or all URLs
   * @param {string} [url] - Optional URL to clear cache for. If not provided, all cache is cleared.
   */
  clearCache(url) {
    if (url) {
      delete this.permissionCache[url];
    } else {
      this.permissionCache = {};
    }
  }

  /**
   * Requests permissions to access the cookies for a specific url.
   * Now always requests both HTTP and HTTPS origins for the domain.
   * @param {string} url Url to request permissions.
   * @return {Promise<boolean>}
   */
  async requestPermission(url) {
    // First check if this URL can have permissions at all
    if (!this.canHavePermissions(url) && url !== '<all_urls>') {
      return false;
    }
    
    // Special case: support requesting permissions for all URLs
    if (url === '<all_urls>') {
      const permission = {
        origins: ['<all_urls>']
      };
      
      try {
        const result = await this.browserDetector.getApi().permissions.request(permission);
        
        // Clear the cache on permission change
        this.clearCache(url);
        
        // Notify anyone listening about permission change
        this.notifyPermissionChange(url, result);
        
        return result;
      } catch (error) {
        console.warn('Permission request failed for <all_urls>:', error);
        return false;
      }
    }
    
    // Always request both http and https origins for the domain
    try {
      const urlObj = new URL(url);
      const { hostname } = urlObj;
      const rootDomain = this.getRootDomainName(hostname);
      const permission = {
        origins: [
          `https://${hostname}/*`,
          `http://${hostname}/*`,
          `https://*.${rootDomain}/*`,
          `http://*.${rootDomain}/*`
        ]
      };
      // Request the permission
      const result = await this.browserDetector.getApi().permissions.request(permission);
      // Clear the cache on permission change
      this.clearCache(url);
      // Notify anyone listening about permission change
      this.notifyPermissionChange(url, result);
      // If permission was granted, store the domain in our tracking list
      if (result) {
        this.storePermittedDomain(url);
      }
      return result;
    } catch (error) {
      console.warn('Permission request failed:', error);
      return false;
    }
  }
  
  /**
   * Notify background script about permission change
   * @param {string} url - URL that changed
   * @param {boolean} granted - Whether permission was granted
   */
  async notifyPermissionChange(url, granted) {
    try {
      await this.browserDetector.getApi().runtime.sendMessage({
        type: 'permission-changed',
        url: url,
        granted: granted
      });
    } catch (error) {
      // Ignore failures in message sending
      console.warn('Failed to notify about permission change:', error);
    }
  }
  
  /**
   * Store a permitted domain for future reference
   * @param {string} url - URL to store
   */
  async storePermittedDomain(url) {
    try {
      // Get current list of permitted domains
      const storageObj = await new Promise(resolve => {
        this.browserDetector.getApi().storage.local.get('permittedDomains', resolve);
      });
      
      // Extract domain and add to list
      const domainToAdd = this.extractDomainFromUrl(url);
      let permittedDomains = (storageObj && storageObj.permittedDomains) || [];
      
      if (domainToAdd && !permittedDomains.includes(domainToAdd)) {
        permittedDomains.push(domainToAdd);
        this.browserDetector.getApi().storage.local.set({
          permittedDomains: permittedDomains
        });
      }
    } catch (error) {
      console.error('Error updating permitted domains:', error);
    }
  }
  
  /**
   * Extract domain from URL
   * @param {string} url - URL to extract domain from
   * @returns {string|null} - Domain or null if invalid
   */
  extractDomainFromUrl(url) {
    try {
      const { hostname } = new URL(url);
      return hostname;
    } catch (err) {
      return null;
    }
  }

  /**
   * Gets the root domain of an URL
   * @param {string} domain
   * @return {string}
   */
  getRootDomainName(domain) {
    const parts = domain.split('.').reverse();
    const cnt = parts.length;
    if (cnt >= 3) {
      // see if the second level domain is a common SLD.
      if (parts[1].match(/^(com|edu|gov|net|mil|org|nom|co|name|info|biz)$/i)) {
        return parts[2] + '.' + parts[1] + '.' + parts[0];
      }
    }
    return parts[1] + '.' + parts[0];
  }
}


