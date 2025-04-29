import { Browsers } from './browsers.js';
import { Env } from './env.js';

/**
 * Detects information about the browser being used.
 */
export class BrowserDetector {
  /**
   * Constructs the BrowserDetector.
   */
  constructor() {
    
    this.namespace = chrome || window.browser || window.chrome;
    this.supportPromises = false;
    this.supportSidePanel = false;

    try {
      this.supportPromises =
        this.namespace.runtime.getPlatformInfo() instanceof Promise;
      console.info('Promises support: ', this.supportPromises);
    } catch (e) {
      /* empty */
    }

    try {
      // Check for existence of the key instead of accessing the property directly
      this.supportSidePanel = 'sidePanel' in this.getApi();
      console.info('SidePanel support: ', this.supportSidePanel);
    } catch (e) {
      /* empty */
    }

    if (Env.browserName === '@@browser_name') {
      Env.browserName = Browsers.Chrome;
      
    }

    
  }

  /**
   * Get the main API container specific to the current browser.
   * @return {chrome|browser}
   */
  getApi() {
    return this.namespace;
  }

  /**
   * Checks if the current browser is Firefox.
   * @return {boolean} true if the current browser is Firefox, otherwise false.
   */
  isFirefox() {
    return Env.browserName === Browsers.Firefox;
  }

  /**
   * Checks if the current browser is Chrome.
   * @return {boolean} true if the current browser is Chrome, otherwise false.
   */
  isChrome() {
    return Env.browserName === Browsers.Chrome;
  }

  /**
   * Checks if the current browser is Edge.
   * @return {boolean} true if the current browser is Edge, otherwise false.
   */
  isEdge() {
    return Env.browserName === Browsers.Edge;
  }

  /**
   * Checks if the current browser is Safari.
   * @return {boolean} true if the current browser is Safari, otherwise false.
   */
  isSafari() {
    return typeof safari !== 'undefined' || this._browserName === 'safari';
  }

  /**
   * Checks if the current browser's API supports promises.
   * @return {boolean} true if the current browser's API supports promises,
   *     otherwise false.
   */
  supportsPromises() {
    return typeof this.getApi().runtime.getPlatformInfo().then === 'function';
  }

  /**
   * Checks if the current browser supports the Sidepanel API.
   * @return {boolean} true if the current browser supports the Sidepanel API,
   *     otherwise false.
   */
  supportsSidePanel() {
    return this.supportSidePanel;
  }

  /**
   * Gets the current browser name.
   * @return {string} The browser name.
   */
  getBrowserName() {
    return Env.browserName;
  }

  isMobile() {
    // Check for mobile user agent strings
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android|mobi|tablet|ipad|iphone/i.test(userAgent.toLowerCase());
  }
}

