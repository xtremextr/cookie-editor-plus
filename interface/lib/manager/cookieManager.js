import { EventEmitter } from '../eventEmitter.js';

/**
 * Cookie Manager class to handle cookie management functionality
 */
export class CookieManager extends EventEmitter {
  /**
   * Constructs a CookieManager
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super();
    this.browserDetector = browserDetector;
    this.api = browserDetector.getApi();
  }

  /**
   * Get all cookies across all domains
   * @returns {Promise<Array>} Promise resolving to array of all cookies
   */
  async getAllCookies() {
    return new Promise((resolve) => {
      this.api.cookies.getAll({}, (cookies) => {
        resolve(cookies);
      });
    });
  }

  /**
   * Get cookies for a specific domain
   * @param {string} domain Domain to get cookies for
   * @returns {Promise<Array>} Promise resolving to array of domain cookies
   */
  async getCookiesForDomain(domain) {
    return new Promise((resolve) => {
      this.api.cookies.getAll({ domain }, (cookies) => {
        resolve(cookies);
      });
    });
  }

  /**
   * Delete a specific cookie
   * @param {Object} cookie Cookie object to delete
   * @returns {Promise<boolean>} Promise resolving to success status
   */
  async deleteCookie(cookie) {
    const url = this.buildUrl(cookie);
    return new Promise((resolve) => {
      this.api.cookies.remove({ 
        url,
        name: cookie.name,
        storeId: cookie.storeId || null
      }, () => {
        resolve(true);
      });
    });
  }

  /**
   * Update or create a cookie
   * @param {Object} cookie Cookie object to update or create
   * @returns {Promise<Object>} Promise resolving to updated cookie
   */
  async updateCookie(cookie) {
    const url = this.buildUrl(cookie);
    return new Promise((resolve, reject) => {
      try {
        // Create the cookie object for the API
        const cookieData = {
          url,
          name: cookie.name,
          value: cookie.value || "",
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'lax',
          storeId: cookie.storeId || null
        };
        
        // Only include domain if it's not a host-only cookie
        if (!cookie.hostOnly && cookie.domain) {
          cookieData.domain = cookie.domain;
        }
        
        // Include expiration date if present (session cookies don't have this)
        if (cookie.expirationDate) {
          cookieData.expirationDate = cookie.expirationDate;
        }
        
        // Set the cookie
        this.api.cookies.set(cookieData, (updatedCookie) => {
          const error = chrome.runtime.lastError;
          if (error) {
            console.error('Cookie API error:', error);
            reject(new Error(error.message || 'Failed to set cookie'));
          } else {
            resolve(updatedCookie);
          }
        });
      } catch (error) {
        console.error('Error in updateCookie:', error);
        reject(error);
      }
    });
  }

  /**
   * Import cookies from JSON data
   * @param {Array} cookiesData Array of cookie objects to import
   * @returns {Promise<Array>} Promise resolving to array of created cookies
   */
  async importCookies(cookiesData) {
    const results = [];
    
    for (const cookieData of cookiesData) {
      try {
        const result = await this.updateCookie(cookieData);
        results.push(result);
      } catch (error) {
        console.error('Failed to import cookie:', cookieData, error);
      }
    }
    
    return results;
  }

  /**
   * Build URL from cookie for API calls
   * @param {Object} cookie Cookie object
   * @returns {string} URL for cookie
   */
  buildUrl(cookie) {
    const prefix = cookie.secure ? 'https://' : 'http://';
    // If domain is null (for host-only cookies), use current tab's domain
    // In extensions, we can use window.location for options page or the current activeTab
    let domain = cookie.domain;
    
    if (!domain || domain === null) {
      // Try to get from window.location
      try {
        domain = window.location.hostname;
      } catch (e) {
        // Default to a generic domain if we can't get current hostname
        domain = "example.com";
        console.warn("Could not determine domain for host-only cookie, using default");
      }
    }
    
    // Remove leading dot if present, as URLs can't have leading dots
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }
    
    return `${prefix}${domain}${cookie.path || '/'}`;
  }
} 