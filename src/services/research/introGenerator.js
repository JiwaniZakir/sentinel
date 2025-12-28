/**
 * Enhanced Introduction Generator
 * 
 * Creates highly personalized introductions using rich profile data,
 * verified facts, and onboarding responses.
 */

const openaiService = require('../openai');
const db = require('../database');
const qualityScorer = require('./qualityScorer');
const { logger } = require('../../utils/logger');

// Partner type emojis
const PARTNER_TYPE_EMOJI = {
  'VC': '💰',
  'CORPORATE': '🏢',
  'COMMUNITY_BUILDER': '🌱',
  'ANGEL': '👼',
  'OTHER': '🤝',
};

/**
 * Generate a rich, personalized introduction
 */
async function generateRichIntro(partnerId, options = {}) {
  console.log('=== GENERATING RICH INTRODUCTION ===');
  console.log('Partner ID:', partnerId);
  
  // Fetch all available data
  const partner = await db.partners.findById(partnerId);
  if (!partner) {
    throw new Error(`Partner not found: ${partnerId}`);
  }
  
  // Get person profile
  let personProfile = null;
  try {
    personProfile = await db.prisma.personProfile.findUnique({
      where: { partnerId },
    });
  } catch (e) {
    console.log('No person profile found');
  }
  
  // Get firm profile
  let firmProfile = null;
  try {
    if (partner.firm) {
      firmProfile = await db.prisma.firmProfile.findUnique({
        where: { name: partner.firm },
      });
    }
  } catch (e) {
    console.log('No firm profile found');
  }
  
  // Get verified facts
  let verifiedFacts = [];
  try {
    verifiedFacts = await db.prisma.verifiedFact.findMany({
      where: { 
        personProfileId: personProfile?.id,
        status: { in: ['VERIFIED', 'PARTIALLY_VERIFIED'] },
        confidence: { gte: 0.6 },
      },
      orderBy: { confidence: 'desc' },
      take: 10,
    });
  } catch (e) {
    console.log('No verified facts found');
  }
  
  // Build comprehensive context
  const context = buildIntroContext(partner, personProfile, firmProfile, verifiedFacts);
  
  // Generate intro with OpenAI
  const intro = await generateIntroWithAI(context, options);
  
  console.log('Introduction generated');
  return intro;
}

/**
 * Build context for intro generation
 */
function buildIntroContext(partner, personProfile, firmProfile, verifiedFacts) {
  const context = {
    // Core identity (from partner input - PRIMARY SOURCE OF TRUTH)
    // These are what the partner told us during onboarding
    name: partner.name,
    firm: partner.firm,
    role: partner.role,
    partnerType: partner.partnerType,
    emoji: PARTNER_TYPE_EMOJI[partner.partnerType] || '👋',
    
    // Onboarding responses (self-reported - PRIMARY SOURCE OF TRUTH)
    // Everything the partner shared during the conversation
    onboarding: partner.onboardingData || {},
    
    // LinkedIn/Professional
    headline: personProfile?.headline,
    location: personProfile?.location,
    
    // Investment focus
    investmentThesis: personProfile?.investmentThesis || partner.onboardingData?.thesis,
    sectors: partner.sectors || [],
    stageFocus: partner.stageFocus || [],
    checkSize: partner.checkSize,
    
    // Career highlights (from profile)
    careerHighlights: extractCareerHighlights(personProfile?.careerTimeline),
    education: formatEducation(personProfile?.education),
    
    // Achievements (verified)
    notableDeals: formatDeals(personProfile?.notableDeals, verifiedFacts),
    awards: formatAwards(personProfile?.awards),
    pressFeatures: formatPress(personProfile?.pressFeatures),
    speakingEvents: formatSpeaking(personProfile?.speakingEvents),
    
    // Thought leadership
    publications: formatPublications(personProfile?.publications),
    podcasts: formatPodcasts(personProfile?.podcasts),
    
    // Personal
    funFacts: personProfile?.funFacts || [],
    interests: personProfile?.interests || [],
    quotableQuotes: personProfile?.quotableQuotes || [],
    
    // Self-reported from onboarding
    originStory: partner.onboardingData?.origin_story,
    superpower: partner.onboardingData?.superpower,
    proudMoment: partner.onboardingData?.proud_moment,
    wishlist: partner.onboardingData?.wishlist,
    contributionOffers: partner.contributionOffers || [],
    goalsFromCommunity: partner.goalsFromCommunity,
    
    // Firm context
    firmOverview: firmProfile?.description,
    firmPortfolio: formatFirmPortfolio(firmProfile?.notablePortfolio),
    firmTeamSize: firmProfile?.partnerCount,
    
    // Data quality indicators
    dataQuality: personProfile?.dataQualityScore || 0,
    sourcesUsed: personProfile?.sourcesUsed || [],
    
    // Verified facts for extra credibility
    verifiedFacts: verifiedFacts.map(f => ({
      type: f.factType,
      value: f.value,
      confidence: f.confidence,
    })),
  };
  
  return context;
}

/**
 * Generate introduction with AI
 */
async function generateIntroWithAI(context, options = {}) {
  const { style = 'warm', maxLength = 250 } = options;
  
  const systemPrompt = `You are writing a warm, engaging introduction for a new community member joining a network of investors and operators supporting entrepreneurs.

Your goal is to make this person feel welcomed AND make other community members excited to connect with them.

WRITING STYLE:
- ${style === 'warm' ? 'Warm and welcoming, like introducing a friend' : 'Professional but friendly'}
- Specific and personal - avoid generic statements
- Highlight what makes this person UNIQUE
- Include conversation starters for other members
- Keep it under ${maxLength} words

RULES:
1. Lead with something impressive or unique - NOT "Please welcome" or generic titles
2. Include 2-3 SPECIFIC achievements, deals, or interesting facts
3. If they have a fun fact or personal interest, include it
4. End with connection opportunities (what they can offer OR are looking for)
5. PRIORITIZE self-reported onboarding information (origin story, superpower, what they told us)
6. Use research to SUPPLEMENT and add context (background, achievements, press)
7. If onboarding and research conflict, TRUST the onboarding data (what they said)
8. Only mention verified facts or self-reported information - never fabricate
9. If data quality is low (< 0.5), rely entirely on onboarding responses

DO NOT:
- Use phrases like "experienced investor" or "seasoned professional" without specifics
- Mention that you researched them or had access to data
- Include anything that sounds like a LinkedIn bio
- Be generic or corporate sounding`;

  const userPrompt = `Generate an introduction for this new community member:

NAME: ${context.name}
FIRM: ${context.firm}
ROLE: ${context.role || 'Partner'}
TYPE: ${context.partnerType}

${context.headline ? `HEADLINE: ${context.headline}` : ''}
${context.location ? `LOCATION: ${context.location}` : ''}

=== INVESTMENT FOCUS ===
${context.investmentThesis ? `THESIS: ${context.investmentThesis}` : ''}
${context.sectors.length > 0 ? `SECTORS: ${context.sectors.join(', ')}` : ''}
${context.stageFocus.length > 0 ? `STAGE: ${context.stageFocus.join(', ')}` : ''}
${context.checkSize ? `CHECK SIZE: ${context.checkSize}` : ''}

=== CAREER HIGHLIGHTS ===
${context.careerHighlights || 'Not available'}
${context.education ? `EDUCATION: ${context.education}` : ''}

=== ACHIEVEMENTS (High confidence) ===
${context.notableDeals || 'Not available'}
${context.awards || ''}
${context.speakingEvents || ''}

=== THOUGHT LEADERSHIP ===
${context.publications || ''}
${context.podcasts || ''}

=== FROM THEIR ONBOARDING (Self-reported) ===
${context.originStory ? `ORIGIN STORY: ${context.originStory}` : ''}
${context.superpower ? `SUPERPOWER: ${context.superpower}` : ''}
${context.proudMoment ? `PROUD MOMENT: ${context.proudMoment}` : ''}
${context.wishlist ? `LOOKING TO MEET: ${context.wishlist}` : ''}
${context.funFacts.length > 0 ? `FUN FACTS: ${context.funFacts.join('. ')}` : ''}
${context.goalsFromCommunity ? `GOALS FROM COMMUNITY: ${context.goalsFromCommunity}` : ''}
${context.contributionOffers.length > 0 ? `WANTS TO CONTRIBUTE: ${context.contributionOffers.join(', ')}` : ''}

=== FIRM CONTEXT ===
${context.firmOverview ? `ABOUT ${context.firm}: ${context.firmOverview}` : ''}
${context.firmPortfolio || ''}

DATA QUALITY SCORE: ${(context.dataQuality * 100).toFixed(0)}%
SOURCES USED: ${context.sourcesUsed.join(', ') || 'Onboarding only'}

Write an engaging introduction that will make the community excited to connect with ${context.name}.`;

  try {
    const response = await openaiService.generateText(systemPrompt, userPrompt, {
      temperature: 0.7,
      maxTokens: 500,
    });
    
    // Add emoji prefix
    const intro = `${context.emoji} *Welcome ${context.name}!*\n\n${response}`;
    
    return intro;
  } catch (error) {
    console.error('Error generating intro:', error.message);
    
    // Fallback to basic intro
    return generateFallbackIntro(context);
  }
}

/**
 * Generate a basic fallback intro if AI fails
 */
function generateFallbackIntro(context) {
  const emoji = context.emoji;
  const parts = [`${emoji} *Welcome ${context.name}!*\n`];
  
  if (context.role && context.firm) {
    parts.push(`${context.name} joins us as ${context.role} at ${context.firm}.`);
  }
  
  if (context.sectors.length > 0) {
    parts.push(`They focus on ${context.sectors.slice(0, 3).join(', ')}.`);
  }
  
  if (context.originStory) {
    parts.push(`\n\n"${context.originStory}"`);
  }
  
  if (context.goalsFromCommunity) {
    parts.push(`\n\nLooking for: ${context.goalsFromCommunity}`);
  }
  
  parts.push('\n\nPlease give them a warm welcome! 🎉');
  
  return parts.join(' ');
}

// ============ Formatting Helpers ============

function extractCareerHighlights(timeline) {
  if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
    return null;
  }
  
  const highlights = timeline.slice(0, 3).map(t => {
    let entry = `${t.role} at ${t.company}`;
    if (t.duration) entry += ` (${t.duration})`;
    return entry;
  });
  
  return highlights.join('\n');
}

function formatEducation(education) {
  if (!education || !Array.isArray(education) || education.length === 0) {
    return null;
  }
  
  return education.map(e => {
    let entry = e.school;
    if (e.degree) entry = `${e.degree} from ${entry}`;
    return entry;
  }).join(', ');
}

function formatDeals(deals, verifiedFacts) {
  const allDeals = [];
  
  // Add deals from profile
  if (deals && Array.isArray(deals)) {
    for (const deal of deals.slice(0, 5)) {
      if (typeof deal === 'string') {
        allDeals.push(deal);
      } else if (deal.content) {
        allDeals.push(deal.content);
      } else if (deal.company) {
        let entry = deal.company;
        if (deal.round) entry += ` (${deal.round})`;
        allDeals.push(entry);
      }
    }
  }
  
  // Add verified investment facts
  const investmentFacts = verifiedFacts.filter(f => 
    f.factType === 'investment' || f.factType === 'funding'
  );
  for (const fact of investmentFacts.slice(0, 3)) {
    if (!allDeals.some(d => d.toLowerCase().includes(fact.value.toLowerCase().substring(0, 20)))) {
      allDeals.push(fact.value);
    }
  }
  
  return allDeals.length > 0 ? allDeals.join('\n') : null;
}

function formatAwards(awards) {
  if (!awards || !Array.isArray(awards) || awards.length === 0) {
    return null;
  }
  
  return awards.slice(0, 3).map(a => {
    if (typeof a === 'string') return a;
    if (a.content) return a.content;
    if (a.name) return `${a.name}${a.year ? ` (${a.year})` : ''}`;
    return null;
  }).filter(Boolean).join('\n');
}

function formatPress(press) {
  if (!press || !Array.isArray(press) || press.length === 0) {
    return null;
  }
  
  return press.slice(0, 3).map(p => {
    if (typeof p === 'string') return p;
    if (p.title) return `${p.title} (${p.source || 'press'})`;
    return null;
  }).filter(Boolean).join('\n');
}

function formatSpeaking(events) {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return null;
  }
  
  return events.slice(0, 3).map(e => {
    if (typeof e === 'string') return e;
    if (e.content) return e.content;
    if (e.event) return `${e.topic || 'Spoke'} at ${e.event}`;
    return null;
  }).filter(Boolean).join('\n');
}

function formatPublications(pubs) {
  if (!pubs || !Array.isArray(pubs) || pubs.length === 0) {
    return null;
  }
  
  return pubs.slice(0, 3).map(p => {
    if (typeof p === 'string') return p;
    if (p.content) return p.content;
    if (p.title) return p.title;
    return null;
  }).filter(Boolean).join('\n');
}

function formatPodcasts(podcasts) {
  if (!podcasts || !Array.isArray(podcasts) || podcasts.length === 0) {
    return null;
  }
  
  return podcasts.slice(0, 3).map(p => {
    if (typeof p === 'string') return p;
    if (p.content) return p.content;
    if (p.show) return `${p.show}${p.episode ? `: ${p.episode}` : ''}`;
    return null;
  }).filter(Boolean).join('\n');
}

function formatFirmPortfolio(portfolio) {
  if (!portfolio || !Array.isArray(portfolio) || portfolio.length === 0) {
    return null;
  }
  
  const companies = portfolio.slice(0, 5).map(p => {
    if (typeof p === 'string') return p;
    if (p.company) return p.company;
    if (p.content) return p.content.substring(0, 50);
    return null;
  }).filter(Boolean);
  
  return companies.length > 0 ? `PORTFOLIO INCLUDES: ${companies.join(', ')}` : null;
}

/**
 * Generate intro preview for partner approval
 */
async function generateIntroPreview(partnerId) {
  const intro = await generateRichIntro(partnerId, { style: 'warm' });
  
  // Also get data quality info
  let personProfile = null;
  try {
    personProfile = await db.prisma.personProfile.findUnique({
      where: { partnerId },
    });
  } catch (e) {}
  
  return {
    intro,
    dataQuality: personProfile?.dataQualityScore || 0,
    sourcesUsed: personProfile?.sourcesUsed || [],
    canEdit: true,
  };
}

module.exports = {
  generateRichIntro,
  generateIntroPreview,
  buildIntroContext,
  generateFallbackIntro,
};

