import { EventEmitter } from './eventEmitter.js';

/**
 * Class used to implement basic common Cookie API handling.
 */
export class GenericCookieHandler extends EventEmitter {
  /**
   * Constructs a GenericCookieHandler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super();
    this.cookies = [];
    this.currentTab = null;
    this.browserDetector = browserDetector;
  }

  /**
   * Gets all cookie for the current tab.
   * @param {function} callback
   */
  getAllCookies(callback) {
    // Prepare filter parameters, omitting storeId to use the default context
    const filter = {};

    // Always prefer filtering by URL if available, as it correctly handles
    // domain/subdomain matching according to Chrome's cookie rules.
    if (this.currentTab && this.currentTab.url) {
      // Ensure we have a valid URL (e.g., ignore chrome://, file:// if needed, although cookies API handles this)
      if (this.currentTab.url.startsWith('http:') || this.currentTab.url.startsWith('https:')) {
          filter.url = this.currentTab.url;
      } else {
          // Optionally handle non-http(s) URLs if necessary, e.g., extract domain manually
          // For now, let's stick to URL filtering for http/https where cookies are standard
          const domain = this.currentTab.url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i)?.[1];
          if (domain) {
              filter.domain = domain; // Fallback to domain filter for non-http(s) if domain is extractable
          } else {
               console.error("Cannot get cookies: No valid HTTP(S) URL or extractable domain found for the current tab.");
               callback([]);
               return;
          }
      }
    } else {
      // Cannot get cookies without a URL
      console.error("Cannot get cookies: No URL found for the current tab.");
      callback([]); // Return empty array or handle error appropriately
      return;
    }

    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.getAll(filter) // Use the filter object
        .then(callback, function (e) {
          console.error("Error getting cookies (Promise):", e);
          callback([]); // Pass empty array on error
        });
    } else {
      this.browserDetector.getApi().cookies.getAll(
        filter, // Use the filter object
        (cookies) => {
            const error = this.browserDetector.getApi().runtime.lastError;
            if (error) {
                console.error("Error getting cookies (Callback):", error);
                callback([]); // Pass empty array on error
            } else {
                callback(cookies);
            }
        }
      );
    }
  }

  /**
   * Gets all cookies for a specific domain.
   * @param {string} domain The domain to get cookies for.
   * @param {function} callback
   */
  getCookiesForDomain(domain, callback) {
    if (!domain) {
      return this.getAllCookies(callback);
    }
    
    // Omit storeId to use default context
    const filter = {
      domain: domain,
    };
    
    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.getAll(filter)
        .then(callback, function (e) {
          
        });
    } else {
      this.browserDetector.getApi().cookies.getAll(filter, callback);
    }
  }

  /**
   * Prepares a cookie to be saved. Cleans it up for certain browsers.
   * @param {object} cookie
   * @param {string} url
   * @return {object}
   */
  prepareCookie(cookie, url) {
    // Handle potential undefined or null cookie object
    if (!cookie) {
      console.error('prepareCookie received undefined or null cookie object');
      throw new Error('Cannot prepare undefined cookie');
    }

    // Defensive clone to avoid modifying the original
    const newCookie = {
      domain: cookie.domain || '',
      name: cookie.name || '',
      value: cookie.value || '',
      path: cookie.path || '/',
      secure: cookie.secure || null,
      httpOnly: cookie.httpOnly || null,
      expirationDate: cookie.expirationDate || null,
      storeId: cookie.storeId || (this.currentTab && this.currentTab.cookieStoreId) || null,
      url: url,
    };

    // Validate required fields
    if (!newCookie.name) {
      console.error('prepareCookie received cookie with empty name', cookie);
      throw new Error('Cookie name is required');
    }

    // Remove leading dot from domain for URL construction
    const cleanDomain = newCookie.domain.startsWith('.') ? newCookie.domain.substring(1) : newCookie.domain;

    // For all browsers, ensure the URL includes the path
    if (newCookie.path && newCookie.path !== '/') {
      try {
        // Try to parse and modify the URL to include the path
        const urlObj = new URL(url);
        // Update the URL to include the exact path
        newCookie.url = `${urlObj.protocol}//${urlObj.host}${newCookie.path}`;
      } catch (e) {
        // If URL parsing fails, we'll keep the original URL
        console.error('Error parsing URL in prepareCookie:', e);
        if (cleanDomain) {
          newCookie.url = `https://${cleanDomain}${newCookie.path}`;
        }
      }
    }

    // Bad hack on safari because cookies needs to have the very exact same domain
    // to be able to edit it.
    if (this.browserDetector.isSafari() && newCookie.domain) {
      // For Safari, still include the path in the URL but use clean domain
      newCookie.url = 'https://' + cleanDomain + (newCookie.path || '/');
    }
    if (this.browserDetector.isSafari() && !newCookie.path) {
      newCookie.path = '/';
    }

    if (
      cookie.hostOnly ||
      (this.browserDetector.isSafari() && !newCookie.domain)
    ) {
      newCookie.domain = null;
    }

    if (!this.browserDetector.isSafari()) {
      newCookie.sameSite = cookie.sameSite || undefined;

      if (newCookie.sameSite == 'no_restriction') {
        newCookie.secure = true;
      }
    }

    return newCookie;
  }

  /**
   * Saves a cookie. This can either create a new cookie or modify an existing
   * one.
   * @param {Cookie} cookie Cookie's data.
   * @param {string} url The url to attach the cookie to.
   * @param {function} callback
   */
  saveCookie(cookie, url, callback) {
    try {
      cookie = this.prepareCookie(cookie, url);
      
      if (this.browserDetector.supportsPromises()) {
        this.browserDetector
          .getApi()
          .cookies.set(cookie)
          .then(
            (cookie, a, b, c) => {
              if (callback) {
                callback(null, cookie);
              }
            },
            (error) => {
              console.error('Error saving cookie:', error);
              if (callback) {
                callback(error.message, null);
              }
            },
          );
      } else {
        this.browserDetector.getApi().cookies.set(cookie, (cookieResponse) => {
          const error = this.browserDetector.getApi().runtime.lastError;
          if (!cookieResponse || error) {
            console.error('Error saving cookie:', error);
            if (callback) {
              const errorMessage =
                (error ? error.message : '') || 'Unknown error';
              return callback(errorMessage, cookieResponse);
            }
            return;
          }

          if (callback) {
            return callback(null, cookieResponse);
          }
        });
      }
    } catch (error) {
      console.error('Exception during cookie save preparation:', error);
      if (callback) {
        callback(error.message || 'Failed to prepare cookie', null);
      }
    }
  }

  /**
   * Removes a cookie from the browser.
   * @param {string} name The name of the cookie to remove.
   * @param {string} url The url that the cookie is attached to.
   * @param {string} [storeId] The ID of the cookie store to remove from.
   * @param {function} callback
   * @param {boolean} isRecursive
   */
  removeCookie(name, url, storeId, callback, isRecursive = false) {
    // If storeId is passed before callback, adjust arguments
    if (typeof storeId === 'function') {
      isRecursive = callback;
      callback = storeId;
      storeId = undefined; 
    }
    
    // Bad hack on safari because cookies needs to have the very exact same domain
    // to be able to delete it.
    // TODO: Check if this hack is needed on devtools. Needs review after simplification.
    if (this.browserDetector.isSafari() && !isRecursive) {
      // Keep Safari logic for now, but it needs review.
      // It might infinite loop if the recursive call doesn't work as expected.
      console.warn("Safari cookie deletion logic needs review.")
      this.getAllCookies((cookies) => {
        let found = false;
        for (const cookie of cookies) {
          // Match name AND try to match domain based on the passed URL.
          // Construct a more specific URL for Safari if possible.
          let targetDomain = cookie.domain;
          try {
            const urlObj = new URL(url);
            // Ensure cookie domain matches or is a parent of the URL's domain.
            const urlHostname = urlObj.hostname;
            const cookieDomainClean = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
            if (urlHostname === cookieDomainClean || urlHostname.endsWith('.' + cookieDomainClean)) {
               // Found a potential match
              if (cookie.name === name) {
                  found = true;
                  // Use cookie's domain and path for the recursive call
                  const safariUrl = `${urlObj.protocol}//${cookieDomainClean}${cookie.path || '/'}`;
                  // Pass storeId in recursive call if available (though Safari logic might need review)
                  this.removeCookie(name, safariUrl, cookie.storeId, callback, true);
                  // Assuming Safari needs one deletion call per matching cookie found
              }
            }
          } catch(e) {
             // If URL parsing fails, fallback to simpler domain check maybe? Or log error.
             console.error("Error processing URL for Safari cookie check:", e);
          }
        }
        // If no specific match found after checking all cookies, maybe call original callback with failure?
        if (!found && callback) {
            // callback(null); // Indicate no cookie found/deleted - uncomment if needed
        }
      });
      return; // Stop further execution for Safari non-recursive call
    }
    // The logic that called getAllCookies, compared paths, and called recursively is gone FOR NON-SAFARI BROWSERS.

    // Directly call the browser API (using promises or callbacks based on support)
    // Use the 'url' provided, which was constructed with the specific path in cookie-list.js
    if (this.browserDetector.supportsPromises()) {
      try {
        this.browserDetector
          .getApi()
          .cookies.remove({
            name: name,
            url: url,
            storeId: storeId // Add storeId here
          })
          .then(
            // Success handler
            (result) => {
              if (callback) {
                try {
                  callback(result);
                } catch (error) {
                  // Callback might fail if popup is closed
                  console.error('Error during deleteCookie', error);
                }
              }
            },
            // Error handler
            (error) => {
              console.error('Error removing cookie:', error);
              if (callback) {
                try {
                  callback(null); // Pass null on error
                } catch (callbackError) {
                  // Callback might fail if popup is closed
                  console.error('Error during deleteCookie error callback', callbackError);
                }
              }
            }
          );
      } catch (e) {
        console.error('Exception when removing cookie:', e);
        if (callback) {
          try {
            callback(null); // Pass null on exception
          } catch (callbackError) {
            // Callback might fail if popup is closed
            console.error('Error during deleteCookie exception callback', callbackError);
          }
        }
      }
    } else { // Fallback for browsers without promise support
      try {
        this.browserDetector.getApi().cookies.remove(
          {
            name: name,
            url: url,
            storeId: storeId // Add storeId here
          },
          (result) => {
            if (callback) {
              try {
                callback(result);
              } catch (error) {
                // Callback might fail if popup is closed
                console.error('Error during deleteCookie callback', error);
              }
            }
          }
        );
      } catch (e) {
        console.error('Exception when removing cookie:', e);
        if (callback) {
          try {
            callback(null); // Pass null on exception
          } catch (callbackError) {
            // Callback might fail if popup is closed
            console.error('Error during deleteCookie exception callback', callbackError);
          }
        }
      }
    }
  }

  /**
   * Gets all the cookies from the browser.
   * @param {function} callback
   */
  getAllCookiesInBrowser(callback) {
    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.getAll({})
        .then(callback, function (e) {
          
        });
    } else {
      this.browserDetector.getApi().cookies.getAll({}, callback);
    }
  }

  /**
   * Gets all domains that have cookies in the browser.
   * @param {function} callback Called with array of unique domains
   */
  getAllDomains(callback) {
    this.getAllCookiesInBrowser((cookies) => {
      const domains = new Set();
      
      cookies.forEach(cookie => {
        // Add domain with dot prefix removed if present
        const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        domains.add(domain);
      });
      
      callback(Array.from(domains).sort());
    });
  }

  /**
   * Gets all cookies stored in the browser across all domains and stores.
   * @param {function} callback Function to call with the array of cookies or an empty array on error.
   */
  getAllBrowserCookies(callback) {
    const filter = {}; // Empty filter gets all cookies

    if (this.browserDetector.supportsPromises()) {
      this.browserDetector
        .getApi()
        .cookies.getAll(filter)
        .then(
          (cookies) => {
            callback(cookies || []); // Ensure array even if API returns null/undefined
          },
          (error) => {
            console.error("Error getting all browser cookies (Promise):", error);
            callback([]); // Pass empty array on error
          }
        );
    } else {
      this.browserDetector.getApi().cookies.getAll(
        filter,
        (cookies) => {
            const error = this.browserDetector.getApi().runtime.lastError;
            if (error) {
                console.error("Error getting all browser cookies (Callback):", error);
                callback([]); // Pass empty array on error
            } else {
                callback(cookies || []); // Ensure array even if API returns null/undefined
            }
        }
      );
    }
  }
}

