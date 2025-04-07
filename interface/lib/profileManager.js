import { EventEmitter } from './eventEmitter.js';

/**
 * Manages cookie profiles for different domains
 */
export class ProfileManager extends EventEmitter {
  /**
   * Creates a ProfileManager instance
   * @param {GenericStorageHandler} storageHandler - Storage handler for saving/loading profiles
   * @param {BrowserDetector} browserDetector - Browser detection utility
   */
  constructor(storageHandler, browserDetector) {
    super();
    this.storageHandler = storageHandler;
    this.browserDetector = browserDetector;
    this.profileStorageKey = 'profiles';
    this.metadataStorageKey = 'profilesMetadata';
    this.currentCookieState = {}; // To track the loaded profile cookies state
    
    // PERFORMANCE OPTIMIZATION: Add caching to reduce storage reads
    this.cache = {
      allProfiles: null,
      allMetadata: null,
      domainProfiles: {},
      domainMetadata: {},
      timestamp: 0,
      maxAge: 30000 // Cache for 30 seconds
    };
  }

  /**
   * Gets domain from a URL
   * @param {string} url - The URL to extract domain from
   * @return {string} The domain name
   */
  getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      console.error('Invalid URL:', url);
      return '';
    }
  }

  /**
   * Checks if the cache is valid
   * @return {boolean} Whether the cache is still valid
   * @private
   */
  _isCacheValid() {
    return this.cache.timestamp > 0 && 
           (Date.now() - this.cache.timestamp) < this.cache.maxAge;
  }

  /**
   * Invalidates the profile cache
   * @private
   */
  _invalidateCache() {
    this.cache.allProfiles = null;
    this.cache.allMetadata = null;
    this.cache.domainProfiles = {};
    this.cache.domainMetadata = {};
    this.cache.timestamp = 0;
  }

  /**
   * Gets all profiles from storage
   * @return {Promise<Object>} Object containing all profiles
   */
  async getAllProfiles() {
    // Check cache first
    if (this._isCacheValid() && this.cache.allProfiles !== null) {
      return this.cache.allProfiles;
    }
    
    const profiles = await this.storageHandler.getLocal(this.profileStorageKey);
    
    // Update cache
    this.cache.allProfiles = profiles || {};
    this.cache.timestamp = Date.now();
    
    return this.cache.allProfiles;
  }

  /**
   * Gets all profile metadata from storage
   * @return {Promise<Object>} Object containing all profile metadata
   */
  async getAllProfilesMetadata() {
    // Check cache first
    if (this._isCacheValid() && this.cache.allMetadata !== null) {
      return this.cache.allMetadata;
    }
    
    const metadata = await this.storageHandler.getLocal(this.metadataStorageKey);
    
    // Update cache
    this.cache.allMetadata = metadata || {};
    this.cache.timestamp = Date.now();
    
    return this.cache.allMetadata;
  }

  /**
   * Gets profiles for a specific domain
   * @param {string} domain - Domain to get profiles for
   * @return {Promise<Object>} Object containing domain-specific profiles
   */
  async getProfilesForDomain(domain) {
    // Check domain-specific cache first
    if (this._isCacheValid() && this.cache.domainProfiles[domain]) {
      return this.cache.domainProfiles[domain];
    }
    
    const profiles = await this.getAllProfiles();
    const domainProfiles = profiles[domain] || {};
    
    // Update domain-specific cache
    this.cache.domainProfiles[domain] = domainProfiles;
    
    return domainProfiles;
  }

  /**
   * Gets metadata for a specific domain
   * @param {string} domain - Domain to get metadata for
   * @return {Promise<Object>} Object containing domain-specific metadata
   */
  async getProfileMetadataForDomain(domain) {
    // Check domain-specific cache first
    if (this._isCacheValid() && this.cache.domainMetadata[domain]) {
      return this.cache.domainMetadata[domain];
    }
    
    const metadata = await this.getAllProfilesMetadata();
    const domainMetadata = metadata[domain] || { lastLoaded: null, loadTimestamp: null, modified: false };
    
    // Update domain-specific cache
    this.cache.domainMetadata[domain] = domainMetadata;
    
    return domainMetadata;
  }

  /**
   * Gets profile names for a specific domain
   * @param {string} domain - Domain to get profile names for
   * @return {Promise<string[]>} Array of profile names
   */
  async getProfileNamesForDomain(domain) {
    const domainProfiles = await this.getProfilesForDomain(domain);
    return Object.keys(domainProfiles);
  }

  /**
   * Gets a specific profile's cookies
   * @param {string} domain - Domain the profile belongs to
   * @param {string} profileName - Name of the profile to retrieve
   * @return {Promise<Array>} Array of cookies in the profile
   */
  async getProfile(domain, profileName) {
    const domainProfiles = await this.getProfilesForDomain(domain);
    return domainProfiles[profileName] || [];
  }

  /**
   * Saves cookies as a new profile
   * @param {string} domain - Domain the cookies belong to
   * @param {string} profileName - Name for the new profile
   * @param {Array} cookies - Array of cookie objects to save
   * @return {Promise<boolean>} Success status
   */
  async saveProfile(domain, profileName, cookies) {
    if (!domain || !profileName || !cookies) {
      return false;
    }
    
    try {
      // Get all profiles
      const profiles = await this.getAllProfiles();
      
      // Initialize domain entry if needed
      if (!profiles[domain]) {
        profiles[domain] = {};
      }
      
      // Save the profile
      profiles[domain][profileName] = cookies;
      
      // Store updated profiles
      await this.storageHandler.setLocal(this.profileStorageKey, profiles);
      
      // Invalidate cache
      this._invalidateCache();
      
      // Emit event for listeners
      this.emit('profileSaved', { domain, profileName });
      
      return true;
    } catch (error) {
      console.error('Error saving profile:', error);
      return false;
    }
  }

  /**
   * Marks a profile as loaded for a domain
   * @param {string} domain - Domain the profile belongs to
   * @param {string} profileName - Name of the loaded profile
   * @param {Array} cookies - Cookies in the loaded profile (for state tracking)
   * @return {Promise<boolean>} Success status
   */
  async markProfileAsLoaded(domain, profileName, cookies) {
    if (!domain || !profileName) {
      return false;
    }
    
    try {
      // Get all metadata
      const metadata = await this.getAllProfilesMetadata();
      
      // Initialize domain entry if needed
      if (!metadata[domain]) {
        metadata[domain] = {};
      }
      
      // Update metadata
      metadata[domain] = {
        lastLoaded: profileName,
        loadTimestamp: Date.now(),
        modified: false,
        cookieCount: cookies.length // Store the count for quick reference
      };
      
      // Store updated metadata
      await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
      
      // Create hash map of normalized cookies for faster comparisons
      this.currentCookieState[domain] = this._createCookieHashMap(cookies);
      
      // Invalidate cache
      this._invalidateCache();
      
      // Emit event for listeners
      this.emit('profileLoaded', { domain, profileName, cookieCount: cookies.length });
      
      return true;
    } catch (error) {
      console.error('Error updating profile metadata:', error);
      return false;
    }
  }

  /**
   * Marks cookies as modified for a domain
   * @param {string} domain - Domain to mark as modified
   * @return {Promise<boolean>} Success status
   */
  async markCookiesAsModified(domain) {
    if (!domain) {
      return false;
    }
    
    try {
      // Get all metadata
      const metadata = await this.getAllProfilesMetadata();
      
      // Skip if no loaded profile for this domain
      if (!metadata[domain] || !metadata[domain].lastLoaded) {
        return false;
      }
      
      // Update modified flag
      metadata[domain].modified = true;
      
      // Store updated metadata
      await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
      
      // Invalidate cache
      this._invalidateCache();
      
      // Emit event for listeners
      this.emit('cookiesModified', { domain });
      
      return true;
    } catch (error) {
      console.error('Error marking cookies as modified:', error);
      return false;
    }
  }

  /**
   * Checks if the current cookies match the loaded profile
   * @param {string} domain - Domain to check
   * @param {Array} currentCookies - Current cookies for comparison
   * @return {Promise<boolean>} True if modified, false if matches or no profile loaded
   */
  async checkIfCookiesModified(domain, currentCookies) {
    if (!domain || !currentCookies || !this.currentCookieState[domain]) {
      return false;
    }
    
    try {
      // Get metadata to check if we have a loaded profile
      const metadata = await this.getAllProfilesMetadata();
      if (!metadata[domain] || !metadata[domain].lastLoaded) {
        return false;
      }
      
      // Quick count check first - if counts differ, cookies must be modified
      if (metadata[domain].cookieCount !== currentCookies.length) {
        await this.markCookiesAsModified(domain);
        return true;
      }
      
      // Create hash map of current cookies
      const currentCookieMap = this._createCookieHashMap(currentCookies);
      
      // Compare cookie maps
      const areEqual = this._compareCookieMaps(
        currentCookieMap,
        this.currentCookieState[domain]
      );
      
      // If not equal, mark as modified
      if (!areEqual) {
        await this.markCookiesAsModified(domain);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking if cookies are modified:', error);
      return false;
    }
  }
  
  /**
   * Creates a map of cookies for faster comparison
   * @param {Array} cookies - Array of cookie objects
   * @return {Object} Map of cookies by name
   * @private
   */
  _createCookieHashMap(cookies) {
    const cookieMap = {};
    
    // Normalize and store by name
    cookies.forEach(cookie => {
      // Create a normalized cookie with default values
      const normalized = {
        name: cookie.name || '',
        value: cookie.value || '',
        domain: cookie.domain || '',
        path: cookie.path || '/',
        secure: !!cookie.secure,
        httpOnly: !!cookie.httpOnly,
        sameSite: cookie.sameSite || 'no_restriction',
        session: !!cookie.session,
        hostOnly: !!cookie.hostOnly,
      };
      
      // Handle expirationDate (omit for session cookies)
      if (!cookie.session && cookie.expirationDate) {
        normalized.expirationDate = cookie.expirationDate;
      }
      
      // Store by name, which is unique per path/domain
      const key = `${normalized.name}|${normalized.domain}|${normalized.path}`;
      cookieMap[key] = normalized;
    });
    
    return cookieMap;
  }
  
  /**
   * Compares two cookie maps for equality
   * @param {Object} map1 - First cookie map
   * @param {Object} map2 - Second cookie map
   * @return {boolean} True if maps are equal
   * @private
   */
  _compareCookieMaps(map1, map2) {
    // Quick check - if key counts differ, maps are not equal
    const keys1 = Object.keys(map1);
    const keys2 = Object.keys(map2);
    
    if (keys1.length !== keys2.length) {
      return false;
    }
    
    // Check for presence of all keys
    for (const key of keys1) {
      if (!map2[key]) {
        return false;
      }
      
      const cookie1 = map1[key];
      const cookie2 = map2[key];
      
      // Compare essential properties (value is most important as name/domain/path are in key)
      if (cookie1.value !== cookie2.value) {
        return false;
      }
      
      // These flags are important for security, so compare them
      if (cookie1.secure !== cookie2.secure || 
          cookie1.httpOnly !== cookie2.httpOnly || 
          cookie1.hostOnly !== cookie2.hostOnly) {
        return false;
      }
      
      // For session cookies, don't compare expiration
      if (!cookie1.session && !cookie2.session && cookie1.expirationDate && cookie2.expirationDate) {
        // Allow slight differences in expiration (within 1 minute)
        const diff = Math.abs(cookie1.expirationDate - cookie2.expirationDate);
        if (diff > 60) { // More than 60 seconds difference
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Deletes a specific profile
   * @param {string} domain - Domain the profile belongs to
   * @param {string} profileName - Name of the profile to delete
   * @return {Promise<boolean>} Success status
   */
  async deleteProfile(domain, profileName) {
    try {
      // Get all profiles
      const profiles = await this.getAllProfiles();
      
      // Check if domain and profile exist
      if (!profiles[domain] || !profiles[domain][profileName]) {
        return false;
      }
      
      // Delete the profile
      delete profiles[domain][profileName];
      
      // Clean up empty domain if needed
      if (Object.keys(profiles[domain]).length === 0) {
        delete profiles[domain];
      }
      
      // Store updated profiles
      await this.storageHandler.setLocal(this.profileStorageKey, profiles);
      
      // Update metadata if this was the last loaded profile
      const metadata = await this.getAllProfilesMetadata();
      if (metadata[domain] && metadata[domain].lastLoaded === profileName) {
        metadata[domain].lastLoaded = null;
        metadata[domain].modified = false;
        await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
      }
      
      // Emit event for listeners
      this.emit('profileDeleted', { domain, profileName });
      
      return true;
    } catch (error) {
      console.error('Error deleting profile:', error);
      return false;
    }
  }

  /**
   * Exports all profiles as JSON
   * @return {Promise<string>} JSON string containing all profiles
   */
  async exportAllProfiles() {
    const profiles = await this.getAllProfiles();
    return JSON.stringify(profiles, null, 2);
  }

  /**
   * Imports profiles from JSON
   * @param {string} jsonString - JSON string containing profiles data
   * @param {boolean} replace - Whether to replace existing profiles (true) or merge (false)
   * @return {Promise<boolean>} Success status
   */
  async importProfiles(jsonString, replace = true) {
    try {
      // Parse the JSON
      const importedProfiles = JSON.parse(jsonString);
      
      // Validate basic structure
      if (typeof importedProfiles !== 'object') {
        return false;
      }
      
      if (replace) {
        // Replace all profiles
        await this.storageHandler.setLocal(this.profileStorageKey, importedProfiles);
      } else {
        // Merge with existing profiles
        const currentProfiles = await this.getAllProfiles();
        
        // Merge domains
        for (const domain in importedProfiles) {
          if (!currentProfiles[domain]) {
            currentProfiles[domain] = {};
          }
          
          // Merge profiles within domain
          for (const profileName in importedProfiles[domain]) {
            currentProfiles[domain][profileName] = importedProfiles[domain][profileName];
          }
        }
        
        // Save merged profiles
        await this.storageHandler.setLocal(this.profileStorageKey, currentProfiles);
      }
      
      // Emit event for listeners
      this.emit('profilesImported');
      
      return true;
    } catch (error) {
      console.error('Error importing profiles:', error);
      return false;
    }
  }

  /**
   * Renames a profile
   * @param {string} domain - Domain the profile belongs to
   * @param {string} oldName - Current name of the profile
   * @param {string} newName - New name for the profile
   * @return {Promise<boolean>} Success status
   */
  async renameProfile(domain, oldName, newName) {
    if (!domain || !oldName || !newName || oldName === newName) {
      return false;
    }
    
    try {
      // Get all profiles
      const profiles = await this.getAllProfiles();
      
      // Check if domain and old profile name exist
      if (!profiles[domain] || !profiles[domain][oldName]) {
        return false;
      }
      
      // Check if new name already exists
      if (profiles[domain][newName]) {
        return false;
      }
      
      // Store the profile data
      const profileData = profiles[domain][oldName];
      
      // Delete the old profile
      delete profiles[domain][oldName];
      
      // Create the new profile with the same data
      profiles[domain][newName] = profileData;
      
      // Store updated profiles
      await this.storageHandler.setLocal(this.profileStorageKey, profiles);
      
      // Update metadata if this was the last loaded profile
      const metadata = await this.getAllProfilesMetadata();
      if (metadata[domain] && metadata[domain].lastLoaded === oldName) {
        metadata[domain].lastLoaded = newName;
        await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
      }
      
      // Emit event for listeners
      this.emit('profileRenamed', { domain, oldName, newName });
      
      return true;
    } catch (error) {
      console.error('Error renaming profile:', error);
      return false;
    }
  }
} 