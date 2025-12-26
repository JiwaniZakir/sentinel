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
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: options.searchDepth || 'basic',
        include_domains: options.includeDomains || [],
        exclude_domains: options.excludeDomains || [],
        max_results: options.maxResults || 10,
        include_answer: options.includeAnswer !== false,
        include_raw_content: false,
      }),
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
  searchCompanyInfo,
  generateSocialSummary,
};

