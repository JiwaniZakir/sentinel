#!/usr/bin/env node
/**
 * Complete LinkedIn Account Setup Helper
 * 
 * Generates encryption key, encrypts password, and creates database insert statement
 * 
 * Usage: node scripts/setup_linkedin_account.js
 */

const crypto = require('crypto');
const readline = require('readline');

const ALGORITHM = 'aes-256-gcm';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

function encrypt(text, key) {
  const keyBuffer = Buffer.from(key, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   LINKEDIN SESSION MANAGER - ACCOUNT SETUP WIZARD          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check if SESSION_ENCRYPTION_KEY exists
  let encryptionKey = process.env.SESSION_ENCRYPTION_KEY;
  
  if (!encryptionKey) {
    console.log('🔑 No SESSION_ENCRYPTION_KEY found. Generating new key...');
    console.log('');
    encryptionKey = generateEncryptionKey();
    console.log('✅ Generated encryption key:');
    console.log('');
    console.log('SESSION_ENCRYPTION_KEY=' + encryptionKey);
    console.log('');
    console.log('⚠️  Add this to Railway environment variables!');
    console.log('');
  } else {
    console.log('✅ Using existing SESSION_ENCRYPTION_KEY from environment');
    console.log('');
  }
  
  // Get account details
  console.log('📝 Enter LinkedIn account details:');
  console.log('');
  
  const gmailEmail = await question('Gmail email: ');
  const gmailPassword = await question('Gmail password (for reference only): ');
  const gmailAppPassword = await question('Gmail App Password (16 chars): ');
  const linkedinEmail = await question('LinkedIn email: ');
  const linkedinPassword = await question('LinkedIn password: ');
  
  console.log('');
  console.log('🔐 Encrypting LinkedIn password...');
  
  const encryptedPassword = encrypt(linkedinPassword, encryptionKey);
  
  console.log('✅ Password encrypted!');
  console.log('');
  
  // Generate SQL insert
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SETUP COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  if (!process.env.SESSION_ENCRYPTION_KEY) {
    console.log('📋 STEP 1: Add to Railway Environment Variables');
    console.log('');
    console.log('SESSION_ENCRYPTION_KEY=' + encryptionKey);
    console.log('');
  }
  
  console.log('📋 STEP 2: Add Account to Database');
  console.log('');
  console.log('Option A: Use Prisma Studio (Easiest)');
  console.log('  1. Run: npm run db:studio');
  console.log('  2. Open LinkedInAccount model');
  console.log('  3. Click "Add record"');
  console.log('  4. Fill in these values:');
  console.log('');
  console.log('     email: ' + gmailEmail);
  console.log('     linkedinEmail: ' + linkedinEmail);
  console.log('     encryptedPassword: ' + encryptedPassword);
  console.log('     gmailAppPassword: ' + gmailAppPassword);
  console.log('     status: ACTIVE');
  console.log('     scrapesToday: 0');
  console.log('     totalScrapes: 0');
  console.log('     failureCount: 0');
  console.log('');
  console.log('Option B: Use SQL');
  console.log('');
  console.log("INSERT INTO linkedin_accounts (");
  console.log("  id, email, linkedin_email, encrypted_password,");
  console.log("  gmail_app_password, status, scrapes_today,");
  console.log("  total_scrapes, failure_count, created_at, updated_at");
  console.log(") VALUES (");
  console.log("  gen_random_uuid(),");
  console.log("  '" + gmailEmail + "',");
  console.log("  '" + linkedinEmail + "',");
  console.log("  '" + encryptedPassword + "',");
  console.log("  '" + gmailAppPassword + "',");
  console.log("  'ACTIVE',");
  console.log("  0,");
  console.log("  0,");
  console.log("  0,");
  console.log("  NOW(),");
  console.log("  NOW()");
  console.log(");");
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('📋 STEP 3: Test the Account');
  console.log('');
  console.log('In Slack:');
  console.log('  /partnerbot linkedin-pool-stats');
  console.log('  /partnerbot test-linkedin https://linkedin.com/in/someone/');
  console.log('');
  console.log('✅ Setup complete!');
  console.log('');
  
  rl.close();
}

main().catch(console.error);

