/**
 * Research Query Templates
 * 
 * Standardized queries for researching partners and their firms.
 */

/**
 * Generate a person research query for Perplexity
 */
function getPersonResearchQuery(name, firm, role) {
  return `Research ${name}, ${role || 'professional'} at ${firm}. Find:
1. Recent news articles or press mentions (last 2 years)
2. Podcast or interview appearances
3. Notable investments, deals, or projects they've led
4. Published articles, blog posts, or thought leadership
5. Speaking engagements or conference talks
6. Any awards or recognition

Return specific details with dates and sources where available.`;
}

/**
 * Generate a firm research query for Perplexity
 */
function getFirmResearchQuery(firmName, firmType) {
  const vcAdditions = firmType === 'VC' ? `
- Fund size and stage focus
- Notable portfolio companies
- Recent investments (last 12 months)
- General partners and their backgrounds` : '';

  const corporateAdditions = firmType === 'CORPORATE' ? `
- Innovation initiatives or startup programs
- Recent partnerships with startups
- Strategic priorities and focus areas` : '';

  return `Research ${firmName}. Find:
1. Company overview and founding story
2. Key leadership team members
3. Recent news and press releases (last 6 months)
4. Company size and growth trajectory
5. Notable achievements or milestones
${vcAdditions}${corporateAdditions}

Return specific details with dates and sources.`;
}

/**
 * Generate a social profile search query for Tavily
 */
function getSocialProfileQuery(name, firm) {
  return `${name} ${firm} Twitter OR X OR Substack OR blog OR podcast OR GitHub`;
}

/**
 * Generate keywords to search for specific content types
 */
const CONTENT_KEYWORDS = {
  twitter: ['twitter.com', 'x.com'],
  substack: ['substack.com'],
  medium: ['medium.com'],
  blog: ['blog', 'writing', 'posts'],
  podcast: ['podcast', 'spotify.com/show', 'anchor.fm', 'apple.com/podcast'],
  youtube: ['youtube.com'],
  github: ['github.com'],
  linkedin: ['linkedin.com/in'],
};

/**
 * Extract specific profile types from search results
 */
function categorizeSearchResults(results) {
  const categorized = {
    twitter: null,
    substack: null,
    medium: null,
    blog: null,
    podcast: null,
    youtube: null,
    github: null,
    other: [],
  };

  for (const result of results) {
    const url = result.url?.toLowerCase() || '';
    const title = result.title?.toLowerCase() || '';
    let matched = false;

    for (const [category, keywords] of Object.entries(CONTENT_KEYWORDS)) {
      if (category === 'linkedin') continue; // Skip LinkedIn
      
      if (keywords.some(kw => url.includes(kw) || title.includes(kw))) {
        if (!categorized[category]) {
          categorized[category] = {
            url: result.url,
            title: result.title,
            snippet: result.content || result.snippet,
          };
          matched = true;
          break;
        }
      }
    }

    if (!matched && !url.includes('linkedin.com')) {
      categorized.other.push({
        url: result.url,
        title: result.title,
        snippet: result.content || result.snippet,
      });
    }
  }

  return categorized;
}

/**
 * Format research data for display in Slack
 */
function formatResearchForSlack(researchSummary) {
  if (!researchSummary) return 'No research data available.';

  let formatted = '';

  // Profile info
  if (researchSummary.profile) {
    const p = researchSummary.profile;
    formatted += `*${p.name || 'Unknown'}*`;
    if (p.headline) formatted += ` — ${p.headline}`;
    formatted += '\n';
    if (p.currentCompany) formatted += `🏢 ${p.currentCompany}`;
    if (p.location) formatted += ` 📍 ${p.location}`;
    formatted += '\n\n';
  }

  // Highlights
  if (researchSummary.highlights?.length > 0) {
    formatted += '*Recent Highlights:*\n';
    for (const h of researchSummary.highlights.slice(0, 3)) {
      if (h.content) {
        formatted += `• ${h.content.substring(0, 200)}...\n`;
      }
    }
    formatted += '\n';
  }

  // Social links
  if (researchSummary.socialLinks && Object.keys(researchSummary.socialLinks).length > 0) {
    formatted += '*Social Presence:*\n';
    const links = researchSummary.socialLinks;
    if (links.twitter) formatted += `• <${links.twitter}|Twitter/X>\n`;
    if (links.substack) formatted += `• <${links.substack}|Substack>\n`;
    if (links.github) formatted += `• <${links.github}|GitHub>\n`;
    if (links.podcast) formatted += `• <${links.podcast}|Podcast>\n`;
  }

  return formatted || 'Research in progress...';
}

module.exports = {
  getPersonResearchQuery,
  getFirmResearchQuery,
  getSocialProfileQuery,
  CONTENT_KEYWORDS,
  categorizeSearchResults,
  formatResearchForSlack,
};

