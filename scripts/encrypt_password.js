#!/usr/bin/env node
/**
 * Encrypt a password for storage in LinkedInAccount
 * 
 * Usage: 
 *   SESSION_ENCRYPTION_KEY=<key> node scripts/encrypt_password.js "password"
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

if (!process.env.SESSION_ENCRYPTION_KEY) {
  console.error('❌ ERROR: SESSION_ENCRYPTION_KEY environment variable not set');
  console.error('');
  console.error('Run this first:');
  console.error('  node scripts/generate_encryption_key.js');
  console.error('');
  console.error('Then set the key and run this again:');
  console.error('  SESSION_ENCRYPTION_KEY=<key> node scripts/encrypt_password.js "your-password"');
  process.exit(1);
}

const password = process.argv[2];

if (!password) {
  console.error('❌ ERROR: No password provided');
  console.error('');
  console.error('Usage:');
  console.error('  SESSION_ENCRYPTION_KEY=<key> node scripts/encrypt_password.js "your-password"');
  process.exit(1);
}

function encrypt(text) {
  const key = Buffer.from(process.env.SESSION_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

const encrypted = encrypt(password);

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  PASSWORD ENCRYPTED');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Encrypted password:');
console.log(encrypted);
console.log('');
console.log('Use this value for the "encryptedPassword" field in the database.');
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

