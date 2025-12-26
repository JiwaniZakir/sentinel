/**
 * Wikipedia API Service
 * 
 * Searches Wikipedia for information about people and companies.
 * Uses the Wikipedia-API Python library via child process.
 * FREE and UNLIMITED!
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { logger } = require('../../utils/logger');

// Path to the Python script
const WIKIPEDIA_SCRIPT = path.join(__dirname, '../../../scripts/wikipedia_search.py');

// Timeout for Wikipedia search (30 seconds)
const SEARCH_TIMEOUT = 30000;

// Python executable - prefer venv if available (for Railway/Nix deployment)
const VENV_PYTHON = '/app/.venv/bin/python3';
const PYTHON_EXECUTABLE = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3';

/**
 * Search Wikipedia for a person
 */
async function searchPerson(name) {
  console.log('=== WIKIPEDIA PERSON SEARCH ===');
  console.log('Name:', name);
  
  return executeWikipediaSearch(name, 'person');
}

/**
 * Search Wikipedia for a company/firm
 */
async function searchCompany(companyName) {
  console.log('=== WIKIPEDIA COMPANY SEARCH ===');
  console.log('Company:', companyName);
  
  return executeWikipediaSearch(companyName, 'company');
}

/**
 * Execute the Wikipedia search Python script
 */
async function executeWikipediaSearch(query, searchType) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;
    
    console.log('Using Python executable:', PYTHON_EXECUTABLE);
    
    // Spawn Python process
    const pythonProcess = spawn(PYTHON_EXECUTABLE, [
      WIKIPEDIA_SCRIPT,
      query,
      '--type', searchType,
    ], {
      timeout: SEARCH_TIMEOUT,
    });
    
    console.log('Wikipedia search process spawned, PID:', pythonProcess.pid);
    
    // Collect stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    // Collect stderr (for debugging)
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('Wikipedia stderr:', data.toString());
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      
      console.log('Wikipedia search process exited with code:', code);
      
      if (stderr) {
        console.log('Wikipedia stderr output:', stderr);
      }
      
      // Try to parse JSON output
      try {
        const result = JSON.parse(stdout);
        console.log('Wikipedia search result:', result.success ? 'SUCCESS' : 'FAILED');
        
        // Transform to our standard format
        resolve({
          success: result.success,
          source: 'wikipedia',
          researchType: searchType === 'person' ? 'PERSON_BACKGROUND' : 'COMPANY_BACKGROUND',
          query: query,
          data: result.data,
          error: result.error,
          error_type: result.error_type,
          scrapedAt: result.searched_at || new Date().toISOString(),
        });
      } catch (parseError) {
        console.error('Failed to parse Wikipedia output:', stdout);
        resolve({
          success: false,
          source: 'wikipedia',
          error: `Failed to parse Wikipedia output: ${parseError.message}`,
          error_type: 'PARSE_ERROR',
          raw_output: stdout,
        });
      }
    });
    
    // Handle process error
    pythonProcess.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      
      console.error('Wikipedia search process error:', error.message);
      resolve({
        success: false,
        source: 'wikipedia',
        error: `Wikipedia search process error: ${error.message}`,
        error_type: 'PROCESS_ERROR',
      });
    });
    
    // Handle timeout
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      
      console.log('Wikipedia search timeout, killing process');
      pythonProcess.kill('SIGTERM');
      
      resolve({
        success: false,
        source: 'wikipedia',
        error: 'Wikipedia search timeout exceeded',
        error_type: 'TIMEOUT',
      });
    }, SEARCH_TIMEOUT);
  });
}

/**
 * Search Wikipedia for both person and company in parallel
 */
async function searchPersonAndCompany(personName, companyName) {
  console.log('=== WIKIPEDIA PARALLEL SEARCH ===');
  console.log('Person:', personName, 'Company:', companyName);
  
  const [personResult, companyResult] = await Promise.all([
    searchPerson(personName),
    searchCompany(companyName),
  ]);
  
  return {
    person: personResult,
    company: companyResult,
  };
}

/**
 * Generate a text summary from Wikipedia data for AI context
 */
function generateWikipediaSummary(personResult, companyResult) {
  let summary = '';
  
  if (personResult?.success && personResult.data) {
    const data = personResult.data;
    summary += '### Wikipedia - Person Background:\n';
    
    if (data.summary) {
      summary += data.summary + '\n\n';
    }
    
    if (data.career_info?.raw_career) {
      summary += '**Career:**\n' + data.career_info.raw_career + '\n\n';
    }
    
    if (data.education?.raw_education) {
      summary += '**Education:**\n' + data.education.raw_education + '\n\n';
    }
    
    if (data.url) {
      summary += `**Source:** ${data.url}\n\n`;
    }
  }
  
  if (companyResult?.success && companyResult.data) {
    const data = companyResult.data;
    summary += '### Wikipedia - Company Background:\n';
    
    if (data.summary) {
      summary += data.summary + '\n\n';
    }
    
    if (data.company_info?.founding_info) {
      summary += '**History:**\n' + data.company_info.founding_info + '\n\n';
    }
    
    if (data.company_info?.portfolio_info) {
      summary += '**Portfolio/Investments:**\n' + data.company_info.portfolio_info + '\n\n';
    }
    
    if (data.url) {
      summary += `**Source:** ${data.url}\n\n`;
    }
  }
  
  return summary || null;
}

/**
 * Transform Wikipedia data for storage
 */
function transformWikipediaData(result) {
  if (!result?.success || !result.data) {
    return null;
  }
  
  const data = result.data;
  
  return {
    source: 'wikipedia',
    url: data.url,
    title: data.title,
    summary: data.summary,
    sections: data.full_text_preview,
    categories: data.categories,
    relatedLinks: data.links,
    careerInfo: data.career_info,
    educationInfo: data.education,
    companyInfo: data.company_info,
  };
}

module.exports = {
  searchPerson,
  searchCompany,
  searchPersonAndCompany,
  generateWikipediaSummary,
  transformWikipediaData,
};

