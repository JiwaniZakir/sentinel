/**
 * Account Pool Service
 * 
 * Manages a pool of LinkedIn accounts for distributed scraping.
 * Handles intelligent account rotation, health tracking, and cooldown management.
 */

const { PrismaClient } = require('@prisma/client');
const sessionManager = require('./sessionManager');
const { logger } = require('../../utils/logger');

const prisma = new PrismaClient();

// Daily scrape limit per account (conservative)
const DAILY_LIMIT_PER_ACCOUNT = parseInt(process.env.LINKEDIN_DAILY_LIMIT_PER_ACCOUNT || '75', 10);

// Cooldown duration after failures (hours)
const COOLDOWN_HOURS = parseInt(process.env.LINKEDIN_COOLDOWN_HOURS || '6', 10);

// Maximum failures before marking account as banned
const MAX_FAILURES_BEFORE_BAN = 3;

// Minimum delay between scrapes on same account (seconds)
const MIN_DELAY_BETWEEN_SCRAPES = 10;

/**
 * Get an available account from the pool
 * Selects the least recently used healthy account
 */
async function getAvailableAccount() {
  logger.info('[AccountPool] Selecting available account from pool...');
  
  // Reset daily counters if needed
  await resetDailyCounters();
  
  const now = new Date();
  
  // Find healthy accounts that are:
  // - ACTIVE status
  // - Not in cooldown
  // - Under daily limit
  // - Haven't been used in last MIN_DELAY_BETWEEN_SCRAPES seconds
  const minLastUsed = new Date(now.getTime() - MIN_DELAY_BETWEEN_SCRAPES * 1000);
  
  const accounts = await prisma.linkedInAccount.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { cooldownUntil: null },
        { cooldownUntil: { lt: now } },
      ],
      scrapesToday: { lt: DAILY_LIMIT_PER_ACCOUNT },
      OR: [
        { lastUsedAt: null },
        { lastUsedAt: { lt: minLastUsed } },
      ],
    },
    orderBy: {
      lastUsedAt: 'asc', // Least recently used first
    },
  });
  
  if (accounts.length === 0) {
    logger.warn('[AccountPool] No available accounts in pool!');
    
    // Check if any accounts exist at all
    const totalAccounts = await prisma.linkedInAccount.count();
    if (totalAccounts === 0) {
      throw new Error('No LinkedIn accounts configured. Use /partnerbot linkedin-add-account to add accounts.');
    }
    
    // Check why accounts are unavailable
    const inCooldown = await prisma.linkedInAccount.count({ where: { cooldownUntil: { gte: now } } });
    const overLimit = await prisma.linkedInAccount.count({ where: { scrapesToday: { gte: DAILY_LIMIT_PER_ACCOUNT } } });
    const banned = await prisma.linkedInAccount.count({ where: { status: 'BANNED' } });
    
    throw new Error(
      `All LinkedIn accounts unavailable. ` +
      `Total: ${totalAccounts}, In cooldown: ${inCooldown}, Over daily limit: ${overLimit}, Banned: ${banned}`
    );
  }
  
  const selected = accounts[0];
  logger.info(`[AccountPool] Selected account: ${selected.linkedinEmail} (used ${selected.scrapesToday}/${DAILY_LIMIT_PER_ACCOUNT} today)`);
  
  return selected;
}

/**
 * Mark an account as used (update usage stats)
 */
async function markAccountUsed(accountId, success = true) {
  const updates = {
    lastUsedAt: new Date(),
    totalScrapes: { increment: 1 },
  };
  
  if (success) {
    updates.scrapesToday = { increment: 1 };
    updates.failureCount = 0; // Reset failure count on success
    updates.lastErrorMsg = null;
  }
  
  await prisma.linkedInAccount.update({
    where: { id: accountId },
    data: updates,
  });
  
  logger.info(`[AccountPool] Updated account ${accountId} usage (success: ${success})`);
}

/**
 * Report a failure for an account
 */
async function reportFailure(accountId, error, errorType) {
  logger.warn(`[AccountPool] Reporting failure for account ${accountId}: ${error}`);
  
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
  });
  
  if (!account) {
    logger.error(`[AccountPool] Account ${accountId} not found`);
    return;
  }
  
  const newFailureCount = account.failureCount + 1;
  const updates = {
    failureCount: newFailureCount,
    lastErrorMsg: error.substring(0, 500), // Limit error message length
  };
  
  // Determine action based on error type
  if (errorType === 'AUTH_FAILED' || errorType === 'SECURITY_CHECKPOINT') {
    // Verification required - enter cooldown
    updates.status = 'VERIFICATION_REQUIRED';
    updates.cooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
    logger.warn(`[AccountPool] Account ${account.linkedinEmail} needs verification - cooldown ${COOLDOWN_HOURS}h`);
    
  } else if (errorType === 'RATE_LIMITED') {
    // Rate limited - enter cooldown
    updates.cooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
    logger.warn(`[AccountPool] Account ${account.linkedinEmail} rate limited - cooldown ${COOLDOWN_HOURS}h`);
    
  } else if (newFailureCount >= MAX_FAILURES_BEFORE_BAN) {
    // Too many failures - ban the account
    updates.status = 'BANNED';
    logger.error(`[AccountPool] Account ${account.linkedinEmail} BANNED after ${newFailureCount} failures`);
  }
  
  await prisma.linkedInAccount.update({
    where: { id: accountId },
    data: updates,
  });
}

/**
 * Store session cookies for an account
 */
async function storeSession(accountId, cookies) {
  try {
    // Normalize and validate cookies
    const normalizedCookies = sessionManager.normalizeCookies(cookies);
    const linkedInCookies = sessionManager.extractLinkedInCookies(normalizedCookies);
    
    if (!sessionManager.validateLinkedInCookies(linkedInCookies)) {
      logger.warn(`[AccountPool] Invalid LinkedIn cookies for account ${accountId}`);
      return false;
    }
    
    // Encrypt cookies
    const encryptedCookies = sessionManager.encryptCookies(linkedInCookies);
    
    // Calculate expiry
    const sessionExpiry = sessionManager.calculateSessionExpiry();
    
    // Store in database
    await prisma.linkedInAccount.update({
      where: { id: accountId },
      data: {
        sessionCookies: encryptedCookies,
        sessionExpiry,
      },
    });
    
    logger.info(`[AccountPool] Stored session for account ${accountId} (expires: ${sessionExpiry.toISOString()})`);
    return true;
    
  } catch (error) {
    logger.error(`[AccountPool] Failed to store session: ${error.message}`);
    return false;
  }
}

/**
 * Get session cookies for an account
 */
async function getSession(accountId) {
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
    select: {
      sessionCookies: true,
      sessionExpiry: true,
    },
  });
  
  if (!account || !account.sessionCookies) {
    return null;
  }
  
  // Check if session is still valid
  if (!sessionManager.isSessionValid(account.sessionExpiry)) {
    logger.info(`[AccountPool] Session expired for account ${accountId}`);
    return null;
  }
  
  // Decrypt cookies
  const cookies = sessionManager.decryptCookies(account.sessionCookies);
  
  if (!cookies) {
    logger.warn(`[AccountPool] Failed to decrypt cookies for account ${accountId}`);
    return null;
  }
  
  logger.info(`[AccountPool] Retrieved valid session for account ${accountId}`);
  return cookies;
}

/**
 * Check if an account needs session refresh
 */
async function needsSessionRefresh(accountId) {
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
    select: {
      sessionExpiry: true,
    },
  });
  
  if (!account) {
    return true;
  }
  
  return sessionManager.shouldRefreshSession(account.sessionExpiry);
}

/**
 * Reset daily scrape counters for all accounts (run once per day)
 */
async function resetDailyCounters() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Find accounts that haven't been reset today
  const accountsToReset = await prisma.linkedInAccount.findMany({
    where: {
      OR: [
        { scrapesDayReset: null },
        { scrapesDayReset: { lt: yesterday } },
      ],
      scrapesToday: { gt: 0 },
    },
  });
  
  if (accountsToReset.length > 0) {
    logger.info(`[AccountPool] Resetting daily counters for ${accountsToReset.length} accounts`);
    
    await prisma.linkedInAccount.updateMany({
      where: {
        id: { in: accountsToReset.map(a => a.id) },
      },
      data: {
        scrapesToday: 0,
        scrapesDayReset: now,
      },
    });
  }
}

/**
 * Get account credentials (decrypted)
 */
async function getAccountCredentials(accountId) {
  const account = await prisma.linkedInAccount.findUnique({
    where: { id: accountId },
    select: {
      linkedinEmail: true,
      encryptedPassword: true,
      email: true,
      gmailAppPassword: true,
    },
  });
  
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }
  
  return {
    linkedinEmail: account.linkedinEmail,
    linkedinPassword: sessionManager.decryptPassword(account.encryptedPassword),
    gmailEmail: account.email,
    gmailAppPassword: account.gmailAppPassword,
  };
}

/**
 * Add a new account to the pool
 */
async function addAccount({ linkedinEmail, linkedinPassword, gmailEmail, gmailAppPassword }) {
  logger.info(`[AccountPool] Adding new account: ${linkedinEmail}`);
  
  // Check if account already exists
  const existing = await prisma.linkedInAccount.findUnique({
    where: { email: gmailEmail },
  });
  
  if (existing) {
    throw new Error(`Account with email ${gmailEmail} already exists`);
  }
  
  // Encrypt password
  const encryptedPassword = sessionManager.encryptPassword(linkedinPassword);
  
  // Create account record
  const account = await prisma.linkedInAccount.create({
    data: {
      email: gmailEmail,
      linkedinEmail,
      encryptedPassword,
      gmailAppPassword,
      status: 'ACTIVE',
      scrapesToday: 0,
      totalScrapes: 0,
      failureCount: 0,
    },
  });
  
  logger.info(`[AccountPool] Account added successfully: ${account.id}`);
  return account;
}

/**
 * Get all accounts (for admin view)
 */
async function getAllAccounts() {
  return await prisma.linkedInAccount.findMany({
    select: {
      id: true,
      email: true,
      linkedinEmail: true,
      status: true,
      scrapesToday: true,
      totalScrapes: true,
      failureCount: true,
      lastUsedAt: true,
      cooldownUntil: true,
      sessionExpiry: true,
      lastErrorMsg: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/**
 * Update account status
 */
async function updateAccountStatus(accountId, status) {
  await prisma.linkedInAccount.update({
    where: { id: accountId },
    data: { status },
  });
  
  logger.info(`[AccountPool] Updated account ${accountId} status to ${status}`);
}

/**
 * Reset account (clear failures and cooldown)
 */
async function resetAccount(accountId) {
  await prisma.linkedInAccount.update({
    where: { id: accountId },
    data: {
      failureCount: 0,
      cooldownUntil: null,
      lastErrorMsg: null,
      status: 'ACTIVE',
    },
  });
  
  logger.info(`[AccountPool] Reset account ${accountId}`);
}

/**
 * Delete an account from the pool
 */
async function deleteAccount(accountId) {
  await prisma.linkedInAccount.delete({
    where: { id: accountId },
  });
  
  logger.info(`[AccountPool] Deleted account ${accountId}`);
}

/**
 * Load accounts from LINKEDIN_ACCOUNTS environment variable
 * Called on startup to sync env vars with database
 */
async function loadAccountsFromEnv() {
  const accountsJson = process.env.LINKEDIN_ACCOUNTS;
  
  if (!accountsJson) {
    logger.info('[AccountPool] No LINKEDIN_ACCOUNTS environment variable found, skipping auto-load');
    return { loaded: 0, skipped: 0, errors: 0 };
  }
  
  try {
    const accounts = JSON.parse(accountsJson);
    
    if (!Array.isArray(accounts)) {
      logger.error('[AccountPool] LINKEDIN_ACCOUNTS must be a JSON array');
      return { loaded: 0, skipped: 0, errors: 1 };
    }
    
    logger.info(`[AccountPool] Found ${accounts.length} account(s) in LINKEDIN_ACCOUNTS env var`);
    
    let loaded = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const account of accounts) {
      try {
        const { linkedinEmail, linkedinPassword, gmailEmail, gmailAppPassword } = account;
        
        if (!linkedinEmail || !linkedinPassword || !gmailEmail || !gmailAppPassword) {
          logger.error('[AccountPool] Missing required fields in LINKEDIN_ACCOUNTS entry');
          errors++;
          continue;
        }
        
        // Check if account already exists
        const existing = await prisma.linkedInAccount.findUnique({
          where: { email: gmailEmail },
        });
        
        if (existing) {
          logger.info(`[AccountPool] Account ${gmailEmail} already exists, skipping`);
          skipped++;
          continue;
        }
        
        // Add the account
        await addAccount({
          linkedinEmail,
          linkedinPassword,
          gmailEmail,
          gmailAppPassword,
        });
        
        logger.info(`[AccountPool] Successfully loaded account: ${gmailEmail}`);
        loaded++;
        
      } catch (error) {
        logger.error(`[AccountPool] Error loading account: ${error.message}`);
        errors++;
      }
    }
    
    logger.info(`[AccountPool] Auto-load complete: ${loaded} loaded, ${skipped} skipped, ${errors} errors`);
    return { loaded, skipped, errors };
    
  } catch (error) {
    logger.error(`[AccountPool] Failed to parse LINKEDIN_ACCOUNTS: ${error.message}`);
    return { loaded: 0, skipped: 0, errors: 1 };
  }
}

/**
 * Get pool statistics
 */
async function getPoolStats() {
  const now = new Date();
  
  const total = await prisma.linkedInAccount.count();
  const active = await prisma.linkedInAccount.count({ where: { status: 'ACTIVE' } });
  const cooldown = await prisma.linkedInAccount.count({ where: { status: 'COOLDOWN' } });
  const verificationRequired = await prisma.linkedInAccount.count({ where: { status: 'VERIFICATION_REQUIRED' } });
  const banned = await prisma.linkedInAccount.count({ where: { status: 'BANNED' } });
  
  const availableNow = await prisma.linkedInAccount.count({
    where: {
      status: 'ACTIVE',
      OR: [
        { cooldownUntil: null },
        { cooldownUntil: { lt: now } },
      ],
      scrapesToday: { lt: DAILY_LIMIT_PER_ACCOUNT },
    },
  });
  
  const totalScrapesToday = await prisma.linkedInAccount.aggregate({
    _sum: { scrapesToday: true },
  });
  
  const totalScrapesAllTime = await prisma.linkedInAccount.aggregate({
    _sum: { totalScrapes: true },
  });
  
  return {
    total,
    active,
    cooldown,
    verificationRequired,
    banned,
    availableNow,
    scrapesToday: totalScrapesToday._sum.scrapesToday || 0,
    scrapesAllTime: totalScrapesAllTime._sum.totalScrapes || 0,
    dailyLimitPerAccount: DAILY_LIMIT_PER_ACCOUNT,
    cooldownHours: COOLDOWN_HOURS,
  };
}

module.exports = {
  // Core functions
  getAvailableAccount,
  markAccountUsed,
  reportFailure,
  
  // Session management
  storeSession,
  getSession,
  needsSessionRefresh,
  
  // Account credentials
  getAccountCredentials,
  
  // Account management
  addAccount,
  getAllAccounts,
  updateAccountStatus,
  resetAccount,
  deleteAccount,
  loadAccountsFromEnv,
  
  // Statistics
  getPoolStats,
  resetDailyCounters,
  
  // Constants
  DAILY_LIMIT_PER_ACCOUNT,
  COOLDOWN_HOURS,
  MAX_FAILURES_BEFORE_BAN,
};

