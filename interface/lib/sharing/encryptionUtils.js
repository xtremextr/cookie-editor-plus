/**
 * Encryption Utilities for Cookie-Editor Plus
 * Provides secure password-based encryption/decryption using Web Crypto API
 */

// Constants for encryption
const PBKDF2_ITERATIONS = 100000;  // Number of iterations for key derivation
const SALT_LENGTH = 16;            // Salt length in bytes
const KEY_LENGTH = 32;             // AES-256 key length in bytes
const IV_LENGTH = 12;              // IV length for AES-GCM in bytes
const ENCODED_PREFIX = 'encrypted';// Prefix for the encrypted data format

/**
 * Generates a random array of bytes
 * @param {number} length - Number of bytes to generate
 * @return {Uint8Array} Random bytes
 */
function getRandomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Derives a key from a password using PBKDF2
 * @param {string} password - The user's password
 * @param {Uint8Array} salt - Salt for key derivation
 * @return {Promise<CryptoKey>} Derived key
 */
async function deriveKey(password, salt) {
  // Convert password to key material
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Create a key from the password
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  // Derive an AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH * 8 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts data with a password
 * @param {string} data - Data to encrypt (typically JSON string)
 * @param {string} password - Password for encryption
 * @return {Promise<object>} Object containing encrypted data and parameters
 */
export async function encryptData(data, password) {
  try {
    // Generate random salt and IV
    const salt = getRandomBytes(SALT_LENGTH);
    const iv = getRandomBytes(IV_LENGTH);
    
    // Derive key from password and salt
    const key = await deriveKey(password, salt);
    
    // Encrypt the data
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );
    
    // Convert encrypted data to base64
    const encryptedBase64 = bufferToBase64(new Uint8Array(encryptedBuffer));
    const saltBase64 = bufferToBase64(salt);
    const ivBase64 = bufferToBase64(iv);
    
    // Return encrypted data with parameters needed for decryption
    return {
      version: 1,
      prefix: ENCODED_PREFIX,
      encrypted: encryptedBase64,
      salt: saltBase64,
      iv: ivBase64
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts data with a password
 * @param {object} params - Object containing encrypted data and parameters
 * @param {string} password - Password for decryption
 * @return {Promise<string>} Decrypted data
 */
export async function decryptData(params, password) {
  try {
    // Extract parameters
    const { encrypted, salt, iv } = params;
    
    // Convert base64 to buffers
    const encryptedBuffer = base64ToBuffer(encrypted);
    const saltBuffer = base64ToBuffer(salt);
    const ivBuffer = base64ToBuffer(iv);
    
    // Derive key from password and salt
    const key = await deriveKey(password, saltBuffer);
    
    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      encryptedBuffer
    );
    
    // Convert decrypted data to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data. The password may be incorrect.');
  }
}

/**
 * Evaluates password strength
 * @param {string} password - Password to evaluate
 * @return {object} Strength assessment
 */
export function evaluatePasswordStrength(password) {
  if (!password) {
    return { score: 0, feedback: 'Enter a password', level: 'none' };
  }
  
  let score = 0;
  const feedback = [];
  
  // Length check
  if (password.length < 8) {
    feedback.push('Password is too short');
  } else {
    score += Math.min(2, Math.floor(password.length / 8));
  }
  
  // Character variety checks
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  // Determine level based on score
  let level = 'weak';
  if (score >= 5) {
    level = 'strong';
    feedback.push('Strong password');
  } else if (score >= 3) {
    level = 'medium';
    feedback.push('Medium strength password');
  } else {
    feedback.push('Weak password');
  }
  
  return {
    score,
    feedback: feedback.join('. '),
    level
  };
}

/**
 * Converts an ArrayBuffer or Uint8Array to base64 string
 * @param {ArrayBuffer|Uint8Array} buffer - Buffer to convert
 * @return {string} Base64 string
 */
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to Uint8Array
 * @param {string} base64 - Base64 string to convert
 * @return {Uint8Array} Converted buffer
 */
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
} 