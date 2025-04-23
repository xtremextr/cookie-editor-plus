/**
 * Cookie Sharing functionality for Cookie-Editor Plus
 * Allows encoding cookies to URL format and decoding them from URLs.
 */
import { encryptData, decryptData } from './encryptionUtils.js';

// Format version to ensure backward compatibility if the format changes
const SHARING_VERSION = 1;
const PREFIX = 'ce-cookies-extension-share';
const ENCRYPTED_PREFIX = 'ce-cookies-extension-share-encrypted';
const PROFILE_PREFIX = 'ce-profiles-extension-share';
const ENCRYPTED_PROFILE_PREFIX = 'ce-profiles-extension-share-encrypted';

/**
 * Encodes cookies into a shareable URL format.
 * @param {Array} cookies - Array of cookie objects to encode
 * @param {string} domain - The domain these cookies belong to
 * @param {boolean} expires - Whether the share link should expire (24h)
 * @return {string} The encoded URL hash parameter
 */
export function encodeCookies(cookies, domain, expires = true) {
  // Create a wrapper with metadata
  const wrapper = {
    v: SHARING_VERSION,
    d: domain,
    c: cookies,
    t: Date.now(),
    e: expires ? Date.now() + (24 * 60 * 60 * 1000) : 0 // 24h expiration if enabled, 0 for no expiration
  };
  
  // Convert to JSON and encode to base64
  const json = JSON.stringify(wrapper);
  return btoa(encodeURIComponent(json));
}

/**
 * Encrypts cookies with a password for secure sharing
 * @param {Array} cookies - Array of cookie objects to encode
 * @param {string} domain - The domain these cookies belong to
 * @param {string} password - Password for encryption
 * @param {boolean} expires - Whether the share link should expire (24h)
 * @return {Promise<object>} Object with encrypted data parameters
 */
export async function encryptCookies(cookies, domain, password, expires = true) {
  // Create a wrapper with metadata (same as encodeCookies)
  const wrapper = {
    v: SHARING_VERSION,
    d: domain,
    c: cookies,
    t: Date.now(),
    e: expires ? Date.now() + (24 * 60 * 60 * 1000) : 0
  };
  
  // Convert to JSON string
  const json = JSON.stringify(wrapper);
  
  // Encrypt the JSON data with the password
  return await encryptData(json, password);
}

/**
 * Decodes cookies from a URL hash parameter.
 * @param {string} encoded - The encoded cookie data
 * @return {object|null} The decoded cookie data or null if invalid/expired
 */
export function decodeCookies(encoded) {
  try {
    // Decode from base64 and parse JSON
    const json = decodeURIComponent(atob(encoded));
    const data = JSON.parse(json);
    
    // Validate format version
    if (data.v !== SHARING_VERSION) {
      console.warn('Incompatible cookie sharing format version');
      return null;
    }
    
    // Check if expired
    if (data.e !== 0 && data.e < Date.now()) {
      console.warn('Shared cookies have expired');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decode shared cookies:', error);
    return null;
  }
}

/**
 * Attempts to decrypt cookies from encrypted data
 * @param {object} params - The encrypted data parameters
 * @param {string} password - Password for decryption
 * @return {Promise<object|null>} Decrypted cookie data or null if invalid
 */
export async function decryptCookies(params, password) {
  try {
    // Decrypt the data
    const json = await decryptData(params, password);
    
    // Parse the JSON
    const data = JSON.parse(json);
    
    // Validate format version
    if (data.v !== SHARING_VERSION) {
      console.warn('Incompatible cookie sharing format version');
      return null;
    }
    
    // Check if expired
    if (data.e !== 0 && data.e < Date.now()) {
      console.warn('Shared cookies have expired');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decrypt shared cookies:', error);
    return null;
  }
}

/**
 * Creates a shareable URL for the given cookies and domain.
 * @param {Array} cookies - Array of cookie objects
 * @param {string} domain - The domain these cookies belong to
 * @param {boolean} expires - Whether the share link should expire
 * @param {object} options - Additional options
 * @param {boolean} options.encrypted - Whether to encrypt with password
 * @param {string} options.password - Password for encryption (if encrypted is true)
 * @return {Promise<string>} Full URL to share
 */
export async function createShareableUrl(cookies, domain, expires = true, options = {}) {
  const baseUrl = `https://${domain}`;
  
  // If encryption is requested and a password is provided
  if (options.encrypted && options.password) {
    // Encrypt the cookies
    const encryptedData = await encryptCookies(cookies, domain, options.password, expires);
    
    // Format the URL with encrypted data
    const queryParams = new URLSearchParams();
    queryParams.set('data', encryptedData.encrypted);
    queryParams.set('salt', encryptedData.salt);
    queryParams.set('iv', encryptedData.iv);
    
    return `${baseUrl}#${ENCRYPTED_PREFIX}=${queryParams.toString()}`;
  } else {
    // Use standard encoding (backward compatible)
    const encoded = encodeCookies(cookies, domain, expires);
    return `${baseUrl}#${PREFIX}=${encoded}`;
  }
}

/**
 * Encodes profiles into a shareable URL format.
 * @param {Object} profiles - Object containing profile data to encode
 * @param {string} domain - The domain these profiles belong to
 * @param {boolean} expires - Whether the share link should expire (24h)
 * @return {string} The encoded URL hash parameter
 */
export function encodeProfiles(profiles, domain, expires = true) {
  // Create a wrapper with metadata
  const wrapper = {
    v: SHARING_VERSION,
    d: domain,
    p: profiles, // Use 'p' for profiles instead of 'c' for cookies
    t: Date.now(),
    e: expires ? Date.now() + (24 * 60 * 60 * 1000) : 0 // 24h expiration if enabled, 0 for no expiration
  };
  
  // Convert to JSON and encode to base64
  const json = JSON.stringify(wrapper);
  return btoa(encodeURIComponent(json));
}

/**
 * Encrypts profiles with a password for secure sharing
 * @param {Object} profiles - Object containing profile data to encode
 * @param {string} domain - The domain these profiles belong to
 * @param {string} password - Password for encryption
 * @param {boolean} expires - Whether the share link should expire (24h)
 * @return {Promise<object>} Object with encrypted data parameters
 */
export async function encryptProfiles(profiles, domain, password, expires = true) {
  // Create a wrapper with metadata
  const wrapper = {
    v: SHARING_VERSION,
    d: domain,
    p: profiles, // Use 'p' for profiles instead of 'c' for cookies
    t: Date.now(),
    e: expires ? Date.now() + (24 * 60 * 60 * 1000) : 0
  };
  
  // Convert to JSON string
  const json = JSON.stringify(wrapper);
  
  // Encrypt the JSON data with the password
  return await encryptData(json, password);
}

/**
 * Decodes profiles from a URL hash parameter.
 * @param {string} encoded - The encoded profile data
 * @return {object|null} The decoded profile data or null if invalid/expired
 */
export function decodeProfiles(encoded) {
  try {
    // Decode from base64 and parse JSON
    const json = decodeURIComponent(atob(encoded));
    const data = JSON.parse(json);
    
    // Validate format version
    if (data.v !== SHARING_VERSION) {
      console.warn('Incompatible profile sharing format version');
      return null;
    }
    
    // Check if expired
    if (data.e !== 0 && data.e < Date.now()) {
      console.warn('Shared profiles have expired');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decode shared profiles:', error);
    return null;
  }
}

/**
 * Attempts to decrypt profiles from encrypted data
 * @param {object} params - The encrypted data parameters
 * @param {string} password - Password for decryption
 * @return {Promise<object|null>} Decrypted profile data or null if invalid
 */
export async function decryptProfiles(params, password) {
  try {
    // Decrypt the data
    const json = await decryptData(params, password);
    
    // Parse the JSON
    const data = JSON.parse(json);
    
    // Validate format version
    if (data.v !== SHARING_VERSION) {
      console.warn('Incompatible profile sharing format version');
      return null;
    }
    
    // Check if expired
    if (data.e !== 0 && data.e < Date.now()) {
      console.warn('Shared profiles have expired');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decrypt shared profiles:', error);
    return null;
  }
}

/**
 * Creates a shareable URL for the given profiles and domain.
 * @param {Object} profiles - Object containing profile data
 * @param {string} domain - The domain these profiles belong to
 * @param {boolean} expires - Whether the share link should expire
 * @param {object} options - Additional options
 * @param {boolean} options.encrypted - Whether to encrypt with password
 * @param {string} options.password - Password for encryption (if encrypted is true)
 * @return {Promise<string>} Full URL to share
 */
export async function createShareableProfilesUrl(profiles, domain, expires = true, options = {}) {
  const baseUrl = `https://${domain}`;
  
  // If encryption is requested and a password is provided
  if (options.encrypted && options.password) {
    // Encrypt the profiles
    const encryptedData = await encryptProfiles(profiles, domain, options.password, expires);
    
    // Format the URL with encrypted data
    const queryParams = new URLSearchParams();
    queryParams.set('data', encryptedData.encrypted);
    queryParams.set('salt', encryptedData.salt);
    queryParams.set('iv', encryptedData.iv);
    
    return `${baseUrl}#${ENCRYPTED_PROFILE_PREFIX}=${queryParams.toString()}`;
  } else {
    // Use standard encoding
    const encoded = encodeProfiles(profiles, domain, expires);
    return `${baseUrl}#${PROFILE_PREFIX}=${encoded}`;
  }
}

/**
 * Extracts shared data from a URL if present (works for both cookies and profiles).
 * @param {string} url - URL to check for shared data
 * @return {object|null} Decoded data or null if not found/invalid
 */
export function extractSharedDataFromUrl(url) {
  try {
    // Extract the hash part from the URL
    const hashIndex = url.indexOf('#');
    if (hashIndex === -1) return null;
    
    const hash = url.substring(hashIndex + 1);
    
    // Check if this is a cookie or profile URL
    let dataType = 'cookies';
    
    // Check for encrypted profiles
    if (hash.startsWith(`${ENCRYPTED_PROFILE_PREFIX}=`)) {
      dataType = 'profiles';
      // Extract encrypted parameters
      const encodedParams = hash.substring(ENCRYPTED_PROFILE_PREFIX.length + 1);
      
      try {
        // Parse the parameters from the URL
        const params = new URLSearchParams(encodedParams);
        
        // We need all these parameters for successful decryption
        if (params.has('data') && params.has('salt') && params.has('iv')) {
          return {
            type: dataType,
            encrypted: true,
            params: {
              encrypted: params.get('data'),
              salt: params.get('salt'),
              iv: params.get('iv')
            }
          };
        }
      } catch (parseError) {
        console.error('Error parsing encrypted profile parameters:', parseError);
      }
      
      return null;
    }
    
    // Check for regular profile URL
    if (hash.startsWith(`${PROFILE_PREFIX}=`)) {
      dataType = 'profiles';
      const encodedData = hash.substring(PROFILE_PREFIX.length + 1);
      const data = decodeProfiles(encodedData);
      if (data) {
        return {
          type: dataType,
          ...data
        };
      }
      return null;
    }
    
    // Check for encrypted cookies (existing functionality)
    if (hash.startsWith(`${ENCRYPTED_PREFIX}=`)) {
      // Extract encrypted parameters
      const encodedParams = hash.substring(ENCRYPTED_PREFIX.length + 1);
      
      try {
        // Extract and parse the parameters
        const params = new URLSearchParams(encodedParams);
        
        // We need all these parameters for successful decryption
        if (params.has('data') && params.has('salt') && params.has('iv')) {
          return {
            type: dataType,
            encrypted: true,
            params: {
              encrypted: params.get('data'),
              salt: params.get('salt'),
              iv: params.get('iv')
            }
          };
        }
      } catch (parseError) {
        console.error('Error parsing encrypted cookie parameters:', parseError);
        console.error('Raw encoded params:', encodedParams);
      }
      
      return null;
    }
    
    // Check for regular cookie URL (backward compatibility)
    const params = new URLSearchParams(hash);
    
    if (params.has(PREFIX)) {
      const encodedData = params.get(PREFIX);
      const data = decodeCookies(encodedData);
      if (data) {
        return {
          type: dataType,
          ...data
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting shared data from URL:', error);
    return null;
  }
}

// Keep backward compatibility
export function extractSharedCookiesFromUrl(url) {
  const data = extractSharedDataFromUrl(url);
  if (data && data.type === 'cookies') {
    return data;
  }
  return null;
}

/**
 * Formats an expiration timestamp into a human-readable string.
 * @param {number} timestamp - Expiration timestamp
 * @return {string} Formatted expiration time
 */
export function formatExpiration(timestamp) {
  if (!timestamp || timestamp === 0) return 'No expiration';
  
  const expiryDate = new Date(timestamp);
  const now = new Date();
  const diffMs = expiryDate - now;
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHrs <= 0 && diffMins <= 0) return 'Expired';
  return `Expires in ${diffHrs}h ${diffMins}m`;
} 

