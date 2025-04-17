import { HistoryManager } from './historyManager.js';

/**
 * HistoryHandler class to handle interaction between the HistoryManager and the cookie system.
 * Provides methods to perform undo and redo operations on cookies.
 */
export class HistoryHandler {
  /**
   * Constructs a new HistoryHandler.
   * @param {BrowserDetector} browserDetector - Browser detection utility
   * @param {GenericCookieHandler} cookieHandler - Cookie handler to use for operations
   */
  constructor(browserDetector, cookieHandler) {
    this.browserDetector = browserDetector;
    this.cookieHandler = cookieHandler;
    this.historyManager = new HistoryManager();
  }
  
  /**
   * Register a change listener for history changes
   * @param {Function} callback - Function to call when history changes
   */
  onHistoryChange(callback) {
    this.historyManager.on('change', callback);
  }
  
  /**
   * Record a cookie edit operation
   * @param {string} type - Operation type ('edit', 'delete', 'deleteAll', 'create', 'importCookies', 'loadProfile')
   * @param {Object|Array|null} cookieData - Cookie data before the operation
   * @param {Object|Array|null} [newCookieData] - New cookie data (for various operations)
   * @param {string} url - URL associated with the cookie
   */
  recordOperation(type, cookieData, newCookieData, url) {
    console.log(`Recording history operation: ${type}`, 
                { cookieData: cookieData ? 'present' : 'null', 
                  newCookieData: newCookieData ? 'present' : 'null' });
    this.historyManager.recordEdit(type, cookieData, newCookieData, url);
  }

  /**
   * Check if an undo operation is available
   * @returns {boolean} True if undo is available
   */
  canUndo() {
    return this.historyManager.canUndo();
  }

  /**
   * Check if a redo operation is available
   * @returns {boolean} True if redo is available
   */
  canRedo() {
    return this.historyManager.canRedo();
  }

  /**
   * Perform an undo operation
   * @param {Function} [callback] - Callback to call when operation is complete
   * @returns {Promise<Object>} Promise resolving to the operation details
   */
  async undo(callback) {
    const operation = this.historyManager.undo();
    if (!operation) {
      if (callback) callback(null);
      return null;
    }

    try {
      switch (operation.type) {
        case 'edit':
          // For an edit, restore the original cookie
          await this.performCookieRestore(operation.cookieData, operation.url);
          break;
          
        case 'delete':
          // For a deletion, restore the cookie
          await this.performCookieRestore(operation.cookieData, operation.url);
          break;
          
        case 'create':
          // For a creation, delete the cookie
          if (operation.newCookieData) {
            await this.performCookieDelete(operation.newCookieData.name, operation.url);
          }
          break;
          
        case 'deleteAll':
          // For deleteAll, restore all the cookies
          if (Array.isArray(operation.cookieData)) {
            await this.performBulkCookieRestore(operation.cookieData, operation.url);
          }
          break;
          
        case 'importCookies':
          // For import, remove all imported cookies
          if (Array.isArray(operation.newCookieData)) {
            await this.performBulkCookieDelete(operation.newCookieData, operation.url);
          }
          break;
          
        case 'loadProfile':
          // For profile loading, restore the previous cookies state
          if (Array.isArray(operation.cookieData)) {
            // First, delete all current cookies (the profile cookies)
            if (Array.isArray(operation.newCookieData)) {
              await this.performBulkCookieDelete(operation.newCookieData, operation.url);
            }
            // Then restore the original cookies
            await this.performBulkCookieRestore(operation.cookieData, operation.url);
          }
          break;
      }
      
      if (callback) callback(operation);
      return operation;
    } catch (error) {
      console.error('Error during undo operation:', error);
      if (callback) callback(null, error);
      return null;
    }
  }

  /**
   * Perform a redo operation
   * @param {Function} [callback] - Callback to call when operation is complete
   * @returns {Promise<Object>} Promise resolving to the operation details
   */
  async redo(callback) {
    const operation = this.historyManager.redo();
    if (!operation) {
      if (callback) callback(null);
      return null;
    }

    try {
      switch (operation.type) {
        case 'edit':
          // For an edit, apply the new cookie state
          if (operation.newCookieData) {
            await this.performCookieRestore(operation.newCookieData, operation.url);
          }
          break;
          
        case 'delete':
          // For a deletion, delete the cookie again
          await this.performCookieDelete(operation.cookieData.name, operation.url);
          break;
          
        case 'create':
          // For a creation, create the cookie again
          if (operation.newCookieData) {
            await this.performCookieRestore(operation.newCookieData, operation.url);
          }
          break;
          
        case 'deleteAll':
          // For deleteAll, delete all the cookies again
          if (Array.isArray(operation.cookieData)) {
            await this.performBulkCookieDelete(operation.cookieData, operation.url);
          }
          break;
          
        case 'importCookies':
          // For import, re-import all cookies
          if (Array.isArray(operation.newCookieData)) {
            await this.performBulkCookieRestore(operation.newCookieData, operation.url);
          }
          break;
          
        case 'loadProfile':
          // For profile loading, apply the profile cookies again
          if (Array.isArray(operation.newCookieData)) {
            // First, delete all current cookies (the original cookies)
            if (Array.isArray(operation.cookieData)) {
              await this.performBulkCookieDelete(operation.cookieData, operation.url);
            }
            // Then restore the profile cookies
            await this.performBulkCookieRestore(operation.newCookieData, operation.url);
          }
          break;
      }
      
      if (callback) callback(operation);
      return operation;
    } catch (error) {
      console.error('Error during redo operation:', error);
      if (callback) callback(null, error);
      return null;
    }
  }

  /**
   * Perform a cookie restoration
   * @param {Object} cookieData - Cookie data to restore
   * @param {string} url - URL associated with the cookie
   * @returns {Promise<Object>} Promise resolving to the saved cookie
   * @private
   */
  performCookieRestore(cookieData, url) {
    return new Promise((resolve, reject) => {
      this.cookieHandler.saveCookie(cookieData, url, (error, savedCookie) => {
        if (error) {
          reject(error);
        } else {
          resolve(savedCookie);
        }
      });
    });
  }

  /**
   * Perform a cookie deletion
   * @param {string} cookieName - Name of the cookie to delete
   * @param {string} url - URL associated with the cookie
   * @returns {Promise<void>} Promise resolving when cookie is deleted
   * @private
   */
  performCookieDelete(cookieName, url) {
    return new Promise((resolve, reject) => {
      // Ensure we're using a valid URL - sometimes we just get a domain instead of a complete URL
      const urlToUse = url.startsWith('http') ? url : `https://${url}/`;
      
      this.cookieHandler.removeCookie(cookieName, urlToUse, () => {
        resolve();
      });
    });
  }

  /**
   * Restore multiple cookies
   * @param {Array<Object>} cookies - Array of cookie data to restore
   * @param {string} url - URL associated with the cookies
   * @returns {Promise<Array>} Promise resolving to array of results
   * @private
   */
  async performBulkCookieRestore(cookies, url) {
    const promises = [];
    
    // Ensure we're using a valid URL
    const urlToUse = url.startsWith('http') ? url : `https://${url}/`;
    
    for (const cookie of cookies) {
      promises.push(
        new Promise((resolve) => {
          this.cookieHandler.saveCookie(cookie, urlToUse, (error, savedCookie) => {
            resolve({ cookie, error, savedCookie });
          });
        })
      );
    }
    
    return Promise.all(promises);
  }

  /**
   * Delete multiple cookies
   * @param {Array<Object>} cookies - Array of cookie data to delete
   * @param {string} url - URL associated with the cookies
   * @returns {Promise<Array>} Promise resolving when all cookies are deleted
   * @private
   */
  async performBulkCookieDelete(cookies, url) {
    const promises = [];
    
    // Ensure we're using a valid URL
    const urlToUse = url.startsWith('http') ? url : `https://${url}/`;
    
    for (const cookie of cookies) {
      promises.push(
        new Promise((resolve) => {
          this.cookieHandler.removeCookie(cookie.name, urlToUse, () => {
            resolve({ cookie });
          });
        })
      );
    }
    
    return Promise.all(promises);
  }

  /**
   * Clear all history
   */
  clear() {
    this.historyManager.clear();
  }
} 