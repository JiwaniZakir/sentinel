/**
 * Research Aggregator
 * 
 * Combines research from multiple sources into a unified profile.
 * Generates AI-ready context and human-readable summaries.
 */

const linkedinService = require('./linkedin');
const perplexityService = require('./perplexity');
const tavilyService = require('./tavily');

/**
 * Generate a comprehensive AI context from all research data
 * This is used to provide context to the AI during onboarding conversations
 * 
 * @param {Object} researchSummary - The aggregated research summary
 * @returns {string} - Formatted context for AI
 */
function generateAIContext(researchSummary) {
  if (!researchSummary) return '';
  
  let context = `
## BACKGROUND RESEARCH ON THIS PARTNER

This information was gathered from LinkedIn, web research, and social profiles. Use it to ask informed questions and create a highly personalized introduction.

`;

  // Profile basics
  if (researchSummary.profile) {
    const p = researchSummary.profile;
    context += `### Basic Info:\n`;
    if (p.name) context += `- **Name**: ${p.name}\n`;
    if (p.headline) context += `- **Headline**: ${p.headline}\n`;
    if (p.currentCompany) context += `- **Current Company**: ${p.currentCompany}\n`;
    if (p.currentTitle) context += `- **Current Title**: ${p.currentTitle}\n`;
    if (p.location) context += `- **Location**: ${p.location}\n`;
    context += '\n';
  }

  // About section
  if (researchSummary.profile?.about) {
    context += `### About (from LinkedIn):\n${researchSummary.profile.about}\n\n`;
  }

  // Work experience
  if (researchSummary.experiences && researchSummary.experiences.length > 0) {
    context += `### Career History:\n`;
    researchSummary.experiences.slice(0, 5).forEach(exp => {
      context += `- **${exp.title}** at ${exp.company}`;
      if (exp.duration) context += ` (${exp.duration})`;
      context += '\n';
      if (exp.description) {
        const shortDesc = exp.description.length > 200 
          ? exp.description.substring(0, 200) + '...' 
          : exp.description;
        context += `  ${shortDesc}\n`;
      }
    });
    context += '\n';
  }

  // Education
  if (researchSummary.educations && researchSummary.educations.length > 0) {
    context += `### Education:\n`;
    researchSummary.educations.forEach(edu => {
      context += `- ${edu.degree || ''} ${edu.field || ''} at ${edu.school}\n`;
    });
    context += '\n';
  }

  // Highlights from news/research
  if (researchSummary.highlights && researchSummary.highlights.length > 0) {
    context += `### Recent Highlights & News:\n`;
    researchSummary.highlights.forEach(highlight => {
      if (highlight.content) {
        context += `**${highlight.type.toUpperCase()}**:\n${highlight.content}\n\n`;
      }
    });
  }

  // Firm information
  if (researchSummary.firmInfo && Object.keys(researchSummary.firmInfo).some(k => researchSummary.firmInfo[k])) {
    context += `### About Their Firm:\n`;
    if (researchSummary.firmInfo.overview) {
      context += `${researchSummary.firmInfo.overview}\n\n`;
    }
    if (researchSummary.firmInfo.portfolio) {
      context += `**Portfolio/Deals**:\n${researchSummary.firmInfo.portfolio}\n\n`;
    }
  }

  // Social presence
  if (researchSummary.socialLinks && Object.keys(researchSummary.socialLinks).length > 0) {
    context += `### Social Presence:\n`;
    const links = researchSummary.socialLinks;
    if (links.twitter) context += `- Twitter/X: ${links.twitter}\n`;
    if (links.substack) context += `- Substack: ${links.substack}\n`;
    if (links.medium) context += `- Medium: ${links.medium}\n`;
    if (links.github) context += `- GitHub: ${links.github}\n`;
    if (links.youtube) context += `- YouTube: ${links.youtube}\n`;
    if (links.podcast) context += `- Podcast: ${links.podcast}\n`;
    if (links.blog) context += `- Blog: ${links.blog}\n`;
    context += '\n';
  }

  context += `
### How to Use This Research:
1. Reference specific achievements, companies, or projects they've been involved with
2. Ask about their journey based on their career history
3. Mention their content if they have a podcast/blog/newsletter
4. Connect their background to what they might be looking for in our community
5. Use this to craft a truly personalized introduction that highlights what makes them unique

`;

  return context;
}

/**
 * Generate a human-readable summary card for display
 */
function generateSummaryCard(researchSummary) {
  if (!researchSummary) return null;
  
  const card = {
    name: researchSummary.profile?.name,
    headline: researchSummary.profile?.headline,
    company: researchSummary.profile?.currentCompany,
    location: researchSummary.profile?.location,
    about: researchSummary.profile?.about?.substring(0, 300),
    experienceCount: researchSummary.experiences?.length || 0,
    topExperiences: (researchSummary.experiences || []).slice(0, 3).map(e => ({
      title: e.title,
      company: e.company,
      duration: e.duration,
    })),
    education: (researchSummary.educations || []).slice(0, 2).map(e => ({
      school: e.school,
      degree: e.degree,
    })),
    socialLinks: researchSummary.socialLinks || {},
    highlightCount: researchSummary.highlights?.length || 0,
    sources: researchSummary.sources || [],
    generatedAt: researchSummary.generatedAt,
  };
  
  return card;
}

/**
 * Generate key talking points for the partner
 */
function generateTalkingPoints(researchSummary) {
  const points = [];
  
  if (!researchSummary) return points;
  
  // Career trajectory
  if (researchSummary.experiences && researchSummary.experiences.length > 1) {
    const latest = researchSummary.experiences[0];
    const earliest = researchSummary.experiences[researchSummary.experiences.length - 1];
    
    if (latest && earliest && latest.company !== earliest.company) {
      points.push({
        type: 'career',
        content: `Career journey from ${earliest.company} to ${latest.company}`,
      });
    }
  }
  
  // Education
  if (researchSummary.educations && researchSummary.educations.length > 0) {
    const edu = researchSummary.educations[0];
    if (edu.school) {
      points.push({
        type: 'education',
        content: `Studied at ${edu.school}`,
      });
    }
  }
  
  // Social presence
  const socialLinks = researchSummary.socialLinks || {};
  if (socialLinks.substack || socialLinks.podcast || socialLinks.blog) {
    points.push({
      type: 'content',
      content: 'Active content creator - has a ' + 
        [socialLinks.substack && 'Substack', socialLinks.podcast && 'podcast', socialLinks.blog && 'blog']
          .filter(Boolean).join(', '),
    });
  }
  
  // Firm info
  if (researchSummary.firmInfo?.portfolio) {
    points.push({
      type: 'firm',
      content: 'Firm has notable portfolio/deals',
    });
  }
  
  // Highlights
  if (researchSummary.highlights) {
    researchSummary.highlights.forEach(h => {
      if (h.type === 'deals' || h.type === 'news') {
        points.push({
          type: h.type,
          content: `Recent ${h.type} activity found`,
        });
      }
    });
  }
  
  return points;
}

/**
 * Check if research data is fresh enough
 */
function isResearchFresh(researchSummary, maxAgeDays = 30) {
  if (!researchSummary?.generatedAt) return false;
  
  const generatedAt = new Date(researchSummary.generatedAt);
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  
  return (Date.now() - generatedAt.getTime()) < maxAge;
}

/**
 * Merge new research with existing research
 */
function mergeResearch(existing, newResearch) {
  if (!existing) return newResearch;
  if (!newResearch) return existing;
  
  return {
    ...existing,
    ...newResearch,
    profile: { ...existing.profile, ...newResearch.profile },
    experiences: newResearch.experiences || existing.experiences,
    educations: newResearch.educations || existing.educations,
    highlights: [...(existing.highlights || []), ...(newResearch.highlights || [])],
    socialLinks: { ...existing.socialLinks, ...newResearch.socialLinks },
    firmInfo: { ...existing.firmInfo, ...newResearch.firmInfo },
    sources: [...new Set([...(existing.sources || []), ...(newResearch.sources || [])])],
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateAIContext,
  generateSummaryCard,
  generateTalkingPoints,
  isResearchFresh,
  mergeResearch,
};

