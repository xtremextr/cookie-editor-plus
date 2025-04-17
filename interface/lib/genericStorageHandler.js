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
   * Gets a value from LocalStorage.
   * @param {string} key Key to identify the value in the LocalStorage.
   * @param {any} defaultValue Optional default value to return if the key doesn't exist.
   * @return {Promise}
   */
  async getLocal(key, defaultValue = null) {
    const self = this;
    let promise;
    if (this.browserDetector.supportsPromises()) {
      promise = this.browserDetector.getApi().storage.local.get([key]);
    } else {
      promise = new Promise((resolve, reject) => {
        self.browserDetector.getApi().storage.local.get([key], (data) => {
          const error = self.browserDetector.getApi().runtime.lastError;
          if (error) {
            reject(error);
          }
          resolve(data ?? {});
        });
      });
    }

    return promise.then((data) => {
      return data[key] !== undefined ? data[key] : defaultValue;
    });
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
}
