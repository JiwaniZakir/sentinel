#!/usr/bin/env node
/**
 * Add LinkedIn Account to Pool
 *
 * Usage:
 *   SESSION_ENCRYPTION_KEY=<key> node scripts/add_linkedin_account.js
 *
 * Before running, update the accountDetails object below with your
 * actual LinkedIn account credentials.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const sessionManager = require('../src/services/research/sessionManager');

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        ADDING LINKEDIN ACCOUNT TO POOL                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  if (!process.env.SESSION_ENCRYPTION_KEY) {
    console.error('❌ ERROR: SESSION_ENCRYPTION_KEY not set');
    console.error('');
    console.error('Please set it in your .env file or environment:');
    console.error('  SESSION_ENCRYPTION_KEY=<64-char-hex-key>');
    console.error('');
    process.exit(1);
  }

  // ========================================
  // UPDATE THESE WITH YOUR ACCOUNT DETAILS
  // ========================================
  const accountDetails = {
    gmailEmail: 'your_email@example.com',
    linkedinEmail: 'your_linkedin_email@example.com',
    linkedinPassword: 'your_linkedin_password',
    gmailAppPassword: 'your_gmail_app_password',
  };
  // ========================================

  console.log('📝 Account Details:');
  console.log(`   Gmail: ${accountDetails.gmailEmail}`);
  console.log(`   LinkedIn: ${accountDetails.linkedinEmail}`);
  console.log('');

  try {
    // Check if account already exists
    const existing = await prisma.linkedInAccount.findUnique({
      where: { email: accountDetails.gmailEmail },
    });

    if (existing) {
      console.log('⚠️  Account already exists in database');
      console.log('');
      console.log('Account ID:', existing.id);
      console.log('Status:', existing.status);
      console.log('Total Scrapes:', existing.totalScrapes);
      console.log('');
      console.log('To update the account, use Prisma Studio or SQL.');
      console.log('');
      await prisma.$disconnect();
      process.exit(0);
    }

    // Encrypt password
    console.log('🔐 Encrypting LinkedIn password...');
    const encryptedPassword = sessionManager.encryptPassword(accountDetails.linkedinPassword);
    console.log('✅ Password encrypted');
    console.log('');

    // Create account
    console.log('💾 Adding account to database...');
    const account = await prisma.linkedInAccount.create({
      data: {
        email: accountDetails.gmailEmail,
        linkedinEmail: accountDetails.linkedinEmail,
        encryptedPassword,
        gmailAppPassword: accountDetails.gmailAppPassword,
        status: 'ACTIVE',
        scrapesToday: 0,
        totalScrapes: 0,
        failureCount: 0,
      },
    });

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ ACCOUNT ADDED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Account ID:', account.id);
    console.log('Status: ACTIVE');
    console.log('Email:', account.email);
    console.log('LinkedIn Email:', account.linkedinEmail);
    console.log('');
    console.log('📋 Next Steps:');
    console.log('');
    console.log('1. Verify the account in Slack:');
    console.log('   /partnerbot linkedin-pool-stats');
    console.log('');
    console.log('2. Test the account:');
    console.log('   /partnerbot test-linkedin https://linkedin.com/in/someone/');
    console.log('');
    console.log('3. Monitor account health:');
    console.log('   /partnerbot linkedin-accounts');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');
    if (error.code === 'P2002') {
      console.error('This account already exists in the database.');
    } else {
      console.error('Full error:', error);
    }
    console.error('');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
