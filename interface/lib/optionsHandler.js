import { EventEmitter } from './eventEmitter.js';
import { GUID } from './guid.js';
import { ExportFormats } from './options/exportFormats.js';
import { ExtraInfos } from './options/extraInfos.js';
import { Options } from './options/options.js';
import { Themes } from './options/themes.js';

// Define individual keys based on the Options class properties
const optionKeys = Object.keys(new Options());

/**
 * Abstract class used to implement basic common Storage API handling.
 */
export class OptionsHandler extends EventEmitter {
  /**
   * Constructs an OptionHandler.
   * @param {BrowserDetector} browserDetector
   * @param {GenericStorageHandler} genericStorageHandler
   */
  constructor(browserDetector, genericStorageHandler) {
    super();
    
    this.browserDetector = browserDetector;
    this.storageHandler = genericStorageHandler;
    this.isReady = false;
    // Initialize options with defaults first
    this.options = new Options();
    this.guid = GUID.get();

    // Listen for storage changes from other contexts (e.g., background script)
    // Note: This assumes GenericStorageHandler emits 'storageChanged' correctly.
    // If not, listening to chrome.storage.onChanged might be needed directly.
    // this.storageHandler.on('storageChanged', this.handleExternalStorageChange);
    // TODO: Decide if listening to external changes is needed and implement fully.
  }

  /**
   * Gets whether to show advanced cookies or not.
   * @return {boolean} True to show advanced cookies, otherwise false.
   */
  getCookieAdvanced() {
    return this.options.advancedCookies;
  }
  /**
   * Sets whether to show advanced cookies or not.
   * @param {boolean} isAdvanced True to show advanced cookies, otherwise false.
   */
  async setCookieAdvanced(isAdvanced) {
    if (this.options.advancedCookies !== isAdvanced) {
    this.options.advancedCookies = isAdvanced;
      await this.saveOption('advancedCookies', isAdvanced);
    }
  }

  /**
   * Gets whether the devtools panel is enabled or not.
   * @return {boolean} True if the devtools panel is enabled, otherwise false.
   */
  getDevtoolsEnabled() {
    return this.options.devtoolsEnabled;
  }
  /**
   * Sets whether the devtools panel is enabled or not.
   * @param {boolean} devtoolsEnabled True if the devtools panel is enabled,
   *     otherwise false.
   */
  async setDevtoolsEnabled(devtoolsEnabled) {
    if (this.options.devtoolsEnabled !== devtoolsEnabled) {
    this.options.devtoolsEnabled = devtoolsEnabled;
      await this.saveOption('devtoolsEnabled', devtoolsEnabled);
    }
  }

  /**
   * Gets whether the animations are enabled or not.
   * @return {boolean} True if the animations are enabled, otherwise false.
   */
  getAnimationsEnabled() {
    // Uses `!==` false in order to be opt-in by default, since it was added at
    // a later time. Returns default true if options not loaded.
    return this.options?.animationsEnabled !== false;
  }
  /**
   * Sets whether the animations are enabled or not.
   * @param {boolean} animationsEnabled True if the animations are enabled,
   *     otherwise false.
   */
  async setAnimationsEnabled(animationsEnabled) {
    if (this.options.animationsEnabled !== animationsEnabled) {
    this.options.animationsEnabled = animationsEnabled;
      await this.saveOption('animationsEnabled', animationsEnabled);
    }
  }

  /**
   * Gets the export format used by the export button.
   * @return {ExportFormats} One of the supported export format.
   */
  getExportFormat() {
    let exportFormat = this.options.exportFormat;
    // Perform validation on the currently loaded value
    if (!this.isExportFormatValid(exportFormat)) {
      
      exportFormat = ExportFormats.Ask;
      // No need to save here, let the setter handle it if called
    }
    return exportFormat;
  }
  /**
   * Sets the export format used by the export button.
   * @param {ExportFormats} exportFormat One of the supported export format.
   */
  async setExportFormat(exportFormat) {
    if (!this.isExportFormatValid(exportFormat)) {
      
      return;
    }
    if (this.options.exportFormat !== exportFormat) {
    this.options.exportFormat = exportFormat;
      await this.saveOption('exportFormat', exportFormat);
    }
  }
  /**
   * Checks if a format is a valid ExportFormats format.
   * @param {ExportFormats} exportFormat
   * @return {boolean} True if it is valid, otherwise false.
   */
  isExportFormatValid(exportFormat) {
    // Use Object.values for cleaner check
    return Object.values(ExportFormats).includes(exportFormat);
  }

  /**
   * Gets the extra info displayed for each row.
   * @return {ExtraInfos} One of the supported extra info value.
   */
  getExtraInfo() {
    let extraInfo = this.options.extraInfo;
    // Perform validation on the currently loaded value
    if (!this.isExtraInfoValid(extraInfo)) {
      
      extraInfo = ExtraInfos.Nothing;
      // No need to save here, let the setter handle it if called
    }
    return extraInfo;
  }
  /**
   * Sets the extra info displayed for each row.
   * @param {ExtraInfos} extraInfo One of the supported extra info value.
   */
  async setExtraInfo(extraInfo) {
    if (!this.isExtraInfoValid(extraInfo)) {
      
      return;
    }
    if (this.options.extraInfo !== extraInfo) {
    this.options.extraInfo = extraInfo;
      await this.saveOption('extraInfo', extraInfo);
    }
  }
  /**
   * Checks if a value is a valid ExtraInfos value.
   * @param {ExtraInfos} extraInfo
   * @return {boolean} True if it is valid, otherwise false.
   */
  isExtraInfoValid(extraInfo) {
    // Use Object.values for cleaner check
    return Object.values(ExtraInfos).includes(extraInfo);
  }

  /**
   * Gets the theme of the extension.
   * @return {Themes} One of the supported theme option.
   */
  getTheme() {
    // Return default 'auto' if options not ready or invalid
    let theme = this.options?.theme;
    if (!this.isThemeValid(theme)) {
      theme = Themes.Auto;
    }
    return theme;
  }
  /**
   * Sets the theme of the extension.
   * @param {Themes} theme One of the supported theme option.
   */
  async setTheme(theme) {
    if (!this.isThemeValid(theme)) {
      return;
    }
    // Only save if the theme actually changes
    if (this.options.theme !== theme) {
    this.options.theme = theme;
      // Save to async extension storage first
      await this.saveOption('theme', theme);
      
      // Also save *just* the theme to localStorage for synchronous loader
      try {
        localStorage.setItem('selectedTheme', theme);
      } catch (e) {
        console.error('Failed to save theme to localStorage:', e);
      }
    }
  }
  /**
   * Checks if a value is a valid theme.
   * @param {Themes} theme Value to validate.
   * @return {boolean} True if it is valid, otherwise false.
   */
  isThemeValid(theme) {
    // Use Object.values for cleaner check
    return Object.values(Themes).includes(theme);
  }

  /**
   * Gets whether the button bar is displayed at the top of the page or not.
   * @return {boolean} True if the button bar is on the top, otherwise false.
   */
  getButtonBarTop() {
    return this.options.buttonBarTop;
  }
  /**
   * Sets whether the button bar is displayed at the top of the page or not.
   * @param {boolean} buttonBarTop True if the button bar is on the top, otherwise false.
   */
  async setButtonBarTop(buttonBarTop) {
    if (this.options.buttonBarTop !== buttonBarTop) {
    this.options.buttonBarTop = buttonBarTop;
      await this.saveOption('buttonBarTop', buttonBarTop);
    }
  }

  /**
   * Gets whether ads are enabled or not.
   * @return {boolean} True if ads are enabled, otherwise false.
   */
  getAdsEnabled() {
    // Uses `!==` false in order to be opt-in by default, since it was added at
    // a later time.
    return this.options?.adsEnabled !== false;
  }
  /**
   * Sets whether the ads are enabled or not.
   * @param {boolean} adsEnabled True if the ads are enabled, otherwise false.
   */
  async setAdsEnabled(adsEnabled) {
    if (this.options.adsEnabled !== adsEnabled) {
    this.options.adsEnabled = adsEnabled;
      await this.saveOption('adsEnabled', adsEnabled);
    }
  }

  /**
   * Gets the action button position.
   * @returns {string} 'left' or 'right'
   */
  getActionButtonPosition() {
    return this.options.actionButtonPosition || 'right'; // Default to right
  }
  /**
   * Sets the action button position.
   * @param {string} position 'left' or 'right'
   */
  async setActionButtonPosition(position) {
    const validPositions = ['left', 'right'];
    if (validPositions.includes(position) && this.options.actionButtonPosition !== position) {
      this.options.actionButtonPosition = position;
      await this.saveOption('actionButtonPosition', position);
    }
  }

  /**
   * Gets the search options.
   * @returns {object} Object containing search options.
   */
  getSearchOptions() {
    // Return a copy to prevent direct modification
    return { ...(this.options.searchOptions || {}) };
  }

  /**
   * Sets specific search options.
   * @param {object} searchOptions Object containing search options to update.
   */
  async setSearchOptions(searchOptions) {
    // Merge new options with existing ones
    const newSearchOptions = { ...this.options.searchOptions, ...searchOptions };
    
    // Basic check for changes (can be improved if needed)
    if (JSON.stringify(this.options.searchOptions) !== JSON.stringify(newSearchOptions)) {
      this.options.searchOptions = newSearchOptions;
      // Save the entire searchOptions object under its key
      await this.saveOption('searchOptions', newSearchOptions);
    }
  }

  /**
   * Loads options from storage. Prioritizes essential options for faster initial load.
   */
  async loadOptions() {
    const defaultOptions = new Options();
    const essentialKeys = ['theme', 'animationsEnabled'];
    // Determine remaining keys by filtering out essential ones
    const remainingKeys = optionKeys.filter(key => !essentialKeys.includes(key));

    try {
      // --- Phase 1: Load Essential Options ---
      console.time('Essential Options Fetch');
      // Fetch only essential options first
      const essentialData = await this.storageHandler.get(essentialKeys);
      console.timeEnd('Essential Options Fetch');

      // Merge essential options with defaults
      this.options = { ...defaultOptions }; // Start with defaults
      for (const key of essentialKeys) {
        if (essentialData[key] !== undefined) {
          this.options[key] = essentialData[key];
        }
      }
      
      // Validate essential options immediately
      this.options.theme = this.getTheme(); // Use getter for validation
      this.options.animationsEnabled = this.getAnimationsEnabled(); // Use getter

      this.isReady = true; // Mark as ready for essential operations
      this.emit('essentialOptionsLoaded', this.options); // Notify essential loaded
      console.log('Essential options loaded:', { theme: this.options.theme, animationsEnabled: this.options.animationsEnabled });

      // --- Phase 2: Load Remaining Options (No Await) ---
      this.loadRemainingOptions(remainingKeys, defaultOptions);

    } catch (e) {
      console.error("Error loading essential options:", e);
      // Fallback to default options if loading fails
      this.options = new Options();
      this.isReady = true; // Still ready, but with defaults
      this.emit('essentialOptionsLoaded', this.options); // Emit defaults
      this.emit('optionsLoaded', this.options); // Also emit full load with defaults on error
    }
  }

  /**
   * Asynchronously loads remaining options in the background.
   * @param {string[]} remainingKeys Keys to load.
   * @param {Options} defaultOptions Default options object.
   */
  async loadRemainingOptions(remainingKeys, defaultOptions) {
    try {
      console.time('Remaining Options Fetch');
      const remainingData = await this.storageHandler.get(remainingKeys);
      console.timeEnd('Remaining Options Fetch');

      // Merge remaining options into the existing options object
      for (const key of remainingKeys) {
        if (remainingData[key] !== undefined) {
          this.options[key] = remainingData[key];
        } else {
          // Ensure defaults are applied if remaining key wasn't stored
          this.options[key] = defaultOptions[key];
        }
      }
      
      // Validate the rest of the options after merging
      this.options.exportFormat = this.getExportFormat(); // Use getter for validation
      this.options.extraInfo = this.getExtraInfo();       // Use getter for validation
      // Add validation for other remaining fields if necessary

      this.emit('optionsLoaded', this.options); // Notify full options loaded
      console.log('All options loaded successfully:', this.options);

    } catch (e) {
      console.error("Error loading remaining options:", e);
      // Options might be partially loaded, but emit 'optionsLoaded' anyway
      // so dependent code isn't completely blocked. Existing essential options remain.
      this.emit('optionsLoaded', this.options);
    }
  }

  /**
   * Saves a single option key/value pair to storage.
   * @param {string} key The option key to save.
   * @param {any} value The value to save.
   */
  async saveOption(key, value) {
    if (!this.isReady) {
      console.warn('Attempted to save option before options loaded:', key);
      return; // Don't save if options haven't been loaded initially
    }
    try {
      await this.storageHandler.set(key, value); // Save individual key
      this.notifyBackgroundOfChanges({ [key]: value }); // Notify background about the specific change
    } catch (error) {
      console.error(`Error saving option ${key}:`, error);
      // Optionally, handle the error, e.g., show a notification to the user
    }
  }

  /**
   * Notifies the background script of option changes.
   * Sends only the changed key-value pairs.
   * @param {object} changes Object containing the key-value pairs that changed.
   */
  notifyBackgroundOfChanges(changes) {
    // Ensure options are loaded and we have a browser API
    if (!this.isReady || !this.browserDetector || !this.browserDetector.getApi().runtime.sendMessage) {
      return;
    }
    
    this.browserDetector.getApi().runtime.sendMessage({
      type: 'optionsChanged',
      payload: changes, // Send only changed data
      guid: this.guid // Include GUID to potentially ignore self-generated messages
      }).catch(error => {
      // Ignore errors if the background script is not ready or context is invalidated
      if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
        // Expected error if background isn't listening yet or extension reloaded
        } else {
        console.warn('Error sending optionsChanged message:', error);
      }
    });
  }

  // --- Methods related to preferred options page (keep as is, likely uses separate storage key) ---

  /**
   * Gets the user's preferred options page version ('v1' or 'v2').
   * Defaults to 'v2'.
   * @returns {Promise<string>}
   */
  async getPreferredOptionsPage() {
    const key = 'preferredOptionsPage';
    try {
      // Assuming GenericStorageHandler handles default value if key not found
      const result = await this.storageHandler.get(key, 'v2');
      return result === 'v1' ? 'v1' : 'v2'; // Validate result
    } catch (error) {
      console.error('Error getting preferred options page:', error);
      return 'v2'; // Default on error
    }
  }

  /**
   * Sets the user's preferred options page version.
   * @param {'v1' | 'v2'} version
   * @returns {Promise<void>}
   */
  async setPreferredOptionsPage(version) {
    const key = 'preferredOptionsPage';
    if (version === 'v1' || version === 'v2') {
      try {
        await this.storageHandler.set(key, version);
      } catch (error) {
        console.error('Error setting preferred options page:', error);
      }
    }
  }
}

