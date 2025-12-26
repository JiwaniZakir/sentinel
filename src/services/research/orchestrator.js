/**
 * Research Orchestrator
 * 
 * Coordinates all research APIs (LinkedIn, Perplexity, Tavily) to build
 * a comprehensive profile on partners. Runs research in parallel where possible.
 */

const linkedinService = require('./linkedin');
const perplexityService = require('./perplexity');
const tavilyService = require('./tavily');
const db = require('../database');
const { logger } = require('../../utils/logger');

// Rate limiting configuration
const RATE_LIMIT_PER_DAY = parseInt(process.env.RESEARCH_RATE_LIMIT) || 20;
let dailyResearchCount = 0;
let lastResetDate = new Date().toDateString();

/**
 * Check and update rate limit
 */
function checkRateLimit() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyResearchCount = 0;
    lastResetDate = today;
  }
  
  if (dailyResearchCount >= RATE_LIMIT_PER_DAY) {
    return false;
  }
  
  dailyResearchCount++;
  return true;
}

/**
 * Start comprehensive research on a partner
 * 
 * @param {string} partnerId - The partner's database ID
 * @param {string} linkedinUrl - The LinkedIn profile URL
 * @param {Object} options - Research options
 * @returns {Promise<Object>} - Aggregated research results
 */
async function startResearch(partnerId, linkedinUrl, options = {}) {
  console.log('=== RESEARCH ORCHESTRATOR STARTED ===');
  console.log('Partner ID:', partnerId);
  console.log('LinkedIn URL:', linkedinUrl);
  
  // Check rate limit
  if (!checkRateLimit()) {
    console.log('Rate limit exceeded');
    return {
      success: false,
      error: 'Daily research rate limit exceeded',
      error_type: 'RATE_LIMITED',
    };
  }
  
  // Update partner research status
  try {
    await db.partners.update(partnerId, {
      researchStatus: 'IN_PROGRESS',
    });
  } catch (e) {
    console.log('Could not update partner status:', e.message);
  }
  
  const results = {
    linkedin: null,
    personNews: null,
    firmInfo: null,
    socialProfiles: null,
    errors: [],
  };
  
  // Step 1: Start LinkedIn scrape (this gives us name and firm for other searches)
  console.log('Step 1: LinkedIn scrape...');
  const skipLinkedIn = options.skipLinkedIn || !process.env.LINKEDIN_EMAIL;
  
  let name = options.name;
  let firm = options.firm;
  let role = options.role;
  
  if (!skipLinkedIn && linkedinUrl) {
    try {
      const linkedinResult = await linkedinService.scrapeProfile(linkedinUrl);
      results.linkedin = linkedinResult;
      
      if (linkedinResult.success) {
        // Extract name and firm from LinkedIn for other searches
        const transformed = linkedinService.transformLinkedInData(linkedinResult);
        name = name || transformed?.profile?.name;
        firm = firm || transformed?.profile?.currentCompany;
        role = role || transformed?.profile?.currentTitle;
        
        // Save LinkedIn research to database
        await saveResearchRecord(partnerId, 'LINKEDIN', 'linkedin_scraper', linkedinResult, linkedinUrl);
      } else {
        results.errors.push({ source: 'linkedin', error: linkedinResult.error });
      }
    } catch (error) {
      console.error('LinkedIn scrape error:', error.message);
      results.errors.push({ source: 'linkedin', error: error.message });
    }
  } else {
    console.log('Skipping LinkedIn scrape');
  }
  
  // Validate we have minimum required info
  if (!name || !firm) {
    console.log('Missing name or firm, cannot proceed with additional research');
    return {
      success: results.linkedin?.success || false,
      results,
      error: 'Missing name or firm for additional research',
    };
  }
  
  console.log('Research context - Name:', name, 'Firm:', firm, 'Role:', role);
  
  // Step 2: Run parallel research (Perplexity + Tavily)
  console.log('Step 2: Parallel research...');
  
  const parallelTasks = [];
  
  // Person research via Perplexity
  if (process.env.PERPLEXITY_API_KEY) {
    parallelTasks.push(
      perplexityService.researchPerson(name, firm, role)
        .then(async (result) => {
          results.personNews = result;
          if (result.success) {
            await saveResearchRecord(partnerId, 'PERSON_NEWS', 'perplexity', result, result.query);
          } else {
            results.errors.push({ source: 'perplexity_person', error: result.error });
          }
          return result;
        })
        .catch((error) => {
          console.error('Perplexity person error:', error.message);
          results.errors.push({ source: 'perplexity_person', error: error.message });
        })
    );
    
    // Firm research via Perplexity
    parallelTasks.push(
      perplexityService.researchFirm(firm, options.partnerType)
        .then(async (result) => {
          results.firmInfo = result;
          if (result.success) {
            await saveResearchRecord(partnerId, 'FIRM_INFO', 'perplexity', result, result.query);
          } else {
            results.errors.push({ source: 'perplexity_firm', error: result.error });
          }
          return result;
        })
        .catch((error) => {
          console.error('Perplexity firm error:', error.message);
          results.errors.push({ source: 'perplexity_firm', error: error.message });
        })
    );
  } else {
    console.log('Skipping Perplexity research (no API key)');
  }
  
  // Social profile discovery via Tavily
  if (process.env.TAVILY_API_KEY) {
    parallelTasks.push(
      tavilyService.findSocialProfiles(name, firm)
        .then(async (result) => {
          results.socialProfiles = result;
          if (result.success) {
            await saveResearchRecord(partnerId, 'SOCIAL_PRESENCE', 'tavily', result, result.query);
          } else {
            results.errors.push({ source: 'tavily_social', error: result.error });
          }
          return result;
        })
        .catch((error) => {
          console.error('Tavily social error:', error.message);
          results.errors.push({ source: 'tavily_social', error: error.message });
        })
    );
  } else {
    console.log('Skipping Tavily research (no API key)');
  }
  
  // Wait for all parallel tasks
  await Promise.allSettled(parallelTasks);
  
  // Step 3: Aggregate results and update partner record
  console.log('Step 3: Aggregating results...');
  
  const aggregatedSummary = aggregateResults(results);
  
  // Update partner with research summary
  try {
    await db.partners.update(partnerId, {
      researchSummary: aggregatedSummary,
      researchStatus: 'SUCCESS',
      researchCompletedAt: new Date(),
    });
  } catch (e) {
    console.log('Could not update partner with summary:', e.message);
  }
  
  console.log('=== RESEARCH ORCHESTRATOR COMPLETED ===');
  console.log('Errors:', results.errors.length);
  
  return {
    success: true,
    results,
    summary: aggregatedSummary,
    errorsCount: results.errors.length,
  };
}

/**
 * Save a research record to the database
 */
async function saveResearchRecord(partnerId, researchType, source, result, query) {
  try {
    await db.prisma.partnerResearch.create({
      data: {
        partnerId,
        researchType,
        source,
        query,
        rawData: result.data || result,
        structuredData: result.data,
        status: result.success ? 'SUCCESS' : 'FAILED',
        errorMessage: result.error,
        confidence: result.success ? 0.8 : 0,
        scrapedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });
    console.log(`Saved ${researchType} research record`);
  } catch (error) {
    console.error(`Failed to save ${researchType} research:`, error.message);
  }
}

/**
 * Aggregate all research results into a summary
 */
function aggregateResults(results) {
  const summary = {
    generatedAt: new Date().toISOString(),
    sources: [],
    profile: {},
    highlights: [],
    socialLinks: {},
    firmInfo: {},
  };
  
  // LinkedIn data
  if (results.linkedin?.success) {
    summary.sources.push('linkedin');
    const transformed = linkedinService.transformLinkedInData(results.linkedin);
    if (transformed) {
      summary.profile = {
        ...summary.profile,
        name: transformed.profile?.name,
        headline: transformed.profile?.headline,
        about: transformed.profile?.about,
        location: transformed.profile?.location,
        currentCompany: transformed.profile?.currentCompany,
        currentTitle: transformed.profile?.currentTitle,
      };
      summary.experiences = transformed.experiences;
      summary.educations = transformed.educations;
    }
  }
  
  // Person news
  if (results.personNews?.success && results.personNews.data) {
    summary.sources.push('perplexity_person');
    const personData = results.personNews.data;
    
    if (personData.newsArticles) {
      summary.highlights.push({
        type: 'news',
        content: personData.newsArticles,
      });
    }
    if (personData.deals) {
      summary.highlights.push({
        type: 'deals',
        content: personData.deals,
      });
    }
    if (personData.speaking) {
      summary.highlights.push({
        type: 'speaking',
        content: personData.speaking,
      });
    }
    
    summary.citations = personData.citations;
  }
  
  // Firm info
  if (results.firmInfo?.success && results.firmInfo.data) {
    summary.sources.push('perplexity_firm');
    summary.firmInfo = {
      overview: results.firmInfo.data.overview,
      leadership: results.firmInfo.data.leadership,
      portfolio: results.firmInfo.data.portfolio,
      news: results.firmInfo.data.news,
    };
  }
  
  // Social profiles
  if (results.socialProfiles?.success && results.socialProfiles.data?.profiles) {
    summary.sources.push('tavily');
    const profiles = results.socialProfiles.data.profiles;
    
    if (profiles.twitter) summary.socialLinks.twitter = profiles.twitter.url;
    if (profiles.substack) summary.socialLinks.substack = profiles.substack.url;
    if (profiles.medium) summary.socialLinks.medium = profiles.medium.url;
    if (profiles.github) summary.socialLinks.github = profiles.github.url;
    if (profiles.youtube) summary.socialLinks.youtube = profiles.youtube.url;
    if (profiles.podcast) summary.socialLinks.podcast = profiles.podcast.url;
    if (profiles.blog) summary.socialLinks.blog = profiles.blog.url;
  }
  
  return summary;
}

/**
 * Get research status for a partner
 */
async function getResearchStatus(partnerId) {
  try {
    const partner = await db.partners.findById(partnerId);
    return {
      status: partner?.researchStatus,
      completedAt: partner?.researchCompletedAt,
      hasSummary: !!partner?.researchSummary,
    };
  } catch (error) {
    return { status: 'UNKNOWN', error: error.message };
  }
}

/**
 * Get existing research for a partner
 */
async function getPartnerResearch(partnerId) {
  try {
    const records = await db.prisma.partnerResearch.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
    });
    
    const partner = await db.partners.findById(partnerId);
    
    return {
      summary: partner?.researchSummary,
      records,
      completedAt: partner?.researchCompletedAt,
    };
  } catch (error) {
    console.error('Error getting partner research:', error.message);
    return null;
  }
}

module.exports = {
  startResearch,
  getResearchStatus,
  getPartnerResearch,
  aggregateResults,
};

