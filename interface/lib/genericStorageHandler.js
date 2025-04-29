import { EventEmitter } from './eventEmitter.js';

/**
 * Abstract class used to implement basic common Storage API handling.
 */
export class GenericStorageHandler extends EventEmitter {
  /**
   * Constructs a GenericStorageHandler.
   * @param {BrowserDetector} browserDetector
   */
  constructor(browserDetector) {
    super();
    this.browserDetector = browserDetector;
  }

  /**
   * Gets a value from storage (defaults to local).
   * @param {string|array} key Key or keys to identify the value in the storage.
   * @param {any} defaultValue Optional default value to return if the key doesn't exist.
   * @param {boolean} useSync Whether to use sync storage instead of local.
   * @return {Promise}
   */
  async get(key, defaultValue = null, useSync = false) {
    const storageArea = useSync ? 'sync' : 'local';
    const self = this;
    const keys = typeof key === 'string' ? [key] : key;
    
    let promise;
    if (this.browserDetector.supportsPromises()) {
      promise = this.browserDetector.getApi().storage[storageArea].get(keys);
    } else {
      promise = new Promise((resolve, reject) => {
        self.browserDetector.getApi().storage[storageArea].get(keys, (data) => {
          const error = self.browserDetector.getApi().runtime.lastError;
          if (error) {
            reject(error);
          }
          resolve(data ?? {});
        });
      });
    }

    // If single key was provided as string, return just that value
    if (typeof key === 'string') {
      return promise.then((data) => {
        return data[key] !== undefined ? data[key] : defaultValue;
      });
    }
    
    // Return the whole object if array of keys was provided
    return promise;
  }

  /**
   * Sets a value in storage (defaults to local).
   * @param {object|string} keyOrData Either an object containing all key-value pairs to set, or a string key.
   * @param {any} value The value to set if key is a string (ignored if keyOrData is an object).
   * @param {boolean} useSync Whether to use sync storage instead of local.
   * @return {Promise}
   */
  async set(keyOrData, value = null, useSync = false) {
    const storageArea = useSync ? 'sync' : 'local';
    const self = this;
    
    // Determine the data object to store
    let dataObj;
    if (typeof keyOrData === 'string') {
      dataObj = {};
      dataObj[keyOrData] = value;
    } else if (typeof keyOrData === 'object') {
      dataObj = keyOrData;
    } else {
      throw new Error('Invalid key or data type for storage');
    }

    if (this.browserDetector.supportsPromises()) {
      return this.browserDetector.getApi().storage[storageArea].set(dataObj);
    } else {
      return new Promise((resolve, reject) => {
        this.browserDetector.getApi().storage[storageArea].set(dataObj, () => {
          const error = self.browserDetector.getApi().runtime.lastError;
          if (error) {
            reject(error);
          }
          resolve();
        });
      });
    }
  }

  /**
   * Gets a value from LocalStorage.
   * @param {string} key Key to identify the value in the LocalStorage.
   * @param {any} defaultValue Optional default value to return if the key doesn't exist.
   * @return {Promise}
   */
  async getLocal(key, defaultValue = null) {
    // Use the new general get method with local storage
    return this.get(key, defaultValue, false);
  }

  /**
   * Sets a value in the LocalStorage.
   * @param {string} key Key to identify the value in the LocalStorage.
   * @param {any} data Data to store in the LocalStorage
   * @return {Promise}
   */
  async setLocal(key, data) {
    const self = this;
    const dataObj = {};
    dataObj[key] = data;

    if (this.browserDetector.supportsPromises()) {
      return this.browserDetector.getApi().storage.local.set(dataObj);
    } else {
      return new Promise((resolve, reject) => {
        this.browserDetector.getApi().storage.local.set(dataObj, () => {
          const error = self.browserDetector.getApi().runtime.lastError;
          if (error) {
            reject(error);
          }
          resolve();
        });
      });
    }
  }

  /**
   * Removes a value from the LocalStorage.
   * @param {string | string[]} keyOrKeys Key or array of keys to remove.
   * @return {Promise}
   */
  async removeLocal(keyOrKeys) {
    const self = this;
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];

    if (this.browserDetector.supportsPromises()) {
      return this.browserDetector.getApi().storage.local.remove(keys);
    } else {
      return new Promise((resolve, reject) => {
        this.browserDetector.getApi().storage.local.remove(keys, () => {
          const error = self.browserDetector.getApi().runtime.lastError;
          if (error) {
            reject(error);
          }
          resolve();
        });
      });
    }
  }

  /**
   * Gets a value from storage. Simplified interface for the cookie manager.
   * @param {string} key Key to identify the value in storage.
   * @param {any} defaultValue Optional default value to return if the key doesn't exist.
   * @param {boolean} useSync Whether to use sync storage instead of local.
   * @return {Promise<any>} The value from storage, or defaultValue if not found.
   */
  async getFromStorage(key, defaultValue = null, useSync = false) {
    try {
      const result = await this.get(key, defaultValue, useSync);
      return result;
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      return defaultValue;
    }
  }

  /**
   * Saves a value to storage. Simplified interface for the cookie manager.
   * @param {string} key Key to identify the value in storage.
   * @param {any} value Value to save in storage.
   * @param {boolean} useSync Whether to use sync storage instead of local.
   * @return {Promise<void>}
   */
  async saveToStorage(key, value, useSync = false) {
    try {
      await this.set(key, value, useSync);
      // Emit a storage change event that components can listen for
      this.emit('storageChanged', { key, value });
    } catch (error) {
      console.error(`Error saving ${key} to storage:`, error);
      throw error;
    }
  }
}

