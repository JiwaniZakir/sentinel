const config = require('../config');

/**
 * Check if a user is an admin
 */
function isAdmin(userId) {
  return config.adminSlackIds.includes(userId);
}

/**
 * Validate partner type
 */
function isValidPartnerType(type) {
  const validTypes = ['VC', 'CORPORATE', 'COMMUNITY_BUILDER', 'ANGEL', 'OTHER'];
  return validTypes.includes(type?.toUpperCase());
}

/**
 * Validate event type
 */
function isValidEventType(type) {
  const validTypes = [
    'pitch_night',
    'demo_day',
    'office_hours',
    'networking_event',
    'workshop',
    'other',
  ];
  return validTypes.includes(type?.toLowerCase());
}

/**
 * Parse partner type from string (for AI responses)
 */
function parsePartnerType(typeString) {
  if (!typeString) return 'OTHER';
  
  const normalized = typeString.toUpperCase().replace(/[^A-Z]/g, '_');
  
  if (normalized.includes('VC') || normalized.includes('VENTURE')) return 'VC';
  if (normalized.includes('CORPORATE') || normalized.includes('ENTERPRISE')) return 'CORPORATE';
  if (normalized.includes('COMMUNITY') || normalized.includes('ACCELERATOR') || normalized.includes('INCUBATOR')) return 'COMMUNITY_BUILDER';
  if (normalized.includes('ANGEL')) return 'ANGEL';
  
  return 'OTHER';
}

/**
 * Parse sectors from AI response
 */
function parseSectors(sectorsInput) {
  if (!sectorsInput) return [];
  if (Array.isArray(sectorsInput)) return sectorsInput;
  if (typeof sectorsInput === 'string') {
    return sectorsInput.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Parse stages from AI response
 */
function parseStages(stagesInput) {
  if (!stagesInput) return [];
  if (Array.isArray(stagesInput)) return stagesInput;
  if (typeof stagesInput === 'string') {
    return stagesInput.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Validate URL format
 */
function isValidUrl(url) {
  if (!url) return true; // Optional field
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  if (!email) return true; // Optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize text for Slack (escape special characters)
 */
function sanitizeForSlack(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  isAdmin,
  isValidPartnerType,
  isValidEventType,
  parsePartnerType,
  parseSectors,
  parseStages,
  isValidUrl,
  isValidEmail,
  sanitizeForSlack,
};

