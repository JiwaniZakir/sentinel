/**
 * Session Manager Service
 * 
 * Manages encrypted cookie storage and session validation for LinkedIn accounts.
 * Uses AES-256 encryption to securely store session cookies in PostgreSQL.
 */

const crypto = require('crypto');
const { logger } = require('../../utils/logger');

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';

// Session expiry duration (30 days - typical LinkedIn session lifetime)
const SESSION_LIFETIME_DAYS = 30;

// Session refresh threshold (7 days - refresh proactively)
const SESSION_REFRESH_DAYS = 7;

/**
 * Get encryption key from environment
 */
function getEncryptionKey() {
  const key = process.env.SESSION_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('SESSION_ENCRYPTION_KEY environment variable not set');
  }
  
  // Convert hex string to buffer (should be 32 bytes / 64 hex chars)
  if (key.length !== 64) {
    throw new Error('SESSION_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(text) {
  try {
    const key = getEncryptionKey();
    
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Return combined format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    
  } catch (error) {
    logger.error(`[SessionManager] Encryption error: ${error.message}`);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(encryptedData) {
  try {
    const key = getEncryptionKey();
    
    // Split the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
    
  } catch (error) {
    logger.error(`[SessionManager] Decryption error: ${error.message}`);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Encrypt and serialize cookies for storage
 */
function encryptCookies(cookies) {
  if (!cookies || cookies.length === 0) {
    return null;
  }
  
  // Convert cookies array/object to JSON string
  const cookiesJson = JSON.stringify(cookies);
  
  // Encrypt the JSON
  return encrypt(cookiesJson);
}

/**
 * Decrypt and deserialize cookies from storage
 */
function decryptCookies(encryptedCookies) {
  if (!encryptedCookies) {
    return null;
  }
  
  try {
    // Decrypt the data
    const cookiesJson = decrypt(encryptedCookies);
    
    // Parse JSON
    return JSON.parse(cookiesJson);
    
  } catch (error) {
    logger.error(`[SessionManager] Failed to decrypt cookies: ${error.message}`);
    return null;
  }
}

/**
 * Encrypt a password for storage
 */
function encryptPassword(password) {
  return encrypt(password);
}

/**
 * Decrypt a password from storage
 */
function decryptPassword(encryptedPassword) {
  return decrypt(encryptedPassword);
}

/**
 * Check if a session is still valid
 */
function isSessionValid(sessionExpiry) {
  if (!sessionExpiry) {
    return false;
  }
  
  const now = new Date();
  const expiry = new Date(sessionExpiry);
  
  return now < expiry;
}

/**
 * Check if a session needs refresh (within 7 days of expiry)
 */
function shouldRefreshSession(sessionExpiry) {
  if (!sessionExpiry) {
    return true;
  }
  
  const now = new Date();
  const expiry = new Date(sessionExpiry);
  const refreshThreshold = new Date(now.getTime() + SESSION_REFRESH_DAYS * 24 * 60 * 60 * 1000);
  
  return expiry < refreshThreshold;
}

/**
 * Calculate session expiry date (30 days from now)
 */
function calculateSessionExpiry() {
  const now = new Date();
  return new Date(now.getTime() + SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Extract critical LinkedIn cookies from a full cookie set
 * LinkedIn sessions rely on specific cookies like 'li_at' and 'JSESSIONID'
 */
function extractLinkedInCookies(allCookies) {
  if (!allCookies || allCookies.length === 0) {
    return [];
  }
  
  // Critical cookies for LinkedIn session
  const criticalCookieNames = [
    'li_at',           // Main auth token
    'JSESSIONID',      // Session ID
    'liap',            // Additional auth
    'li_a',            // Another auth token
  ];
  
  // Filter to only include critical cookies
  const filtered = allCookies.filter(cookie => {
    const name = cookie.name || cookie.Name;
    return criticalCookieNames.includes(name);
  });
  
  return filtered;
}

/**
 * Convert Selenium cookie format to object format
 */
function normalizeCookies(cookies) {
  if (!Array.isArray(cookies)) {
    return [];
  }
  
  return cookies.map(cookie => ({
    name: cookie.name || cookie.Name,
    value: cookie.value || cookie.Value,
    domain: cookie.domain || cookie.Domain || '.linkedin.com',
    path: cookie.path || cookie.Path || '/',
    expires: cookie.expires || cookie.Expiry || cookie.expiry,
    httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : (cookie.HttpOnly || false),
    secure: cookie.secure !== undefined ? cookie.secure : (cookie.Secure || true),
  }));
}

/**
 * Validate that cookies contain the minimum required LinkedIn session data
 */
function validateLinkedInCookies(cookies) {
  if (!cookies || cookies.length === 0) {
    return false;
  }
  
  // Must have at least the li_at cookie (primary auth token)
  const hasLiAt = cookies.some(c => (c.name || c.Name) === 'li_at');
  
  return hasLiAt;
}

/**
 * Generate a random encryption key (for initial setup)
 * Run this once and save the output to SESSION_ENCRYPTION_KEY env var
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  // Encryption/Decryption
  encrypt,
  decrypt,
  encryptCookies,
  decryptCookies,
  encryptPassword,
  decryptPassword,
  
  // Session validation
  isSessionValid,
  shouldRefreshSession,
  calculateSessionExpiry,
  
  // Cookie utilities
  extractLinkedInCookies,
  normalizeCookies,
  validateLinkedInCookies,
  
  // Key generation
  generateEncryptionKey,
  
  // Constants
  SESSION_LIFETIME_DAYS,
  SESSION_REFRESH_DAYS,
};

