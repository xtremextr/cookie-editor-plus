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
    if (url === '') {
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
   * specific url.
   * @param {string} url Url to check.
   * @return {Promise}
   */
  async checkPermissions(url) {
    // First check if this URL can have permissions at all
    if (!this.canHavePermissions(url)) {
      return false;
    }
    
    // If we don't have access to the permission API, assume we have
    // access. Safari devtools can't access the API.
    if (typeof this.browserDetector.getApi().permissions === 'undefined') {
      return true;
    }

    // Validate URL format to ensure we don't even try to create invalid permission patterns
    try {
      const urlObj = new URL(url);
      // Additional check for schemes that are known to cause "Invalid scheme" errors
      if (this.impossibleUrls.some(scheme => urlObj.protocol.startsWith(scheme.replace(':', '')))) {
        return false;
      }
      
      const testPermission = {
        origins: []
      };
      
      const { protocol, hostname } = urlObj;
      const rootDomain = this.getRootDomainName(hostname);
      
      // Only add patterns for supported schemes (http, https, ws, wss)
      if (/^(https?|wss?):$/.test(protocol)) {
        testPermission.origins = [
          `${protocol}//${hostname}/*`,
          `${protocol}//*.${rootDomain}/*`,
          // Add HTTP versions as well to cover non-secure cookies
          `http://${hostname}/*`,
          `http://*.${rootDomain}/*`,
          // Add HTTPS versions explicitly in case protocol was http
          `https://${hostname}/*`,
          `https://*.${rootDomain}/*`,
        ];
        
        try {
          return await this.browserDetector
            .getApi()
            .permissions.contains(testPermission);
        } catch (error) {
          console.warn('Permission check failed:', error);
          return false;
        }
      } else {
        // Unsupported scheme for permissions API
        return false;
      }
    } catch (err) {
      // If URL parsing fails, return false as we can't properly check permissions
      return false;
    }
  }

  /**
   * Requests permissions to access the cookies for a specific url.
   * @param {string} url Url to request permissions.
   * @return {Promise}
   */
  async requestPermission(url) {
    // First check if this URL can have permissions at all
    if (!this.canHavePermissions(url)) {
      return false;
    }
    
    const permission = {
      origins: [url],
    };
    // Special case: support requesting permissions for all URLs
    if (url !== '<all_urls>') {
      try {
        const { protocol, hostname } = new URL(url);
        const rootDomain = this.getRootDomainName(hostname);
        permission.origins = [
          `${protocol}//${hostname}/*`,
          `${protocol}//*.${rootDomain}/*`,
          // Add HTTP versions as well to cover non-secure cookies
          `http://${hostname}/*`,
          `http://*.${rootDomain}/*`,
          // Add HTTPS versions explicitly in case protocol was http
          `https://${hostname}/*`,
          `https://*.${rootDomain}/*`,
        ];
      } catch (err) {
        // If URL parsing fails, return false as we can't properly request permissions
        return false;
      }
    }
    
    // Request the permission
    try {
      const result = await this.browserDetector.getApi().permissions.request(permission);
      
      // If permission was granted, store the domain in our tracking list
      if (result) {
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
            }, () => {
              // console.log(`Added ${domainToAdd} to permitted domains list`);
            });
          }
        } catch (error) {
          console.error('Error updating permitted domains:', error);
        }
      }
      
      return result;
    } catch (error) {
      console.warn('Permission request failed:', error);
      return false;
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
