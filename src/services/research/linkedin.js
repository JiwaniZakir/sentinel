/**
 * LinkedIn Profile Scraper Service
 * 
 * Spawns a Python child process to scrape LinkedIn profiles
 * using the linkedin_scraper library with session management and account rotation.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../../config');
const { logger } = require('../../utils/logger');
const accountPool = require('./accountPool');
const emailVerification = require('./emailVerification');

// Path to the Python scraper script (named to avoid import conflict with linkedin_scraper package)
const SCRAPER_SCRIPT = path.join(__dirname, '../../../scripts/scrape_linkedin.py');

// Timeout for scraping (configurable, default 150 seconds to allow for email verification)
const SCRAPE_TIMEOUT = config.research?.linkedin?.scrapeTimeout || 150000;

// Python executable - prefer venv if available (for Railway/Nix deployment)
const VENV_PYTHON = '/app/.venv/bin/python3';
const PYTHON_EXECUTABLE = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

/**
 * Extract LinkedIn username from URL
 */
function extractLinkedInUsername(url) {
  if (!url) return null;
  
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  return match ? match[1] : null;
}

/**
 * Validate LinkedIn URL format
 */
function isValidLinkedInUrl(url) {
  if (!url) return false;
  return /linkedin\.com\/in\/[a-zA-Z0-9\-_]+/i.test(url);
}

/**
 * Scrape a LinkedIn profile using the Python scraper with account pool management
 * 
 * @param {string} linkedinUrl - The LinkedIn profile URL to scrape
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} - The scraped profile data or error
 */
async function scrapeProfile(linkedinUrl, options = {}) {
  console.log('=== LINKEDIN SCRAPE STARTED ===');
  console.log('URL:', linkedinUrl);
  
  // Validate URL
  if (!isValidLinkedInUrl(linkedinUrl)) {
    console.log('Invalid LinkedIn URL');
    return {
      success: false,
      error: 'Invalid LinkedIn URL format',
      error_type: 'INVALID_URL',
    };
  }
  
  let account = null;
  let accountId = null;
  
  try {
    // Get an available account from the pool
    account = await accountPool.getAvailableAccount();
    accountId = account.id;
    
    console.log(`Using LinkedIn account: ${account.linkedinEmail}`);
    
    // Get account credentials
    const credentials = await accountPool.getAccountCredentials(accountId);
    
    // Check if we have a valid session
    let cookies = await accountPool.getSession(accountId);
    let needsLogin = !cookies;
    
    if (needsLogin) {
      console.log('No valid session found, will need to login');
    } else {
      console.log('Using existing session cookies');
    }
    
    // Prepare scraper input
    const scraperInput = {
      url: linkedinUrl,
      email: credentials.linkedinEmail,
      password: credentials.linkedinPassword,
      cookies: cookies || null,
      gmail_email: credentials.gmailEmail,
      gmail_app_password: credentials.gmailAppPassword,
    };
    
    // Run the scraper
    const result = await runScraperProcess(scraperInput);
    
    // Handle the result
    if (result.success) {
      console.log('Scrape successful!');
      
      // Store new session cookies if provided
      if (result.cookies && result.cookies.length > 0) {
        console.log(`Storing ${result.cookies.length} session cookies`);
        await accountPool.storeSession(accountId, result.cookies);
      }
      
      // Mark account as successfully used
      await accountPool.markAccountUsed(accountId, true);
      
      return result;
      
    } else {
      // Handle failure
      console.log(`Scrape failed: ${result.error}`);
      
      // Report failure to account pool
      await accountPool.reportFailure(accountId, result.error, result.error_type);
      
      return result;
    }
    
  } catch (error) {
    console.error('LinkedIn scrape error:', error.message);
    
    // Report failure if we have an account ID
    if (accountId) {
      await accountPool.reportFailure(accountId, error.message, 'PROCESS_ERROR');
    }
    
    return {
      success: false,
      error: error.message,
      error_type: 'PROCESS_ERROR',
    };
  }
}

/**
 * Run the Python scraper process with the given input
 */
async function runScraperProcess(input) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;
    
    console.log('Using Python executable:', PYTHON_EXECUTABLE);
    
    // Pass input as JSON via stdin
    const inputJson = JSON.stringify(input);
    
    const pythonProcess = spawn(PYTHON_EXECUTABLE, [
      SCRAPER_SCRIPT,
      '--stdin', // Flag to read from stdin
    ], {
      timeout: SCRAPE_TIMEOUT,
    });
    
    console.log('Python process spawned, PID:', pythonProcess.pid);
    
    // Send input via stdin
    pythonProcess.stdin.write(inputJson);
    pythonProcess.stdin.end();
    
    // Collect stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    // Collect stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('Python stderr:', data.toString());
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      
      console.log('Python process exited with code:', code);
      
      if (stderr) {
        console.log('Python stderr output:', stderr);
      }
      
      // Try to parse JSON output
      try {
        const result = JSON.parse(stdout);
        console.log('Scrape result:', result.success ? 'SUCCESS' : 'FAILED');
        resolve(result);
      } catch (parseError) {
        console.error('Failed to parse Python output:', stdout);
        resolve({
          success: false,
          error: `Failed to parse scraper output: ${parseError.message}`,
          error_type: 'PARSE_ERROR',
          raw_output: stdout,
        });
      }
    });
    
    // Handle process error
    pythonProcess.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      
      console.error('Python process error:', error.message);
      resolve({
        success: false,
        error: `Scraper process error: ${error.message}`,
        error_type: 'PROCESS_ERROR',
      });
    });
    
    // Handle timeout
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      
      console.log('Scrape timeout, killing process');
      pythonProcess.kill('SIGTERM');
      
      resolve({
        success: false,
        error: 'Scrape timeout exceeded',
        error_type: 'TIMEOUT',
      });
    }, SCRAPE_TIMEOUT);
  });
}

/**
 * Transform scraped LinkedIn data into our standard format
 */
function transformLinkedInData(scrapedData) {
  if (!scrapedData || !scrapedData.success) {
    return null;
  }
  
  const data = scrapedData.data;
  
  return {
    source: 'linkedin_scraper',
    scrapedAt: scrapedData.scraped_at,
    profile: {
      name: data.name,
      headline: data.headline || data.job_title,
      about: data.about,
      location: data.location,
      currentCompany: data.company,
      currentTitle: data.job_title,
      connections: data.connections,
    },
    experiences: (data.experiences || []).map(exp => ({
      company: exp.company,
      title: exp.title,
      duration: exp.duration,
      description: exp.description,
      location: exp.location,
      startDate: exp.from_date,
      endDate: exp.to_date,
    })),
    educations: (data.educations || []).map(edu => ({
      school: edu.school,
      degree: edu.degree,
      field: edu.field,
      startDate: edu.from_date,
      endDate: edu.to_date,
      description: edu.description,
    })),
    skills: data.interests || [],
    accomplishments: (data.accomplishments || []).map(acc => ({
      category: acc.category,
      title: acc.title,
    })),
  };
}

/**
 * Generate a text summary from LinkedIn data for AI context
 */
function generateLinkedInSummary(linkedinData) {
  if (!linkedinData) return null;
  
  const { profile, experiences, educations } = linkedinData;
  
  let summary = '';
  
  if (profile.name) {
    summary += `Name: ${profile.name}\n`;
  }
  
  if (profile.headline) {
    summary += `Headline: ${profile.headline}\n`;
  }
  
  if (profile.about) {
    summary += `\nAbout:\n${profile.about}\n`;
  }
  
  if (experiences && experiences.length > 0) {
    summary += '\nWork Experience:\n';
    experiences.slice(0, 5).forEach(exp => {
      summary += `- ${exp.title} at ${exp.company}`;
      if (exp.duration) summary += ` (${exp.duration})`;
      summary += '\n';
      if (exp.description) {
        summary += `  ${exp.description.substring(0, 200)}...\n`;
      }
    });
  }
  
  if (educations && educations.length > 0) {
    summary += '\nEducation:\n';
    educations.forEach(edu => {
      summary += `- ${edu.degree || ''} ${edu.field || ''} at ${edu.school}\n`;
    });
  }
  
  return summary;
}

module.exports = {
  scrapeProfile,
  transformLinkedInData,
  generateLinkedInSummary,
  extractLinkedInUsername,
  isValidLinkedInUrl,
};

