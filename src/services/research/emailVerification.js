/**
 * Email Verification Service
 * 
 * Connects to Gmail via IMAP to retrieve LinkedIn verification codes
 * and other security codes for automated login flows.
 */

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { logger } = require('../../utils/logger');

// Timeout for waiting for verification email (60 seconds)
const EMAIL_WAIT_TIMEOUT = 60000;

// Check for new emails every 3 seconds
const EMAIL_CHECK_INTERVAL = 3000;

/**
 * Extract verification code from email content
 * LinkedIn codes are typically 6 digits
 */
function extractLinkedInCode(text) {
  if (!text) return null;
  
  // Try to find 6-digit code patterns
  const patterns = [
    /verification code:?\s*(\d{6})/i,
    /your code:?\s*(\d{6})/i,
    /code:?\s*(\d{6})/i,
    /(\d{6})\s*is your verification code/i,
    /(\d{6})\s*is your LinkedIn verification code/i,
    /enter this code:?\s*(\d{6})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Fallback: just find any 6-digit number (less reliable)
  const fallbackMatch = text.match(/\b(\d{6})\b/);
  if (fallbackMatch && fallbackMatch[1]) {
    return fallbackMatch[1];
  }
  
  return null;
}

/**
 * Connect to Gmail via IMAP
 */
function createImapConnection(email, appPassword) {
  return new Imap({
    user: email,
    password: appPassword,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Search for recent unread emails from LinkedIn
 */
function searchLinkedInEmails(imap) {
  return new Promise((resolve, reject) => {
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Search for unread emails from LinkedIn in the last 5 minutes
        const searchCriteria = [
          'UNSEEN',
          ['FROM', 'linkedin.com'],
          ['SINCE', new Date(Date.now() - 5 * 60 * 1000)],
        ];
        
        imap.search(searchCriteria, (searchErr, results) => {
          if (searchErr) {
            reject(searchErr);
            return;
          }
          
          if (!results || results.length === 0) {
            resolve([]);
            return;
          }
          
          const fetch = imap.fetch(results, { bodies: '' });
          const emails = [];
          
          fetch.on('message', (msg) => {
            let buffer = '';
            
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });
            
            msg.once('end', () => {
              simpleParser(buffer)
                .then((parsed) => {
                  emails.push({
                    subject: parsed.subject,
                    text: parsed.text,
                    html: parsed.html,
                    from: parsed.from?.text || '',
                    date: parsed.date,
                  });
                })
                .catch((parseErr) => {
                  logger.error(`Failed to parse email: ${parseErr.message}`);
                });
            });
          });
          
          fetch.once('error', (fetchErr) => {
            reject(fetchErr);
          });
          
          fetch.once('end', () => {
            resolve(emails);
          });
        });
      });
    });
    
    imap.once('error', (err) => {
      reject(err);
    });
    
    imap.connect();
  });
}

/**
 * Mark emails as read
 */
function markEmailsAsRead(imap, uids) {
  return new Promise((resolve, reject) => {
    if (!uids || uids.length === 0) {
      resolve();
      return;
    }
    
    imap.addFlags(uids, ['\\Seen'], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Wait for a LinkedIn verification code email
 * 
 * @param {string} email - Gmail email address
 * @param {string} appPassword - Gmail App Password (NOT regular password)
 * @param {number} timeout - How long to wait (default 60 seconds)
 * @returns {Promise<string|null>} - The 6-digit verification code or null
 */
async function waitForLinkedInCode(email, appPassword, timeout = EMAIL_WAIT_TIMEOUT) {
  logger.info(`[EmailVerification] Waiting for LinkedIn verification code at ${email}`);
  
  const startTime = Date.now();
  const maxAttempts = Math.ceil(timeout / EMAIL_CHECK_INTERVAL);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const elapsed = Date.now() - startTime;
    
    if (elapsed >= timeout) {
      logger.warn(`[EmailVerification] Timeout waiting for code (${timeout}ms)`);
      return null;
    }
    
    try {
      logger.info(`[EmailVerification] Checking inbox (attempt ${attempt}/${maxAttempts})...`);
      
      const imap = createImapConnection(email, appPassword);
      const emails = await searchLinkedInEmails(imap);
      
      // Close the IMAP connection
      imap.end();
      
      if (emails && emails.length > 0) {
        logger.info(`[EmailVerification] Found ${emails.length} LinkedIn email(s)`);
        
        // Search each email for a verification code
        for (const emailData of emails) {
          // Check subject
          if (emailData.subject && emailData.subject.toLowerCase().includes('verification')) {
            logger.info(`[EmailVerification] Found verification email: "${emailData.subject}"`);
            
            // Try to extract code from text
            const code = extractLinkedInCode(emailData.text || emailData.html || '');
            if (code) {
              logger.info(`[EmailVerification] Extracted verification code: ${code}`);
              return code;
            }
          }
        }
      }
      
      // Wait before next attempt
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, EMAIL_CHECK_INTERVAL));
      }
      
    } catch (error) {
      logger.error(`[EmailVerification] Error checking email: ${error.message}`);
      
      // If IMAP fails, wait a bit and try again
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, EMAIL_CHECK_INTERVAL));
      }
    }
  }
  
  logger.warn(`[EmailVerification] No verification code found after ${maxAttempts} attempts`);
  return null;
}

/**
 * Test email connection
 */
async function testEmailConnection(email, appPassword) {
  return new Promise((resolve) => {
    const imap = createImapConnection(email, appPassword);
    
    imap.once('ready', () => {
      imap.end();
      resolve({ success: true, message: 'Connection successful' });
    });
    
    imap.once('error', (err) => {
      resolve({ success: false, message: err.message });
    });
    
    imap.connect();
  });
}

module.exports = {
  waitForLinkedInCode,
  extractLinkedInCode,
  testEmailConnection,
};

