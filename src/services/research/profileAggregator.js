/**
 * Profile Aggregator Service
 * 
 * Combines data from all research sources into unified PersonProfile
 * and FirmProfile records. Handles multi-person firms.
 */

const db = require('../database');
const qualityScorer = require('./qualityScorer');
const { logger } = require('../../utils/logger');

/**
 * Build or update a PersonProfile from research results
 */
async function buildPersonProfile(partnerId, researchResults, onboardingData = {}) {
  console.log('=== BUILDING PERSON PROFILE ===');
  console.log('Partner ID:', partnerId);
  
  // Get existing partner and profile
  const partner = await db.partners.findById(partnerId);
  if (!partner) {
    throw new Error(`Partner not found: ${partnerId}`);
  }
  
  // Extract data from each source
  const linkedinData = extractLinkedInData(researchResults.linkedin);
  const perplexityPersonData = extractPerplexityPersonData(researchResults.personNews);
  const perplexityFirmData = extractPerplexityFirmData(researchResults.firmInfo);
  const socialData = extractSocialData(researchResults.socialProfiles);
  const wikipediaPersonData = extractWikipediaPersonData(researchResults.wikipediaPerson);
  const crawledData = extractCrawledData(researchResults.crawledCitations || []);
  
  // Calculate quality score
  const qualityScore = qualityScorer.calculateProfileQualityScore(researchResults);
  
  // Merge all data with priority ordering
  const profileData = {
    partnerId,
    
    // Core Identity (LinkedIn > Wikipedia > Perplexity)
    name: partner.name,
    linkedinUrl: partner.linkedinUrl,
    twitterUrl: socialData?.twitter?.url || null,
    email: partner.email,
    location: linkedinData?.location || wikipediaPersonData?.location || null,
    photoUrl: linkedinData?.photoUrl || null,
    headline: linkedinData?.headline || null,
    
    // Career (LinkedIn primary, enriched by Perplexity/Wikipedia)
    careerTimeline: buildCareerTimeline(linkedinData, perplexityPersonData, wikipediaPersonData),
    education: buildEducation(linkedinData, wikipediaPersonData),
    
    // Investment Focus (Onboarding > LinkedIn > Perplexity)
    investmentThesis: onboardingData.thesis || linkedinData?.about || perplexityPersonData?.thesis || null,
    sectors: onboardingData.sectors || partner.sectors || [],
    stageFocus: onboardingData.stage_focus || partner.stageFocus || [],
    checkSizeRange: onboardingData.check_size || partner.checkSize || null,
    
    // Achievements (Perplexity > Crawled > Wikipedia)
    notableDeals: mergeDeals(perplexityPersonData?.deals, crawledData?.deals),
    awards: mergeAwards(perplexityPersonData?.awards, wikipediaPersonData?.awards),
    pressFeatures: mergePress(perplexityPersonData?.news, crawledData?.news),
    speakingEvents: perplexityPersonData?.speaking || [],
    
    // Content & Thought Leadership (Perplexity > Social)
    publications: perplexityPersonData?.articles || [],
    podcasts: perplexityPersonData?.podcasts || [],
    socialContent: socialData?.recentContent || null,
    
    // Personal (Onboarding > Perplexity > Wikipedia)
    funFacts: extractFunFacts(onboardingData, perplexityPersonData, wikipediaPersonData),
    interests: extractInterests(onboardingData, linkedinData, wikipediaPersonData),
    quotableQuotes: extractQuotes(perplexityPersonData, crawledData),
    
    // Quality Metadata
    dataQualityScore: qualityScore,
    factCheckScore: 0, // Will be updated after fact checking
    sourcesUsed: getSourcesUsed(researchResults),
    lastResearchAt: new Date(),
  };
  
  // Generate AI summaries
  profileData.shortBio = generateShortBio(profileData);
  profileData.connectionAngles = generateConnectionAngles(profileData, partner.partnerType);
  
  console.log('Profile data built, quality score:', qualityScore.toFixed(2));
  
  // Upsert PersonProfile
  try {
    const existing = await db.prisma.personProfile.findUnique({
      where: { partnerId },
    });
    
    if (existing) {
      await db.prisma.personProfile.update({
        where: { partnerId },
        data: profileData,
      });
      console.log('Updated existing person profile');
    } else {
      await db.prisma.personProfile.create({
        data: profileData,
      });
      console.log('Created new person profile');
    }
    
    return profileData;
  } catch (error) {
    console.error('Error saving person profile:', error.message);
    throw error;
  }
}

/**
 * Build or update a FirmProfile from research results
 * Handles multi-person firms (accumulates data)
 */
async function buildFirmProfile(firmName, researchResults, partnerType = 'VC') {
  console.log('=== BUILDING FIRM PROFILE ===');
  console.log('Firm:', firmName);
  
  // Get existing firm profile
  const existing = await db.prisma.firmProfile.findUnique({
    where: { name: firmName },
  });
  
  // Extract firm data from sources
  const perplexityFirmData = extractPerplexityFirmData(researchResults.firmInfo);
  const wikipediaFirmData = extractWikipediaFirmData(researchResults.wikipediaCompany);
  const crawledData = extractCrawledData(researchResults.crawledCitations || []);
  
  // Determine firm type
  const firmType = mapPartnerTypeToFirmType(partnerType);
  
  // Build profile data
  const profileData = {
    name: firmName,
    type: firmType,
    
    // Identity (Wikipedia > Perplexity > Crawled)
    foundedYear: wikipediaFirmData?.foundedYear || perplexityFirmData?.foundedYear || null,
    headquarters: wikipediaFirmData?.headquarters || perplexityFirmData?.headquarters || null,
    website: perplexityFirmData?.website || crawledData?.website || null,
    linkedinUrl: crawledData?.linkedinUrl || null,
    description: wikipediaFirmData?.description || perplexityFirmData?.overview || null,
    
    // Investment Profile
    aum: perplexityFirmData?.aum || existing?.aum || null,
    fundCount: perplexityFirmData?.fundCount || existing?.fundCount || null,
    portfolioSize: perplexityFirmData?.portfolioSize || existing?.portfolioSize || null,
    investmentThesis: perplexityFirmData?.thesis || wikipediaFirmData?.thesis || existing?.investmentThesis || null,
    sectorFocus: mergeLists(existing?.sectorFocus, perplexityFirmData?.sectors),
    stageFocus: mergeLists(existing?.stageFocus, perplexityFirmData?.stages),
    geographyFocus: mergeLists(existing?.geographyFocus, perplexityFirmData?.geography),
    
    // Portfolio (merge with existing)
    notablePortfolio: mergePortfolio(existing?.notablePortfolio, perplexityFirmData?.portfolio, wikipediaFirmData?.portfolio),
    exits: mergeExits(existing?.exits, perplexityFirmData?.exits),
    
    // Team (accumulate)
    teamMembers: existing?.teamMembers || [],
    partnerCount: existing?.partnerCount || null,
    
    // News
    recentNews: perplexityFirmData?.news || crawledData?.news || [],
    fundingNews: perplexityFirmData?.fundingNews || [],
    rankings: mergeRankings(existing?.rankings, perplexityFirmData?.rankings),
    
    // Quality
    dataQualityScore: qualityScorer.calculateProfileQualityScore({ firmInfo: researchResults.firmInfo }),
    sourcesUsed: getSourcesUsed(researchResults),
    lastResearchAt: new Date(),
  };
  
  // Upsert FirmProfile
  try {
    if (existing) {
      await db.prisma.firmProfile.update({
        where: { name: firmName },
        data: profileData,
      });
      console.log('Updated existing firm profile');
    } else {
      await db.prisma.firmProfile.create({
        data: profileData,
      });
      console.log('Created new firm profile');
    }
    
    return profileData;
  } catch (error) {
    console.error('Error saving firm profile:', error.message);
    throw error;
  }
}

/**
 * Link a person profile to a firm profile
 */
async function linkPersonToFirm(partnerId, firmName) {
  try {
    const firmProfile = await db.prisma.firmProfile.findUnique({
      where: { name: firmName },
    });
    
    if (firmProfile) {
      await db.prisma.personProfile.update({
        where: { partnerId },
        data: { firmProfileId: firmProfile.id },
      });
      
      // Also add to team members
      const teamMembers = firmProfile.teamMembers || [];
      const partner = await db.partners.findById(partnerId);
      
      const existingMember = teamMembers.find(m => m.partnerId === partnerId);
      if (!existingMember && partner) {
        teamMembers.push({
          name: partner.name,
          role: partner.role,
          partnerId,
          linkedinUrl: partner.linkedinUrl,
        });
        
        await db.prisma.firmProfile.update({
          where: { name: firmName },
          data: { 
            teamMembers,
            partnerCount: teamMembers.length,
          },
        });
      }
      
      console.log(`Linked ${partner?.name} to ${firmName}`);
    }
  } catch (error) {
    console.error('Error linking person to firm:', error.message);
  }
}

// ============ Data Extraction Helpers ============

function extractLinkedInData(linkedinResult) {
  if (!linkedinResult?.success) return null;
  
  const data = linkedinResult.data || {};
  return {
    name: data.name,
    headline: data.headline,
    about: data.about,
    location: data.location,
    currentCompany: data.currentCompany,
    currentTitle: data.currentTitle,
    photoUrl: data.photoUrl,
    experiences: data.experiences || [],
    educations: data.educations || data.education || [],
    skills: data.skills || [],
  };
}

function extractPerplexityPersonData(personNewsResult) {
  if (!personNewsResult?.success) return null;
  
  const data = personNewsResult.data || {};
  return {
    summary: data.summary,
    news: parseNewsArticles(data.newsArticles),
    deals: parseDeals(data.deals),
    articles: parseArticles(data.articles),
    podcasts: parsePodcasts(data.podcasts),
    speaking: parseSpeaking(data.speaking),
    awards: parseAwards(data.awards),
    thesis: data.thesis,
  };
}

function extractPerplexityFirmData(firmInfoResult) {
  if (!firmInfoResult?.success) return null;
  
  const data = firmInfoResult.data || {};
  return {
    overview: data.overview,
    leadership: data.leadership,
    portfolio: parsePortfolio(data.portfolio),
    news: parseNewsArticles(data.news),
    sectors: data.sectors || [],
    stages: data.stages || [],
    aum: data.aum,
    thesis: data.thesis,
    headquarters: data.headquarters,
    foundedYear: data.foundedYear,
    exits: data.exits || [],
  };
}

function extractSocialData(socialResult) {
  if (!socialResult?.success) return null;
  
  const profiles = socialResult.data?.profiles || {};
  return {
    twitter: profiles.twitter,
    substack: profiles.substack,
    medium: profiles.medium,
    github: profiles.github,
    youtube: profiles.youtube,
    podcast: profiles.podcast,
    blog: profiles.blog,
  };
}

function extractWikipediaPersonData(wikipediaResult) {
  if (!wikipediaResult?.success) return null;
  
  const data = wikipediaResult.data || {};
  return {
    summary: data.summary,
    careerInfo: data.career_info?.raw_career,
    education: data.education?.raw_education,
    categories: data.categories,
    url: data.url,
    location: null, // Wikipedia doesn't typically have current location
  };
}

function extractWikipediaFirmData(wikipediaResult) {
  if (!wikipediaResult?.success) return null;
  
  const data = wikipediaResult.data || {};
  return {
    description: data.summary,
    foundingInfo: data.company_info?.founding_info,
    portfolioInfo: data.company_info?.portfolio_info,
    categories: data.categories,
    url: data.url,
    foundedYear: extractYear(data.company_info?.founding_info),
    headquarters: extractHeadquarters(data.summary),
    thesis: null,
    portfolio: parseWikipediaPortfolio(data.company_info?.portfolio_info),
  };
}

function extractCrawledData(crawledResults) {
  const data = {
    deals: [],
    news: [],
    quotes: [],
  };
  
  for (const crawled of crawledResults) {
    if (!crawled?.success) continue;
    
    // Extract facts by type
    const facts = crawled.extractedFacts || [];
    for (const fact of facts) {
      if (fact.type === 'funding' || fact.type === 'investment') {
        data.deals.push({
          value: fact.value,
          context: fact.context,
          source: crawled.url,
          confidence: fact.confidence,
        });
      }
    }
    
    // Add as news source
    if (crawled.title) {
      data.news.push({
        title: crawled.title,
        url: crawled.url,
        date: crawled.publishedDate,
        source: crawled.domain,
        summary: crawled.summary,
      });
    }
  }
  
  return data;
}

// ============ Data Merging Helpers ============

function buildCareerTimeline(linkedin, perplexity, wikipedia) {
  const timeline = [];
  
  // LinkedIn experiences are most reliable
  if (linkedin?.experiences) {
    for (const exp of linkedin.experiences) {
      timeline.push({
        company: exp.company,
        role: exp.title,
        startDate: exp.startDate,
        endDate: exp.endDate,
        duration: exp.duration,
        highlights: exp.description,
        source: 'linkedin',
      });
    }
  }
  
  // Enrich with Wikipedia if available
  if (wikipedia?.careerInfo) {
    // Extract additional positions mentioned in Wikipedia
    const wikiPositions = parseCareerFromText(wikipedia.careerInfo);
    for (const pos of wikiPositions) {
      const exists = timeline.some(t => 
        t.company?.toLowerCase() === pos.company?.toLowerCase()
      );
      if (!exists) {
        timeline.push({ ...pos, source: 'wikipedia' });
      }
    }
  }
  
  return timeline;
}

function buildEducation(linkedin, wikipedia) {
  const education = [];
  
  if (linkedin?.educations) {
    for (const edu of linkedin.educations) {
      education.push({
        school: edu.school,
        degree: edu.degree,
        field: edu.field,
        year: edu.endDate,
        source: 'linkedin',
      });
    }
  }
  
  return education;
}

function mergeDeals(perplexityDeals, crawledDeals) {
  const deals = [];
  
  if (perplexityDeals) {
    deals.push(...(Array.isArray(perplexityDeals) ? perplexityDeals : [perplexityDeals]));
  }
  
  if (crawledDeals) {
    for (const deal of crawledDeals) {
      const exists = deals.some(d => 
        JSON.stringify(d).toLowerCase().includes(deal.value?.toLowerCase()?.substring(0, 20))
      );
      if (!exists) {
        deals.push(deal);
      }
    }
  }
  
  return deals.slice(0, 20); // Limit
}

function mergeAwards(perplexityAwards, wikipediaAwards) {
  const awards = [];
  if (perplexityAwards) awards.push(...(Array.isArray(perplexityAwards) ? perplexityAwards : []));
  if (wikipediaAwards) awards.push(...(Array.isArray(wikipediaAwards) ? wikipediaAwards : []));
  return awards.slice(0, 10);
}

function mergePress(perplexityNews, crawledNews) {
  const news = [];
  if (perplexityNews) news.push(...(Array.isArray(perplexityNews) ? perplexityNews : []));
  if (crawledNews) news.push(...(Array.isArray(crawledNews) ? crawledNews : []));
  
  // Sort by date, most recent first
  news.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return news.slice(0, 15);
}

function mergeLists(existing, newItems) {
  const combined = new Set(existing || []);
  if (newItems) {
    for (const item of newItems) {
      combined.add(item);
    }
  }
  return Array.from(combined);
}

function mergePortfolio(existing, perplexity, wikipedia) {
  const portfolio = [];
  if (existing) portfolio.push(...(Array.isArray(existing) ? existing : []));
  if (perplexity) portfolio.push(...(Array.isArray(perplexity) ? perplexity : []));
  if (wikipedia) portfolio.push(...(Array.isArray(wikipedia) ? wikipedia : []));
  
  // Deduplicate by company name
  const seen = new Set();
  return portfolio.filter(p => {
    const key = p.company?.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function mergeExits(existing, perplexity) {
  const exits = [];
  if (existing) exits.push(...(Array.isArray(existing) ? existing : []));
  if (perplexity) exits.push(...(Array.isArray(perplexity) ? perplexity : []));
  return exits.slice(0, 20);
}

function mergeRankings(existing, perplexity) {
  const rankings = [];
  if (existing) rankings.push(...(Array.isArray(existing) ? existing : []));
  if (perplexity) rankings.push(...(Array.isArray(perplexity) ? perplexity : []));
  return rankings.slice(0, 10);
}

// ============ Parsing Helpers ============

function parseNewsArticles(newsText) {
  if (!newsText) return [];
  // Simple extraction - would be enhanced with better NLP
  return [{ content: newsText, type: 'news' }];
}

function parseDeals(dealsText) {
  if (!dealsText) return [];
  return [{ content: dealsText, type: 'deals' }];
}

function parseArticles(articlesText) {
  if (!articlesText) return [];
  return [{ content: articlesText, type: 'articles' }];
}

function parsePodcasts(podcastsText) {
  if (!podcastsText) return [];
  return [{ content: podcastsText, type: 'podcasts' }];
}

function parseSpeaking(speakingText) {
  if (!speakingText) return [];
  return [{ content: speakingText, type: 'speaking' }];
}

function parseAwards(awardsText) {
  if (!awardsText) return [];
  return [{ content: awardsText, type: 'awards' }];
}

function parsePortfolio(portfolioText) {
  if (!portfolioText) return [];
  return [{ content: portfolioText, type: 'portfolio' }];
}

function parseWikipediaPortfolio(portfolioInfo) {
  if (!portfolioInfo) return [];
  return [{ content: portfolioInfo, source: 'wikipedia' }];
}

function parseCareerFromText(careerText) {
  // Basic extraction of positions from text
  const positions = [];
  // This would be enhanced with NLP
  return positions;
}

function extractYear(text) {
  if (!text) return null;
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : null;
}

function extractHeadquarters(text) {
  if (!text) return null;
  // Look for common patterns
  const patterns = [
    /headquartered in ([^,.\n]+)/i,
    /based in ([^,.\n]+)/i,
    /located in ([^,.\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// ============ Summary Generators ============

function extractFunFacts(onboarding, perplexity, wikipedia) {
  const facts = [];
  
  if (onboarding?.fun_fact) {
    facts.push(onboarding.fun_fact);
  }
  
  // Could extract from Wikipedia categories or Perplexity
  if (wikipedia?.categories) {
    const interestingCategories = wikipedia.categories.filter(c => 
      !c.includes('Living people') && 
      !c.includes('births') &&
      c.length < 50
    );
    if (interestingCategories.length > 0) {
      facts.push(`Wikipedia categories include: ${interestingCategories.slice(0, 3).join(', ')}`);
    }
  }
  
  return facts;
}

function extractInterests(onboarding, linkedin, wikipedia) {
  const interests = [];
  
  if (linkedin?.skills) {
    interests.push(...linkedin.skills.slice(0, 5));
  }
  
  return interests;
}

function extractQuotes(perplexity, crawled) {
  const quotes = [];
  
  // Would extract actual quotes from content
  // This is a placeholder for more sophisticated NLP
  
  return quotes;
}

function generateShortBio(profileData) {
  const parts = [];
  
  if (profileData.headline) {
    parts.push(profileData.headline);
  } else if (profileData.careerTimeline?.[0]) {
    const current = profileData.careerTimeline[0];
    parts.push(`${current.role} at ${current.company}`);
  }
  
  if (profileData.sectors?.length > 0) {
    parts.push(`Focused on ${profileData.sectors.slice(0, 3).join(', ')}`);
  }
  
  return parts.join('. ') || null;
}

function generateConnectionAngles(profileData, partnerType) {
  const angles = [];
  
  // Investment focus alignment
  if (profileData.sectors?.length > 0) {
    angles.push({
      type: 'sector_match',
      description: `Can help founders in ${profileData.sectors.join(', ')}`,
    });
  }
  
  // Experience sharing
  if (profileData.careerTimeline?.length > 3) {
    angles.push({
      type: 'experience',
      description: 'Has extensive industry experience to share',
    });
  }
  
  // Content creator
  if (profileData.publications?.length > 0 || profileData.podcasts?.length > 0) {
    angles.push({
      type: 'thought_leader',
      description: 'Active content creator and thought leader',
    });
  }
  
  return angles;
}

function getSourcesUsed(researchResults) {
  const sources = [];
  
  if (researchResults.linkedin?.success) sources.push('linkedin');
  if (researchResults.personNews?.success) sources.push('perplexity_person');
  if (researchResults.firmInfo?.success) sources.push('perplexity_firm');
  if (researchResults.socialProfiles?.success) sources.push('tavily_social');
  if (researchResults.wikipediaPerson?.success) sources.push('wikipedia_person');
  if (researchResults.wikipediaCompany?.success) sources.push('wikipedia_company');
  if (researchResults.crawledCitations?.some(c => c.success)) sources.push('citation_crawl');
  
  return sources;
}

function mapPartnerTypeToFirmType(partnerType) {
  const mapping = {
    'VC': 'VC',
    'CORPORATE': 'CORPORATE',
    'ANGEL': 'ANGEL_NETWORK',
    'COMMUNITY_BUILDER': 'OTHER',
    'OTHER': 'OTHER',
  };
  return mapping[partnerType] || 'OTHER';
}

module.exports = {
  buildPersonProfile,
  buildFirmProfile,
  linkPersonToFirm,
  extractLinkedInData,
  extractPerplexityPersonData,
  extractPerplexityFirmData,
  extractSocialData,
  extractWikipediaPersonData,
  extractWikipediaFirmData,
};

