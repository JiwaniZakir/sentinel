/**
 * Tavily Search API Service
 * 
 * Uses Tavily for structured web searches to find social profiles
 * and additional information about partners.
 */

const { logger } = require('../../utils/logger');

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * Make a search request to the Tavily API
 */
async function tavilySearch(query, options = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    return {
      success: false,
      error: 'TAVILY_API_KEY not configured',
      error_type: 'AUTH_MISSING',
    };
  }
  
  try {
    const requestBody = {
      api_key: apiKey,
      query,
      search_depth: options.searchDepth || 'basic',
      include_domains: options.includeDomains || [],
      exclude_domains: options.excludeDomains || [],
      max_results: options.maxResults || 10,
      include_answer: options.includeAnswer === 'advanced' ? 'advanced' : (options.includeAnswer !== false),
      include_raw_content: options.includeRawContent || false,
    };
    
    console.log('Tavily request:', JSON.stringify({ ...requestBody, api_key: '***' }, null, 2));
    
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      answer: data.answer,
      results: data.results || [],
      query: data.query,
    };
    
  } catch (error) {
    console.error('Tavily API error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: 'API_ERROR',
    };
  }
}

/**
 * Find social media profiles for a person
 */
async function findSocialProfiles(name, firm) {
  console.log('=== TAVILY SOCIAL PROFILE SEARCH ===');
  console.log('Name:', name, 'Firm:', firm);
  
  const query = `${name} ${firm} Twitter OR X OR Substack OR blog OR podcast OR GitHub`;
  
  const result = await tavilySearch(query, {
    searchDepth: 'basic',
    maxResults: 15,
    includeDomains: [
      'twitter.com',
      'x.com',
      'substack.com',
      'medium.com',
      'github.com',
      'youtube.com',
      'anchor.fm',
      'spotify.com',
      'linkedin.com',
    ],
  });
  
  if (!result.success) {
    return result;
  }
  
  // Extract and categorize social profiles
  const profiles = {
    twitter: null,
    substack: null,
    medium: null,
    github: null,
    youtube: null,
    podcast: null,
    blog: null,
    other: [],
  };
  
  for (const item of result.results) {
    const url = item.url?.toLowerCase() || '';
    const title = item.title?.toLowerCase() || '';
    
    if ((url.includes('twitter.com') || url.includes('x.com')) && !profiles.twitter) {
      profiles.twitter = {
        url: item.url,
        title: item.title,
        snippet: item.content,
      };
    } else if (url.includes('substack.com') && !profiles.substack) {
      profiles.substack = {
        url: item.url,
        title: item.title,
        snippet: item.content,
      };
    } else if (url.includes('medium.com') && !profiles.medium) {
      profiles.medium = {
        url: item.url,
        title: item.title,
        snippet: item.content,
      };
    } else if (url.includes('github.com') && !profiles.github) {
      profiles.github = {
        url: item.url,
        title: item.title,
        snippet: item.content,
      };
    } else if (url.includes('youtube.com') && !profiles.youtube) {
      profiles.youtube = {
        url: item.url,
        title: item.title,
        snippet: item.content,
      };
    } else if ((url.includes('anchor.fm') || url.includes('spotify.com/show') || title.includes('podcast')) && !profiles.podcast) {
      profiles.podcast = {
        url: item.url,
        title: item.title,
        snippet: item.content,
      };
    } else if (!url.includes('linkedin.com')) {
      // Check if it might be a personal blog
      if (title.includes('blog') || url.includes('blog') || item.content?.includes('blog')) {
        if (!profiles.blog) {
          profiles.blog = {
            url: item.url,
            title: item.title,
            snippet: item.content,
          };
        }
      } else {
        profiles.other.push({
          url: item.url,
          title: item.title,
          snippet: item.content,
        });
      }
    }
  }
  
  return {
    success: true,
    source: 'tavily',
    researchType: 'SOCIAL_PRESENCE',
    query: query,
    data: {
      profiles,
      rawResults: result.results,
      answer: result.answer,
    },
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Search LinkedIn profile using Tavily (no login required!)
 * This is a fallback when direct LinkedIn scraping fails.
 */
async function searchLinkedInProfile(name, firm, linkedinUrl = null) {
  console.log('=== TAVILY LINKEDIN PROFILE SEARCH ===');
  console.log('Name:', name, 'Firm:', firm, 'URL:', linkedinUrl);
  
  // Build query - if we have the URL, search for that specific profile
  let query;
  if (linkedinUrl) {
    // Extract username from URL for more specific search
    const usernameMatch = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/i);
    const username = usernameMatch ? usernameMatch[1] : null;
    query = username 
      ? `site:linkedin.com/in "${username}" professional profile experience`
      : `site:linkedin.com/in "${name}" "${firm}" professional profile`;
  } else {
    query = `site:linkedin.com/in "${name}" "${firm}" professional profile experience education`;
  }
  
  console.log('Query:', query);
  
  const result = await tavilySearch(query, {
    searchDepth: 'advanced',           // Required for LinkedIn
    maxResults: 5,
    includeAnswer: 'advanced',         // LLM-generated answer
    includeRawContent: true,           // Get full profile content
    includeDomains: ['linkedin.com/in'],
  });
  
  if (!result.success) {
    return result;
  }
  
  // Parse the results to extract profile data
  const profileData = parseLinkedInResults(result, name, firm);
  
  return {
    success: true,
    source: 'tavily_linkedin',
    researchType: 'LINKEDIN',
    query: query,
    data: {
      ...profileData,
      answer: result.answer,
      rawResults: result.results,
    },
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Parse LinkedIn search results into structured profile data
 */
function parseLinkedInResults(tavilyResult, targetName, targetFirm) {
  const profile = {
    name: null,
    headline: null,
    location: null,
    about: null,
    currentCompany: targetFirm,
    experiences: [],
    education: [],
    skills: [],
    linkedinUrl: null,
  };
  
  if (!tavilyResult.results || tavilyResult.results.length === 0) {
    return profile;
  }
  
  // Find the best matching result
  let bestMatch = null;
  for (const result of tavilyResult.results) {
    const url = result.url?.toLowerCase() || '';
    const title = result.title?.toLowerCase() || '';
    const content = result.content?.toLowerCase() || '';
    const rawContent = result.raw_content || '';
    
    // Check if this is a LinkedIn profile URL
    if (url.includes('linkedin.com/in/')) {
      // Score based on name/firm match
      const nameInTitle = title.includes(targetName.toLowerCase());
      const firmInContent = content.includes(targetFirm.toLowerCase()) || title.includes(targetFirm.toLowerCase());
      
      if (nameInTitle || firmInContent) {
        bestMatch = result;
        break;
      }
      
      if (!bestMatch) {
        bestMatch = result;
      }
    }
  }
  
  if (bestMatch) {
    profile.linkedinUrl = bestMatch.url;
    
    // Extract name from title (usually "FirstName LastName - Title | LinkedIn")
    const titleParts = bestMatch.title?.split(' - ');
    if (titleParts && titleParts.length > 0) {
      profile.name = titleParts[0].trim();
      if (titleParts.length > 1) {
        profile.headline = titleParts[1].replace(' | LinkedIn', '').trim();
      }
    }
    
    // Parse raw content if available
    if (bestMatch.raw_content) {
      const rawData = parseRawLinkedInContent(bestMatch.raw_content);
      profile.location = rawData.location || profile.location;
      profile.about = rawData.about || profile.about;
      profile.experiences = rawData.experiences || profile.experiences;
      profile.education = rawData.education || profile.education;
      profile.skills = rawData.skills || profile.skills;
    }
    
    // Use snippet as about if no raw content
    if (!profile.about && bestMatch.content) {
      profile.about = bestMatch.content;
    }
  }
  
  return profile;
}

/**
 * Parse raw LinkedIn content into structured data
 * (Based on Tavily's LinkedIn parsing approach)
 */
function parseRawLinkedInContent(rawContent) {
  const data = {
    location: null,
    about: null,
    experiences: [],
    education: [],
    skills: [],
  };
  
  if (!rawContent || typeof rawContent !== 'string') {
    return data;
  }
  
  // Extract location (usually appears before "connections")
  const locationMatch = rawContent.match(/\n([^\n]+)\n\d+[\+]?\s*(?:connections|followers)/i);
  if (locationMatch) {
    data.location = locationMatch[1].trim();
  }
  
  // Extract About section
  const aboutMatch = rawContent.match(/About\n([\s\S]*?)(?=\nExperience|\nActivity|\n\n)/i);
  if (aboutMatch) {
    data.about = aboutMatch[1].trim().substring(0, 1000); // Limit length
  }
  
  // Extract Experience section
  const experienceMatch = rawContent.match(/Experience[:\n]([\s\S]*?)(?=\nEducation|\nSkills|\nLicenses|\n\n\n)/i);
  if (experienceMatch) {
    const expText = experienceMatch[1];
    // Simple extraction - look for company patterns
    const expLines = expText.split('\n').filter(l => l.trim());
    let currentExp = null;
    
    for (const line of expLines) {
      // Skip common noise
      if (line.includes('Show all') || line.includes('Full-time') || line.includes('Part-time')) continue;
      
      // Check if this looks like a job title or company
      if (line.length > 5 && line.length < 100 && !line.includes('http')) {
        if (currentExp && !currentExp.title) {
          currentExp.title = line.trim();
        } else if (currentExp && !currentExp.company) {
          currentExp.company = line.trim();
          data.experiences.push(currentExp);
          currentExp = null;
        } else {
          currentExp = { title: line.trim(), company: null };
        }
      }
    }
    
    // Limit to first 5 experiences
    data.experiences = data.experiences.slice(0, 5);
  }
  
  // Extract Education section
  const educationMatch = rawContent.match(/Education[:\n]([\s\S]*?)(?=\nSkills|\nLicenses|\nInterests|\n\n\n)/i);
  if (educationMatch) {
    const eduText = educationMatch[1];
    const eduLines = eduText.split('\n').filter(l => l.trim() && l.length > 3 && l.length < 150);
    
    // Simple extraction - schools are usually the first substantive lines
    for (const line of eduLines.slice(0, 6)) {
      if (!line.includes('Show') && !line.includes('http')) {
        data.education.push({ school: line.trim() });
      }
    }
  }
  
  // Extract Skills section
  const skillsMatch = rawContent.match(/Skills[:\n]([\s\S]*?)(?=\nInterests|\nRecommendations|\n\n\n)/i);
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    const skillLines = skillsText.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 2 && l.length < 50 && !l.includes('Show') && !l.includes('endorsed'));
    data.skills = skillLines.slice(0, 10);
  }
  
  return data;
}

/**
 * Search for additional company information
 */
async function searchCompanyInfo(companyName) {
  console.log('=== TAVILY COMPANY SEARCH ===');
  console.log('Company:', companyName);
  
  const query = `${companyName} company funding investors portfolio news`;
  
  const result = await tavilySearch(query, {
    searchDepth: 'advanced',
    maxResults: 10,
    excludeDomains: ['linkedin.com'],
  });
  
  if (!result.success) {
    return result;
  }
  
  return {
    success: true,
    source: 'tavily',
    researchType: 'FIRM_INFO',
    query: query,
    data: {
      answer: result.answer,
      results: result.results.map(r => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
        score: r.score,
      })),
    },
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Generate a text summary from social profiles for AI context
 */
function generateSocialSummary(socialData) {
  if (!socialData?.success || !socialData.data?.profiles) {
    return null;
  }
  
  const { profiles } = socialData.data;
  let summary = '### Social Presence:\n';
  let hasProfiles = false;
  
  if (profiles.twitter) {
    summary += `- **Twitter/X**: ${profiles.twitter.url}\n`;
    hasProfiles = true;
  }
  
  if (profiles.substack) {
    summary += `- **Substack**: ${profiles.substack.url} - ${profiles.substack.title}\n`;
    hasProfiles = true;
  }
  
  if (profiles.medium) {
    summary += `- **Medium**: ${profiles.medium.url}\n`;
    hasProfiles = true;
  }
  
  if (profiles.github) {
    summary += `- **GitHub**: ${profiles.github.url}\n`;
    hasProfiles = true;
  }
  
  if (profiles.youtube) {
    summary += `- **YouTube**: ${profiles.youtube.url}\n`;
    hasProfiles = true;
  }
  
  if (profiles.podcast) {
    summary += `- **Podcast**: ${profiles.podcast.url} - ${profiles.podcast.title}\n`;
    hasProfiles = true;
  }
  
  if (profiles.blog) {
    summary += `- **Blog**: ${profiles.blog.url}\n`;
    hasProfiles = true;
  }
  
  return hasProfiles ? summary : null;
}

module.exports = {
  tavilySearch,
  findSocialProfiles,
  searchLinkedInProfile,
  searchCompanyInfo,
  generateSocialSummary,
  parseLinkedInResults,
};

