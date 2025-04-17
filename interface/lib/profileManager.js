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
   * Strips www. from the beginning of a domain if present.
   * @param {string} domain - The domain name
   * @return {string} The canonical domain name (without www.)
   * @private
   */
  _getCanonicalDomain(domain) {
    if (typeof domain === 'string' && domain.toLowerCase().startsWith('www.')) {
      return domain.substring(4);
    }
    return domain;
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
    const canonicalDomain = this._getCanonicalDomain(domain);
    // Check domain-specific cache first
    if (this._isCacheValid() && this.cache.domainProfiles[canonicalDomain]) {
      return this.cache.domainProfiles[canonicalDomain];
    }
    
    const profiles = await this.getAllProfiles();
    // Use canonicalDomain for lookup
    const domainProfiles = profiles[canonicalDomain] || {};
    
    // Update domain-specific cache
    this.cache.domainProfiles[canonicalDomain] = domainProfiles;
    
    return domainProfiles;
  }

  /**
   * Gets metadata for a specific domain
   * @param {string} domain - Domain to get metadata for
   * @return {Promise<Object>} Object containing domain-specific metadata
   */
  async getProfileMetadataForDomain(domain) {
    const canonicalDomain = this._getCanonicalDomain(domain);
    // Check domain-specific cache first
    if (this._isCacheValid() && this.cache.domainMetadata[canonicalDomain]) {
      return this.cache.domainMetadata[canonicalDomain];
    }
    
    const metadata = await this.getAllProfilesMetadata();
    // Use canonicalDomain for lookup
    const domainMetadata = metadata[canonicalDomain] || { lastLoaded: null, loadTimestamp: null, modified: false };
    
    // Update domain-specific cache
    this.cache.domainMetadata[canonicalDomain] = domainMetadata;
    
    return domainMetadata;
  }

  /**
   * Gets profile names for a specific domain
   * @param {string} domain - Domain to get profile names for
   * @return {Promise<string[]>} Array of profile names
   */
  async getProfileNamesForDomain(domain) {
    // getProfilesForDomain already handles canonical domain
    const domainProfiles = await this.getProfilesForDomain(domain);
    return Object.keys(domainProfiles);
  }

  /**
   * Gets a specific profile's cookies
   * @param {string} domain - Domain the profile belongs to
   * @param {string} profileName - Name of the profile to retrieve
   * @return {Promise<Array|Object|null>} Array of cookies in the profile, or profile object with cookies property
   */
  async getProfile(domain, profileName) {
    // getProfilesForDomain already handles canonical domain
    try {
      const domainProfiles = await this.getProfilesForDomain(domain);
      
      if (!domainProfiles || !domainProfiles[profileName]) {
        console.warn(`Profile not found: ${profileName} for domain ${this._getCanonicalDomain(domain)}`); // Log canonical domain
        return null;
      }
      
      const profile = domainProfiles[profileName];
      
      // Log key profile data for debugging without exposing sensitive values
      console.log(`Retrieved profile ${profileName} for ${this._getCanonicalDomain(domain)}:`, 
                  Array.isArray(profile) ? 
                  `Array with ${profile.length} cookies` : 
                  (profile && typeof profile === 'object' ? 
                   `Object with keys: ${Object.keys(profile).join(', ')}` : 
                   `Unexpected type: ${typeof profile}`));
      
      return profile;
    } catch (error) {
      console.error(`Error retrieving profile ${profileName} for ${this._getCanonicalDomain(domain)}:`, error);
      return null;
    }
  }

  /**
   * Saves cookies as a new profile
   * @param {string} domain - Domain the cookies belong to
   * @param {string} profileName - Name for the new profile
   * @param {Array} cookies - Array of cookie objects to save
   * @return {Promise<boolean>} Success status
   */
  async saveProfile(domain, profileName, cookies) {
    const canonicalDomain = this._getCanonicalDomain(domain);
    if (!canonicalDomain || !profileName || !cookies) {
      return false;
    }
    
    try {
      // Get all profiles
      const profiles = await this.getAllProfiles();
      
      // Initialize domain entry if needed (use canonical)
      if (!profiles[canonicalDomain]) {
        profiles[canonicalDomain] = {};
      }
      
      // Save the profile (use canonical)
      profiles[canonicalDomain][profileName] = cookies;
      
      // Store updated profiles
      await this.storageHandler.setLocal(this.profileStorageKey, profiles);
      
      // Invalidate cache
      this._invalidateCache();
      
      // Emit event for listeners
      this.emit('profileSaved', { domain: canonicalDomain, profileName }); // Emit canonical domain
      
      return true;
    } catch (error) {
      console.error('Error saving profile:', error);
      return false;
    }
  }

  /**
   * Marks a profile as loaded for a domain, updating metadata.
   * This resets the modified flag.
   * @param {string} domain - Domain the profile belongs to
   * @param {string} profileName - Name of the loaded profile
   * @return {Promise<boolean>} Success status
   */
  async setProfileAsLoaded(domain, profileName) {
    const canonicalDomain = this._getCanonicalDomain(domain);
    if (!canonicalDomain || !profileName) {
      console.warn('setProfileAsLoaded called with invalid canonical domain or profileName', { canonicalDomain, profileName });
      return false;
    }

    try {
      // Get all metadata
      const metadata = await this.getAllProfilesMetadata();

      // Initialize domain entry if needed (use canonical)
      if (!metadata[canonicalDomain]) {
        metadata[canonicalDomain] = {};
      }

      // Update metadata for the domain (use canonical)
      metadata[canonicalDomain] = {
        ...metadata[canonicalDomain], // Preserve any other potential metadata
        lastLoaded: profileName,
        loadTimestamp: Date.now(),
        modified: false // Reset modified status on successful load
      };

      // Store updated metadata
      await this.storageHandler.setLocal(this.metadataStorageKey, metadata);

      // Invalidate cache
      this._invalidateCache();

      // Emit event for listeners
      this.emit('profileLoaded', { domain: canonicalDomain, profileName }); // Emit canonical domain

      console.log(`Profile ${profileName} marked as loaded for domain ${canonicalDomain}.`);
      return true;
    } catch (error) {
      console.error(`Error marking profile ${profileName} as loaded for ${canonicalDomain}:`, error);
      return false;
    }
  }

  /**
   * Marks cookies as modified for a domain
   * @param {string} domain - Domain to mark as modified
   * @return {Promise<boolean>} Success status
   */
  async markCookiesAsModified(domain) {
    const canonicalDomain = this._getCanonicalDomain(domain);
    if (!canonicalDomain) {
      console.warn('markCookiesAsModified called with invalid canonical domain', { canonicalDomain });
      return false;
    }
    
    try {
        // Get all metadata
        const metadata = await this.getAllProfilesMetadata();
        
        // Only proceed if metadata exists for this domain and a profile was loaded
        if (metadata[canonicalDomain] && metadata[canonicalDomain].lastLoaded) {
            // Check if already marked as modified
            if (metadata[canonicalDomain].modified) {
                // console.log(`Cookies for ${canonicalDomain} already marked as modified.`);
                return false; // No change needed
            }
            
            // Mark as modified
            metadata[canonicalDomain].modified = true;
            
            // Store updated metadata
            await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
            
            // Invalidate cache only for this domain's metadata
            if (this.cache.domainMetadata[canonicalDomain]) {
              this.cache.domainMetadata[canonicalDomain].modified = true;
            }
            // Optionally invalidate the full metadata cache if simpler
            // this._invalidateCache(); 
            
            // Emit event
            this.emit('profileModified', { domain: canonicalDomain, profileName: metadata[canonicalDomain].lastLoaded });
            
            console.log(`Cookies for domain ${canonicalDomain} marked as modified.`);
            return true;
        } else {
            // console.log(`No loaded profile found for ${canonicalDomain}, cannot mark as modified.`);
            return false; // No profile loaded for this domain
        }
    } catch (error) {
        console.error(`Error marking cookies as modified for ${canonicalDomain}:`, error);
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
    const canonicalDomain = this._getCanonicalDomain(domain);
    if (!canonicalDomain) {
      console.warn('checkIfCookiesModified called with invalid canonical domain', { canonicalDomain });
      return false;
    }
    
    try {
        // Get metadata for the domain
        const metadata = await this.getProfileMetadataForDomain(canonicalDomain); // Uses canonical domain internally
        
        // If no profile is loaded, they can't be modified relative to a profile
        if (!metadata.lastLoaded) {
            console.log(`[checkIfCookiesModified] No profile loaded for ${canonicalDomain}.`);
            // Ensure 'modified' is false if no profile is loaded
            if (metadata.modified) {
                await this.resetModifiedStatus(canonicalDomain);
                return true; // Status changed from modified->false
            }
            return false; // Status was already false
        }
        
        const loadedProfileName = metadata.lastLoaded;
        
        // Get the cookies from the currently loaded profile
        const loadedProfile = await this.getProfile(canonicalDomain, loadedProfileName); // Uses canonical domain internally
        
        let loadedCookies = [];
        if (Array.isArray(loadedProfile)) {
          loadedCookies = loadedProfile;
        } else if (loadedProfile && Array.isArray(loadedProfile.cookies)) {
          loadedCookies = loadedProfile.cookies;
        } else {
          console.warn(`[checkIfCookiesModified] Loaded profile "${loadedProfileName}" for ${canonicalDomain} has unexpected structure. Cannot compare.`);
          // If we can't compare, should we assume modified or not? Let's assume not modified.
          if (metadata.modified) {
             await this.resetModifiedStatus(canonicalDomain);
             return true; // Status changed
          }
          return false; // Status was already false
        }
        
        // Compare current cookies with loaded profile cookies
        const currentMap = this._createCookieHashMap(currentCookies);
        const loadedMap = this._createCookieHashMap(loadedCookies);
        const areDifferent = this._compareCookieMaps(currentMap, loadedMap);
        
        console.log(`[checkIfCookiesModified] Comparison result for ${canonicalDomain} (${loadedProfileName}):`, areDifferent ? 'DIFFERENT' : 'SAME');
        
        // Update modified status if it changed
        let statusChanged = false;
        if (areDifferent && !metadata.modified) {
            await this.markCookiesAsModified(canonicalDomain); // Uses canonical domain internally
            statusChanged = true;
        } else if (!areDifferent && metadata.modified) {
            await this.resetModifiedStatus(canonicalDomain);
            statusChanged = true;
        }
        
        return areDifferent || statusChanged;
        
    } catch (error) {
        console.error(`Error checking if cookies modified for ${canonicalDomain}:`, error);
        return false; // Return false on error, don't change state
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
   * @return {boolean} True if maps are different (not equal)
   * @private
   */
  _compareCookieMaps(map1, map2) {
    // Quick check - if key counts differ, maps are not equal
    const keys1 = Object.keys(map1);
    const keys2 = Object.keys(map2);
    
    if (keys1.length !== keys2.length) {
      console.log(`Cookie count mismatch: ${keys1.length} vs ${keys2.length}`);
      return true; // Maps are different
    }
    
    // List of dynamic cookies that change frequently by themselves
    const dynamicCookies = ['_dd_s', 'datadome']; 
    
    // Check for presence of all keys
    for (const key of keys1) {
      if (!map2[key]) {
        console.log(`Cookie key missing from second map: ${key}`);
        return true; // Maps are different
      }
      
      const cookie1 = map1[key];
      const cookie2 = map2[key];
      
      // Skip detailed comparison for known dynamic cookies
      const cookieName = key.split('|')[0];
      if (dynamicCookies.includes(cookieName)) {
        console.log(`Skipping detailed comparison for dynamic cookie: ${cookieName}`);
        continue;
      }
      
      // Compare essential properties (value is most important as name/domain/path are in key)
      if (cookie1.value !== cookie2.value) {
        console.log(`Cookie value mismatch for ${key}: "${cookie1.value}" vs "${cookie2.value}"`);
        return true; // Maps are different
      }
      
      // These flags are important for security, so compare them
      if (cookie1.secure !== cookie2.secure || 
          cookie1.httpOnly !== cookie2.httpOnly || 
          cookie1.hostOnly !== cookie2.hostOnly) {
        console.log(`Cookie flags mismatch for ${key}: secure=${cookie1.secure}/${cookie2.secure}, httpOnly=${cookie1.httpOnly}/${cookie2.httpOnly}, hostOnly=${cookie1.hostOnly}/${cookie2.hostOnly}`);
        return true; // Maps are different
      }
      
      // For session cookies, don't compare expiration
      if (!cookie1.session && !cookie2.session && cookie1.expirationDate && cookie2.expirationDate) {
        // Allow slight differences in expiration (within 1 minute)
        const diff = Math.abs(cookie1.expirationDate - cookie2.expirationDate);
        if (diff > 60) { // More than 60 seconds difference
          console.log(`Cookie expiration mismatch for ${key}: ${cookie1.expirationDate} vs ${cookie2.expirationDate}, diff: ${diff}s`);
          return true; // Maps are different
        }
      }
    }
    
    return false; // Maps are equal (not different)
  }

  /**
   * Deletes a specific profile
   * @param {string} domain - Domain the profile belongs to
   * @param {string} profileName - Name of the profile to delete
   * @return {Promise<boolean>} Success status
   */
  async deleteProfile(domain, profileName) {
    const canonicalDomain = this._getCanonicalDomain(domain);
    try {
      // Get all profiles
      const profiles = await this.getAllProfiles();
      
      // Check if domain and profile exist (use canonical)
      if (!profiles[canonicalDomain] || !profiles[canonicalDomain][profileName]) {
        return false;
      }
      
      // Delete the profile (use canonical)
      delete profiles[canonicalDomain][profileName];
      
      // Clean up empty domain if needed (use canonical)
      if (Object.keys(profiles[canonicalDomain]).length === 0) {
        delete profiles[canonicalDomain];
      }
      
      // Store updated profiles
      await this.storageHandler.setLocal(this.profileStorageKey, profiles);
      
      // Update metadata if this was the last loaded profile (use canonical)
      const metadata = await this.getAllProfilesMetadata();
      if (metadata[canonicalDomain] && metadata[canonicalDomain].lastLoaded === profileName) {
        metadata[canonicalDomain].lastLoaded = null;
        metadata[canonicalDomain].modified = false;
        await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
      }
      
      // Invalidate cache
      this._invalidateCache();

      // Emit event for listeners
      this.emit('profileDeleted', { domain: canonicalDomain, profileName }); // Emit canonical domain

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
      const importedData = JSON.parse(jsonString);

      // Validate basic structure
      if (typeof importedData !== 'object' || importedData === null) {
         throw new Error('Invalid import data: Not an object.');
      }

      // Normalize domain keys in the imported data
      const importedProfiles = {};
      for (const domain in importedData) {
        const canonicalDomain = this._getCanonicalDomain(domain);
        if (!importedProfiles[canonicalDomain]) {
          importedProfiles[canonicalDomain] = {};
        }
        // Merge profiles under the canonical domain
        Object.assign(importedProfiles[canonicalDomain], importedData[domain]);
      }


      if (replace) {
        // Replace all profiles with the normalized ones
        await this.storageHandler.setLocal(this.profileStorageKey, importedProfiles);
         // Clear all metadata when replacing profiles
        await this.storageHandler.setLocal(this.metadataStorageKey, {});
      } else {
        // Merge with existing profiles
        const currentProfiles = await this.getAllProfiles(); // Already uses canonical keys internally

        // Merge domains
        for (const canonicalDomain in importedProfiles) {
          if (!currentProfiles[canonicalDomain]) {
            currentProfiles[canonicalDomain] = {};
          }

          // Merge profiles within domain
          Object.assign(currentProfiles[canonicalDomain], importedProfiles[canonicalDomain]);
          // for (const profileName in importedProfiles[canonicalDomain]) {
          //   currentProfiles[canonicalDomain][profileName] = importedProfiles[canonicalDomain][profileName];
          // }
        }

        // Save merged profiles
        await this.storageHandler.setLocal(this.profileStorageKey, currentProfiles);
        // Note: Merging doesn't automatically clear metadata for existing domains.
        // Consider if metadata should be updated/cleared during merge.
      }
      
      // Invalidate cache after import/replace
      this._invalidateCache();

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
    const canonicalDomain = this._getCanonicalDomain(domain);
    if (!canonicalDomain || !oldName || !newName || oldName === newName) {
      return false;
    }
    
    try {
        // Get all profiles
        const profiles = await this.getAllProfiles(); // Uses canonical
        
        // Check if domain exists and old name exists, and new name doesn't exist
        if (!profiles[canonicalDomain] || !profiles[canonicalDomain][oldName] || profiles[canonicalDomain][newName]) {
            console.warn(`Rename failed: Profile ${oldName} not found or ${newName} already exists for ${canonicalDomain}`);
            return false;
        }
        
        // Rename the profile
        profiles[canonicalDomain][newName] = profiles[canonicalDomain][oldName];
        delete profiles[canonicalDomain][oldName];
        
        // Store updated profiles
        await this.storageHandler.setLocal(this.profileStorageKey, profiles);
        
        // Update metadata if the renamed profile was the last loaded one
        const metadata = await this.getAllProfilesMetadata(); // Uses canonical
        if (metadata[canonicalDomain] && metadata[canonicalDomain].lastLoaded === oldName) {
            metadata[canonicalDomain].lastLoaded = newName;
            // Keep 'modified' status as is, since the cookies themselves haven't changed
            await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
        }
        
        // Invalidate cache
        this._invalidateCache();
        
        // Emit event
        this.emit('profileRenamed', { domain: canonicalDomain, oldName, newName }); // Emit canonical
        
        return true;
    } catch (error) {
        console.error(`Error renaming profile ${oldName} to ${newName} for ${canonicalDomain}:`, error);
        return false;
    }
  }

  /**
   * Resets the modified status for a domain's metadata.
   * Internal helper used by checkIfCookiesModified.
   * @param {string} domain - The canonical domain.
   * @return {Promise<boolean>} Success status
   * @private
   */
   async resetModifiedStatus(domain) {
       const canonicalDomain = this._getCanonicalDomain(domain); // Ensure canonical
       if (!canonicalDomain) return false;
       
       try {
           const metadata = await this.getAllProfilesMetadata();
           if (metadata[canonicalDomain] && metadata[canonicalDomain].modified) {
               metadata[canonicalDomain].modified = false;
               await this.storageHandler.setLocal(this.metadataStorageKey, metadata);
               
               // Update cache
               if (this.cache.domainMetadata[canonicalDomain]) {
                   this.cache.domainMetadata[canonicalDomain].modified = false;
               }
               
               this.emit('profileUnmodified', { domain: canonicalDomain, profileName: metadata[canonicalDomain].lastLoaded });
               console.log(`Reset modified status for ${canonicalDomain}.`);
               return true;
           }
           return false; // Not modified or no metadata
       } catch (error) {
           console.error(`Error resetting modified status for ${canonicalDomain}:`, error);
           return false;
       }
   }
} 