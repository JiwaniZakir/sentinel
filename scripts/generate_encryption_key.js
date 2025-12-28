#!/usr/bin/env node
/**
 * Generate encryption key for SESSION_ENCRYPTION_KEY
 * 
 * Usage: node scripts/generate_encryption_key.js
 */

const crypto = require('crypto');

const key = crypto.randomBytes(32).toString('hex');

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  SESSION ENCRYPTION KEY GENERATED');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Add this to Railway environment variables:');
console.log('');
console.log('SESSION_ENCRYPTION_KEY=' + key);
console.log('');
console.log('⚠️  IMPORTANT:');
console.log('• Save this key securely');
console.log('• Never commit to Git');
console.log('• Once set, never change it (data will be unreadable)');
console.log('• This encrypts all LinkedIn passwords and session cookies');
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

