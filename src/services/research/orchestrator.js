/**
 * Research Orchestrator
 * 
 * Coordinates all research APIs (LinkedIn, Perplexity, Tavily, Wikipedia) to build
 * a comprehensive profile on partners. Runs research in parallel where possible.
 * 
 * Full Pipeline:
 * 1. Data Collection (LinkedIn, Perplexity, Tavily, Wikipedia)
 * 2. Citation Crawling (follow Perplexity links)
 * 3. Quality Scoring & Fact Checking
 * 4. Profile Aggregation (PersonProfile, FirmProfile)
 * 5. Introduction Generation
 */

const linkedinService = require('./linkedin');
const perplexityService = require('./perplexity');
const tavilyService = require('./tavily');
const wikipediaService = require('./wikipedia');
const crawler = require('./crawler');
const qualityScorer = require('./qualityScorer');
const profileAggregator = require('./profileAggregator');
const introGenerator = require('./introGenerator');
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
    wikipediaPerson: null,
    wikipediaCompany: null,
    errors: [],
  };
  
  // Step 1: Try LinkedIn - first direct scrape, then Tavily fallback
  console.log('Step 1: LinkedIn research...');
  const hasLinkedInCreds = process.env.LINKEDIN_EMAIL && process.env.LINKEDIN_PASSWORD;
  const hasTavilyKey = process.env.TAVILY_API_KEY;
  
  let name = options.name;
  let firm = options.firm;
  let role = options.role;
  let linkedinSuccess = false;
  
  // Try direct LinkedIn scrape first (if credentials available)
  if (hasLinkedInCreds && linkedinUrl && !options.skipLinkedIn) {
    console.log('Attempting direct LinkedIn scrape...');
    try {
      const linkedinResult = await linkedinService.scrapeProfile(linkedinUrl);
      results.linkedin = linkedinResult;
      
      if (linkedinResult.success) {
        linkedinSuccess = true;
        // Extract name and firm from LinkedIn for other searches
        const transformed = linkedinService.transformLinkedInData(linkedinResult);
        name = name || transformed?.profile?.name;
        firm = firm || transformed?.profile?.currentCompany;
        role = role || transformed?.profile?.currentTitle;
        
        // Save LinkedIn research to database
        await saveResearchRecord(partnerId, 'LINKEDIN', 'linkedin_scraper', linkedinResult, linkedinUrl);
        console.log('Direct LinkedIn scrape successful');
      } else {
        console.log('Direct LinkedIn scrape failed:', linkedinResult.error);
        results.errors.push({ source: 'linkedin_scraper', error: linkedinResult.error });
      }
    } catch (error) {
      console.error('LinkedIn scrape error:', error.message);
      results.errors.push({ source: 'linkedin_scraper', error: error.message });
    }
  }
  
  // Fallback: Use Tavily to search LinkedIn (no login required!)
  if (!linkedinSuccess && hasTavilyKey && linkedinUrl) {
    console.log('Attempting Tavily LinkedIn search (fallback)...');
    try {
      const tavilyLinkedIn = await tavilyService.searchLinkedInProfile(name, firm, linkedinUrl);
      
      if (tavilyLinkedIn.success) {
        results.linkedin = tavilyLinkedIn;
        linkedinSuccess = true;
        
        // Extract name and firm from Tavily results
        const profile = tavilyLinkedIn.data;
        name = name || profile?.name;
        firm = firm || profile?.currentCompany;
        role = role || profile?.headline;
        
        // Save Tavily LinkedIn research to database
        await saveResearchRecord(partnerId, 'LINKEDIN', 'tavily_linkedin', tavilyLinkedIn, linkedinUrl);
        console.log('Tavily LinkedIn search successful');
      } else {
        console.log('Tavily LinkedIn search failed:', tavilyLinkedIn.error);
        results.errors.push({ source: 'tavily_linkedin', error: tavilyLinkedIn.error });
      }
    } catch (error) {
      console.error('Tavily LinkedIn error:', error.message);
      results.errors.push({ source: 'tavily_linkedin', error: error.message });
    }
  }
  
  if (!hasLinkedInCreds && !hasTavilyKey) {
    console.log('Skipping LinkedIn research - no credentials or Tavily API key');
  }
  
  // Validate we have minimum required info
  if (!name || !firm) {
    console.log('Missing name or firm, cannot proceed with additional research');
    console.log('Name:', name, 'Firm:', firm);
    return {
      success: linkedinSuccess,
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
  
  // Wikipedia research (FREE and UNLIMITED!)
  // Search for both person and company background
  parallelTasks.push(
    wikipediaService.searchPerson(name)
      .then(async (result) => {
        results.wikipediaPerson = result;
        if (result.success) {
          await saveResearchRecord(partnerId, 'PERSON_BACKGROUND', 'wikipedia', result, name);
          console.log('Wikipedia person search successful');
        } else {
          console.log('Wikipedia person not found:', result.error);
          // Don't add to errors - Wikipedia not finding someone is common
        }
        return result;
      })
      .catch((error) => {
        console.error('Wikipedia person error:', error.message);
        results.errors.push({ source: 'wikipedia_person', error: error.message });
      })
  );
  
  parallelTasks.push(
    wikipediaService.searchCompany(firm)
      .then(async (result) => {
        results.wikipediaCompany = result;
        if (result.success) {
          await saveResearchRecord(partnerId, 'COMPANY_BACKGROUND', 'wikipedia', result, firm);
          console.log('Wikipedia company search successful');
        } else {
          console.log('Wikipedia company not found:', result.error);
          // Don't add to errors - Wikipedia not finding a company is common
        }
        return result;
      })
      .catch((error) => {
        console.error('Wikipedia company error:', error.message);
        results.errors.push({ source: 'wikipedia_company', error: error.message });
      })
  );
  
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
  
  // Wikipedia person background
  if (results.wikipediaPerson?.success && results.wikipediaPerson.data) {
    summary.sources.push('wikipedia_person');
    const wikiData = results.wikipediaPerson.data;
    
    // Add Wikipedia summary to profile if we don't have one
    if (!summary.profile.about && wikiData.summary) {
      summary.profile.wikipediaSummary = wikiData.summary;
    }
    
    // Add career info from Wikipedia
    if (wikiData.career_info?.raw_career) {
      summary.highlights.push({
        type: 'wikipedia_career',
        content: wikiData.career_info.raw_career,
      });
    }
    
    // Add education info
    if (wikiData.education?.raw_education) {
      summary.highlights.push({
        type: 'wikipedia_education',
        content: wikiData.education.raw_education,
      });
    }
    
    summary.wikipediaUrl = wikiData.url;
    summary.wikipediaCategories = wikiData.categories;
  }
  
  // Wikipedia company background
  if (results.wikipediaCompany?.success && results.wikipediaCompany.data) {
    summary.sources.push('wikipedia_company');
    const wikiCompany = results.wikipediaCompany.data;
    
    // Enhance firm info with Wikipedia data
    if (!summary.firmInfo.overview && wikiCompany.summary) {
      summary.firmInfo.wikipediaOverview = wikiCompany.summary;
    }
    
    if (wikiCompany.company_info?.founding_info) {
      summary.firmInfo.founding = wikiCompany.company_info.founding_info;
    }
    
    if (wikiCompany.company_info?.portfolio_info) {
      summary.firmInfo.portfolio = wikiCompany.company_info.portfolio_info;
    }
    
    summary.firmInfo.wikipediaUrl = wikiCompany.url;
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

/**
 * Run the FULL research pipeline with all stages
 * 
 * @param {string} partnerId - The partner's database ID
 * @param {string} linkedinUrl - The LinkedIn profile URL
 * @param {Object} options - Research options
 * @returns {Promise<Object>} - Full pipeline results including intro
 */
async function runFullPipeline(partnerId, linkedinUrl, options = {}) {
  console.log('=== FULL RESEARCH PIPELINE STARTED ===');
  console.log('Partner ID:', partnerId);
  const startTime = Date.now();
  
  const pipelineResults = {
    stages: {},
    errors: [],
    timing: {},
  };
  
  try {
    // ============ STAGE 1: DATA COLLECTION ============
    console.log('\n>>> STAGE 1: Data Collection');
    const stage1Start = Date.now();
    
    const researchResults = await startResearch(partnerId, linkedinUrl, options);
    
    pipelineResults.stages.dataCollection = {
      success: researchResults.success,
      sourcesUsed: researchResults.summary?.sources || [],
      errorsCount: researchResults.errorsCount,
    };
    pipelineResults.timing.dataCollection = Date.now() - stage1Start;
    console.log(`Stage 1 complete: ${pipelineResults.timing.dataCollection}ms`);
    
    if (!researchResults.success && !researchResults.results) {
      throw new Error('Data collection failed completely');
    }
    
    // ============ STAGE 2: CITATION CRAWLING ============
    console.log('\n>>> STAGE 2: Citation Crawling');
    const stage2Start = Date.now();
    
    let crawledCitations = [];
    const citations = extractCitationsForCrawling(researchResults.results);
    
    if (citations.length > 0 && options.crawlCitations !== false) {
      console.log(`Found ${citations.length} citations to crawl`);
      
      const partner = await db.partners.findById(partnerId);
      crawledCitations = await crawler.crawlUrls(citations.slice(0, 10), {
        maxConcurrent: 3,
        personName: partner?.name,
        firmName: partner?.firm,
      });
      
      // Save crawled data
      for (const crawled of crawledCitations) {
        if (crawled.success) {
          try {
            await db.prisma.citationCrawl.upsert({
              where: { url: crawled.url },
              create: {
                url: crawled.url,
                domain: crawled.domain,
                title: crawled.title,
                author: crawled.author,
                publishedDate: crawled.publishedDate ? new Date(crawled.publishedDate) : null,
                fullText: crawled.fullText?.substring(0, 50000), // Limit text
                summary: crawled.summary,
                extractedFacts: crawled.extractedFacts || [],
                mentionedPeople: crawled.mentionedPeople || [],
                mentionedCompanies: crawled.mentionedCompanies || [],
                trustScore: crawled.trustScore,
                httpStatus: crawled.httpStatus,
                contentType: crawled.contentType,
                researchId: partnerId,
              },
              update: {
                title: crawled.title,
                fullText: crawled.fullText?.substring(0, 50000),
                summary: crawled.summary,
                extractedFacts: crawled.extractedFacts || [],
                crawledAt: new Date(),
              },
            });
          } catch (e) {
            console.log('Error saving citation:', e.message);
          }
        }
      }
      
      // Add to research results for aggregation
      researchResults.results.crawledCitations = crawledCitations;
    }
    
    pipelineResults.stages.citationCrawling = {
      citationsFound: citations.length,
      crawled: crawledCitations.length,
      successful: crawledCitations.filter(c => c.success).length,
    };
    pipelineResults.timing.citationCrawling = Date.now() - stage2Start;
    console.log(`Stage 2 complete: ${pipelineResults.timing.citationCrawling}ms`);
    
    // ============ STAGE 3: QUALITY SCORING & FACT CHECKING ============
    console.log('\n>>> STAGE 3: Quality Scoring & Fact Checking');
    const stage3Start = Date.now();
    
    // Calculate overall quality score
    const qualityScore = qualityScorer.calculateProfileQualityScore(researchResults.results);
    
    // Collect all facts from all sources
    const allFacts = collectAllFacts(researchResults.results, crawledCitations);
    
    // Deduplicate facts
    const uniqueFacts = qualityScorer.deduplicateFacts(allFacts);
    
    // Cross-reference and verify facts
    const allSources = collectAllSources(researchResults.results, crawledCitations);
    const verifiedFacts = qualityScorer.crossReferenceFacts(uniqueFacts, allSources);
    
    // Save verified facts
    const highConfidenceFacts = qualityScorer.getHighConfidenceFacts(verifiedFacts, 0.6);
    for (const fact of highConfidenceFacts.slice(0, 20)) {
      try {
        await db.prisma.verifiedFact.create({
          data: {
            factType: fact.fact.type || 'general',
            subject: options.name || 'unknown',
            value: typeof fact.fact.value === 'string' ? fact.fact.value : JSON.stringify(fact.fact.value),
            context: fact.fact.context,
            status: fact.status.toUpperCase().replace(/_/g, '_'),
            confidence: fact.confidence,
            corroboratingSources: fact.corroboratingSources,
            contradictions: fact.contradictions,
            personProfileId: null, // Will be linked after profile creation
          },
        });
      } catch (e) {
        // Skip duplicates or errors
      }
    }
    
    pipelineResults.stages.qualityChecking = {
      overallQuality: qualityScore,
      factsCollected: allFacts.length,
      uniqueFacts: uniqueFacts.length,
      verifiedFacts: verifiedFacts.filter(f => f.status === 'verified').length,
      disputedFacts: verifiedFacts.filter(f => f.status === 'disputed').length,
    };
    pipelineResults.timing.qualityChecking = Date.now() - stage3Start;
    console.log(`Stage 3 complete: ${pipelineResults.timing.qualityChecking}ms`);
    
    // ============ STAGE 4: PROFILE AGGREGATION ============
    console.log('\n>>> STAGE 4: Profile Aggregation');
    const stage4Start = Date.now();
    
    const partner = await db.partners.findById(partnerId);
    
    // Build PersonProfile
    const personProfile = await profileAggregator.buildPersonProfile(
      partnerId,
      researchResults.results,
      partner?.onboardingData || {}
    );
    
    // Build/Update FirmProfile
    let firmProfile = null;
    if (partner?.firm) {
      firmProfile = await profileAggregator.buildFirmProfile(
        partner.firm,
        researchResults.results,
        partner.partnerType
      );
      
      // Link person to firm
      await profileAggregator.linkPersonToFirm(partnerId, partner.firm);
    }
    
    pipelineResults.stages.profileAggregation = {
      personProfileCreated: !!personProfile,
      firmProfileCreated: !!firmProfile,
      dataQualityScore: personProfile?.dataQualityScore || 0,
    };
    pipelineResults.timing.profileAggregation = Date.now() - stage4Start;
    console.log(`Stage 4 complete: ${pipelineResults.timing.profileAggregation}ms`);
    
    // ============ STAGE 5: INTRODUCTION GENERATION ============
    console.log('\n>>> STAGE 5: Introduction Generation');
    const stage5Start = Date.now();
    
    let introduction = null;
    if (options.generateIntro !== false) {
      introduction = await introGenerator.generateRichIntro(partnerId, {
        style: 'warm',
        maxLength: 250,
      });
      
      // Store intro in partner's onboarding data
      await db.partners.update(partnerId, {
        onboardingData: {
          ...partner?.onboardingData,
          generatedIntro: introduction,
          introGeneratedAt: new Date().toISOString(),
        },
      });
    }
    
    pipelineResults.stages.introGeneration = {
      generated: !!introduction,
      length: introduction?.length || 0,
    };
    pipelineResults.timing.introGeneration = Date.now() - stage5Start;
    console.log(`Stage 5 complete: ${pipelineResults.timing.introGeneration}ms`);
    
    // ============ COMPLETE ============
    const totalTime = Date.now() - startTime;
    pipelineResults.success = true;
    pipelineResults.totalTime = totalTime;
    pipelineResults.introduction = introduction;
    pipelineResults.qualityScore = pipelineResults.stages.profileAggregation?.dataQualityScore || qualityScore;
    
    console.log(`\n=== FULL PIPELINE COMPLETED in ${totalTime}ms ===`);
    console.log('Quality Score:', (pipelineResults.qualityScore * 100).toFixed(0) + '%');
    
    return pipelineResults;
    
  } catch (error) {
    console.error('Pipeline error:', error.message);
    pipelineResults.success = false;
    pipelineResults.error = error.message;
    pipelineResults.totalTime = Date.now() - startTime;
    
    // Still try to update partner status
    try {
      await db.partners.update(partnerId, {
        researchStatus: 'FAILED',
      });
    } catch (e) {}
    
    return pipelineResults;
  }
}

/**
 * Extract citation URLs from research results for crawling
 */
function extractCitationsForCrawling(results) {
  const urls = new Set();
  
  // From Perplexity person research
  if (results.personNews?.data?.citations) {
    for (const citation of results.personNews.data.citations) {
      if (typeof citation === 'string' && citation.startsWith('http')) {
        urls.add(citation);
      }
    }
  }
  
  // From Perplexity firm research
  if (results.firmInfo?.data?.citations) {
    for (const citation of results.firmInfo.data.citations) {
      if (typeof citation === 'string' && citation.startsWith('http')) {
        urls.add(citation);
      }
    }
  }
  
  // From Tavily results
  if (results.socialProfiles?.data?.rawResults) {
    for (const result of results.socialProfiles.data.rawResults) {
      if (result.url && crawler.shouldCrawl(result.url)) {
        urls.add(result.url);
      }
    }
  }
  
  return Array.from(urls);
}

/**
 * Collect all facts from research results
 */
function collectAllFacts(results, crawledCitations) {
  const facts = [];
  
  // From Perplexity
  if (results.personNews?.data) {
    if (results.personNews.data.deals) {
      facts.push({ type: 'deals', value: results.personNews.data.deals, source: 'perplexity' });
    }
    if (results.personNews.data.newsArticles) {
      facts.push({ type: 'news', value: results.personNews.data.newsArticles, source: 'perplexity' });
    }
  }
  
  // From crawled citations
  for (const crawled of crawledCitations || []) {
    if (crawled.success && crawled.extractedFacts) {
      for (const fact of crawled.extractedFacts) {
        facts.push({
          ...fact,
          source: `crawled_${crawled.domain}`,
        });
      }
    }
  }
  
  return facts;
}

/**
 * Collect all sources for fact checking
 */
function collectAllSources(results, crawledCitations) {
  const sources = [];
  
  if (results.linkedin?.success) {
    sources.push({ source: 'linkedin', data: results.linkedin.data });
  }
  if (results.personNews?.success) {
    sources.push({ source: 'perplexity', data: results.personNews.data });
  }
  if (results.firmInfo?.success) {
    sources.push({ source: 'perplexity_firm', data: results.firmInfo.data });
  }
  if (results.wikipediaPerson?.success) {
    sources.push({ source: 'wikipedia', data: results.wikipediaPerson.data });
  }
  
  for (const crawled of crawledCitations || []) {
    if (crawled.success) {
      sources.push({ source: `crawled_${crawled.domain}`, data: crawled });
    }
  }
  
  return sources;
}

module.exports = {
  startResearch,
  runFullPipeline,
  getResearchStatus,
  getPartnerResearch,
  aggregateResults,
  extractCitationsForCrawling,
};

