/**
 * Web Crawler Service
 * 
 * Crawls citation URLs from Perplexity to extract additional facts
 * and content about people and companies.
 * 
 * Special handling for Twitter/X URLs - uses API instead of scraping.
 */

const { logger } = require('../../utils/logger');
const config = require('../../config');

// Domain trust scores for quality weighting
const DOMAIN_TRUST_SCORES = {
  // High trust (0.9+)
  'techcrunch.com': 0.95,
  'forbes.com': 0.92,
  'bloomberg.com': 0.95,
  'wsj.com': 0.95,
  'nytimes.com': 0.95,
  'crunchbase.com': 0.90,
  'pitchbook.com': 0.92,
  'reuters.com': 0.95,
  'ft.com': 0.95,
  
  // Medium-high trust (0.75-0.89)
  'linkedin.com': 0.85,
  'businessinsider.com': 0.80,
  'venturebeat.com': 0.82,
  'axios.com': 0.85,
  'fortune.com': 0.85,
  'inc.com': 0.78,
  'entrepreneur.com': 0.75,
  'medium.com': 0.70,
  'substack.com': 0.75,
  
  // Wikipedia (high for facts)
  'wikipedia.org': 0.88,
  'en.wikipedia.org': 0.88,
  
  // Company blogs (medium trust)
  'a]6z.com': 0.85,
  'sequoiacap.com': 0.85,
  'ycombinator.com': 0.85,
  
  // Default
  'default': 0.50,
};

// Blocked domains (don't crawl - no useful text content)
const BLOCKED_DOMAINS = [
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com', // Can't extract text
  'glassdoor.com',
];

// Special handling domains (use APIs instead of crawling)
const API_HANDLED_DOMAINS = [
  'twitter.com',
  'x.com',
  'reddit.com',  // Reddit API handles posts/comments
  'quora.com',   // Could add Quora API later
];

/**
 * Get trust score for a domain
 */
function getDomainTrustScore(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    
    // Check exact match
    if (DOMAIN_TRUST_SCORES[domain]) {
      return DOMAIN_TRUST_SCORES[domain];
    }
    
    // Check parent domain
    const parts = domain.split('.');
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join('.');
      if (DOMAIN_TRUST_SCORES[parentDomain]) {
        return DOMAIN_TRUST_SCORES[parentDomain];
      }
    }
    
    return DOMAIN_TRUST_SCORES['default'];
  } catch {
    return DOMAIN_TRUST_SCORES['default'];
  }
}

/**
 * Check if domain should be crawled
 */
function shouldCrawl(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    
    // Block certain domains entirely
    if (BLOCKED_DOMAINS.some(blocked => domain.includes(blocked))) {
      return false;
    }
    
    // Allow API-handled domains (we'll use APIs instead of crawling)
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if URL is a Twitter/X post that should use API
 */
function isTwitterUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    return (domain.includes('twitter.com') || domain.includes('x.com')) && 
           urlObj.pathname.includes('/status/');
  } catch {
    return false;
  }
}

/**
 * Extract tweet ID from Twitter URL
 */
function extractTweetId(url) {
  try {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is a Reddit post that should use API
 */
function isRedditUrl(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    return domain.includes('reddit.com') && urlObj.pathname.includes('/comments/');
  } catch {
    return false;
  }
}

/**
 * Parse Reddit URL to extract subreddit and post ID
 */
function parseRedditUrl(url) {
  try {
    // URL format: /r/subreddit/comments/postid/title
    const match = url.match(/\/r\/([^\/]+)\/comments\/([^\/]+)/);
    if (match) {
      return {
        subreddit: match[1],
        postId: match[2],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

/**
 * Fetch tweet via API
 */
async function fetchTweetViaApi(tweetId) {
  if (!config.twitter.bearerToken) {
    return {
      success: false,
      error: 'Twitter API not configured',
      error_type: 'AUTH_MISSING',
    };
  }
  
  try {
    const response = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=created_at,public_metrics,author_id,text&expansions=author_id&user.fields=username,name`,
      {
        headers: {
          'Authorization': `Bearer ${config.twitter.bearerToken}`,
        },
      }
    );
    
    if (!response.ok) {
      return {
        success: false,
        error: `Twitter API error: ${response.status}`,
        error_type: 'API_ERROR',
      };
    }
    
    const data = await response.json();
    const tweet = data.data;
    const author = data.includes?.users?.[0];
    
    return {
      success: true,
      data: {
        tweetId,
        text: tweet.text,
        author: author ? `@${author.username} (${author.name})` : 'Unknown',
        createdAt: tweet.created_at,
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      error_type: 'FETCH_ERROR',
    };
  }
}

/**
 * Fetch Reddit post via API (requires reddit service)
 */
async function fetchRedditPostViaApi(subreddit, postId) {
  if (!config.reddit.clientId) {
    return {
      success: false,
      error: 'Reddit API not configured',
      error_type: 'AUTH_MISSING',
    };
  }
  
  try {
    // Load reddit service dynamically to avoid circular dependency
    const redditService = require('./reddit');
    const result = await redditService.getPost(postId, subreddit);
    
    if (!result.success) {
      return result;
    }
    
    const post = result.data.post;
    return {
      success: true,
      data: {
        postId,
        title: post.title,
        text: post.text,
        author: `u/${post.author}`,
        subreddit: post.subreddit,
        score: post.score,
        numComments: post.numComments,
        createdAt: post.createdAt,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      error_type: 'FETCH_ERROR',
    };
  }
}

/**
 * Crawl a URL and extract content
 * Uses fetch + basic HTML parsing (no external dependencies)
 * Special handling for Twitter URLs - uses API
 */
async function crawlUrl(url, options = {}) {
  console.log('=== CRAWLING URL ===');
  console.log('URL:', url);
  
  // Special handling for Twitter/X URLs
  if (isTwitterUrl(url)) {
    console.log('Twitter URL detected, using API');
    const tweetId = extractTweetId(url);
    
    if (!tweetId) {
      return {
        success: false,
        error: 'Could not extract tweet ID from URL',
        error_type: 'INVALID_URL',
      };
    }
    
    const tweetData = await fetchTweetViaApi(tweetId);
    
    if (!tweetData.success) {
      return tweetData;
    }
    
    // Format as crawl result
    return {
      success: true,
      url,
      domain: extractDomain(url),
      trustScore: 0.7, // Twitter is moderately trustworthy
      httpStatus: 200,
      contentType: 'twitter/tweet',
      title: `Tweet by ${tweetData.data.author}`,
      author: tweetData.data.author,
      publishedDate: tweetData.data.createdAt,
      fullText: tweetData.data.text,
      summary: tweetData.data.text.substring(0, 200),
      extractedFacts: [{
        type: 'social_post',
        value: tweetData.data.text,
        confidence: 0.7,
        context: `Tweet with ${tweetData.data.likes} likes, ${tweetData.data.retweets} retweets`,
      }],
      mentionedPeople: [],
      mentionedCompanies: [],
      crawledAt: new Date().toISOString(),
    };
  }
  
  // Special handling for Reddit URLs
  if (isRedditUrl(url)) {
    console.log('Reddit URL detected, using API');
    const parsed = parseRedditUrl(url);
    
    if (!parsed) {
      return {
        success: false,
        error: 'Could not parse Reddit URL',
        error_type: 'INVALID_URL',
      };
    }
    
    const redditData = await fetchRedditPostViaApi(parsed.subreddit, parsed.postId);
    
    if (!redditData.success) {
      return redditData;
    }
    
    // Format as crawl result
    const post = redditData.data;
    const fullText = `${post.title}\n\n${post.text || ''}`;
    
    return {
      success: true,
      url,
      domain: extractDomain(url),
      trustScore: 0.65, // Reddit is moderately trustworthy
      httpStatus: 200,
      contentType: 'reddit/post',
      title: post.title,
      author: post.author,
      publishedDate: post.createdAt,
      fullText,
      summary: post.title,
      extractedFacts: [{
        type: 'social_post',
        value: fullText,
        confidence: 0.65,
        context: `Reddit post with ${post.score} upvotes, ${post.numComments} comments in r/${post.subreddit}`,
      }],
      mentionedPeople: [],
      mentionedCompanies: [],
      crawledAt: new Date().toISOString(),
    };
  }
  
  if (!shouldCrawl(url)) {
    console.log('Domain blocked, skipping');
    return {
      success: false,
      error: 'Domain is blocked from crawling',
      error_type: 'BLOCKED_DOMAIN',
    };
  }
  
  const domain = extractDomain(url);
  const trustScore = getDomainTrustScore(url);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PartnerBot/1.0; Research)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        error_type: 'HTTP_ERROR',
        httpStatus: response.status,
      };
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        success: false,
        error: 'Not HTML content',
        error_type: 'INVALID_CONTENT_TYPE',
        contentType,
      };
    }
    
    const html = await response.text();
    
    // Extract content from HTML
    const extracted = extractContentFromHtml(html, url);
    
    return {
      success: true,
      url,
      domain,
      trustScore,
      httpStatus: response.status,
      contentType,
      ...extracted,
      crawledAt: new Date().toISOString(),
    };
    
  } catch (error) {
    console.error('Crawl error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: error.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_ERROR',
      url,
      domain,
    };
  }
}

/**
 * Extract content from HTML without external dependencies
 * Basic but effective extraction
 */
function extractContentFromHtml(html, url) {
  const result = {
    title: null,
    author: null,
    publishedDate: null,
    fullText: null,
    summary: null,
  };
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    result.title = decodeHtmlEntities(titleMatch[1]).trim();
  }
  
  // Try to extract article title from meta or h1
  const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
  if (ogTitleMatch) {
    result.title = decodeHtmlEntities(ogTitleMatch[1]).trim();
  }
  
  // Extract author
  const authorPatterns = [
    /<meta[^>]*name="author"[^>]*content="([^"]+)"/i,
    /<meta[^>]*property="article:author"[^>]*content="([^"]+)"/i,
    /<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)</i,
    /by\s+<[^>]*>([^<]+)</i,
  ];
  
  for (const pattern of authorPatterns) {
    const match = html.match(pattern);
    if (match) {
      result.author = decodeHtmlEntities(match[1]).trim();
      break;
    }
  }
  
  // Extract published date
  const datePatterns = [
    /<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i,
    /<time[^>]*datetime="([^"]+)"/i,
    /<meta[^>]*name="date"[^>]*content="([^"]+)"/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        result.publishedDate = new Date(match[1]).toISOString();
      } catch {
        // Invalid date, skip
      }
      break;
    }
  }
  
  // Extract main content
  // Remove script, style, nav, footer, header, aside tags
  let cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  
  // Try to find article body
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];
  
  let articleContent = null;
  for (const pattern of articlePatterns) {
    const match = cleanHtml.match(pattern);
    if (match && match[1].length > 500) {
      articleContent = match[1];
      break;
    }
  }
  
  // If no article found, use body
  if (!articleContent) {
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    articleContent = bodyMatch ? bodyMatch[1] : cleanHtml;
  }
  
  // Extract text from HTML
  let text = articleContent
    .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim();
  
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  
  // Limit text length
  result.fullText = text.substring(0, 10000);
  
  // Generate summary (first 500 chars that look like sentences)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  let summary = '';
  for (const sentence of sentences) {
    if (summary.length + sentence.length > 500) break;
    summary += sentence;
  }
  result.summary = summary.trim() || text.substring(0, 500);
  
  return result;
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
  };
  
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  
  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
  decoded = decoded.replace(/&#x([a-fA-F0-9]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  
  return decoded;
}

/**
 * Extract facts from crawled content using pattern matching
 */
function extractFactsFromContent(content, personName, firmName) {
  const facts = [];
  const text = content.fullText || '';
  const textLower = text.toLowerCase();
  const personLower = personName?.toLowerCase() || '';
  const firmLower = firmName?.toLowerCase() || '';
  
  // Only extract if the content mentions our person/firm
  const mentionsPerson = personLower && textLower.includes(personLower);
  const mentionsFirm = firmLower && textLower.includes(firmLower);
  
  if (!mentionsPerson && !mentionsFirm) {
    return facts;
  }
  
  // Extract funding mentions
  const fundingPatterns = [
    /\$(\d+(?:\.\d+)?)\s*(million|billion|m|b|M|B)\s+(seed|series\s*[a-z]|funding|round|investment)/gi,
    /(raised|secured|closed)\s+\$(\d+(?:\.\d+)?)\s*(million|billion|m|b|M|B)/gi,
  ];
  
  for (const pattern of fundingPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      facts.push({
        type: 'funding',
        value: match[0],
        confidence: 0.7,
        context: extractSurroundingContext(text, match.index),
      });
    }
  }
  
  // Extract investment mentions
  const investmentPatterns = [
    /(invested|led|participated)\s+in\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/g,
    /portfolio\s+company\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/gi,
  ];
  
  for (const pattern of investmentPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      facts.push({
        type: 'investment',
        value: match[0],
        confidence: 0.6,
        context: extractSurroundingContext(text, match.index),
      });
    }
  }
  
  // Extract role/position mentions
  if (mentionsPerson) {
    const rolePatterns = [
      new RegExp(`${personName}[^.]*?(CEO|CTO|CFO|Partner|Managing Director|Principal|Founder|Co-founder|General Partner|Managing Partner)`, 'gi'),
      new RegExp(`(CEO|CTO|CFO|Partner|Managing Director|Principal|Founder|Co-founder|General Partner|Managing Partner)[^.]*?${personName}`, 'gi'),
    ];
    
    for (const pattern of rolePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        facts.push({
          type: 'position',
          value: match[0],
          confidence: 0.75,
          context: extractSurroundingContext(text, match.index),
        });
      }
    }
  }
  
  // Extract award/recognition mentions
  const awardPatterns = [
    /(named|awarded|recognized|listed|ranked)[^.]*?(top\s+\d+|best|forbes|fortune|inc\.|midas list)/gi,
  ];
  
  for (const pattern of awardPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      facts.push({
        type: 'award',
        value: match[0],
        confidence: 0.7,
        context: extractSurroundingContext(text, match.index),
      });
    }
  }
  
  return facts.slice(0, 20); // Limit to 20 facts per article
}

/**
 * Extract surrounding context for a match
 */
function extractSurroundingContext(text, index, contextLength = 150) {
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + contextLength);
  return text.substring(start, end).trim();
}

/**
 * Extract mentioned people and companies from text
 */
function extractMentions(text) {
  const people = new Set();
  const companies = new Set();
  
  // Basic name pattern (capitalized words)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;
  
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];
    // Basic heuristic: if it's 2-3 words and not a common phrase, might be a name
    const words = name.split(' ');
    if (words.length >= 2 && words.length <= 3) {
      // Check if it looks like a person name (not all caps, reasonable length)
      if (name.length < 30 && !name.match(/^[A-Z ]+$/)) {
        people.add(name);
      }
    }
  }
  
  // Company patterns
  const companyPatterns = [
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+(Inc\.|Corp\.|LLC|LP|Ltd\.?|Capital|Ventures|Partners)/g,
  ];
  
  for (const pattern of companyPatterns) {
    while ((match = pattern.exec(text)) !== null) {
      companies.add(match[0]);
    }
  }
  
  return {
    people: Array.from(people).slice(0, 20),
    companies: Array.from(companies).slice(0, 20),
  };
}

/**
 * Crawl multiple URLs in parallel with rate limiting
 */
async function crawlUrls(urls, options = {}) {
  const { maxConcurrent = 3, delayMs = 500, personName, firmName } = options;
  
  console.log(`=== BATCH CRAWL: ${urls.length} URLs ===`);
  
  const results = [];
  const validUrls = urls.filter(url => shouldCrawl(url));
  
  console.log(`Valid URLs to crawl: ${validUrls.length}`);
  
  // Process in batches
  for (let i = 0; i < validUrls.length; i += maxConcurrent) {
    const batch = validUrls.slice(i, i + maxConcurrent);
    
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const result = await crawlUrl(url);
        
        if (result.success) {
          // Extract facts and mentions
          result.extractedFacts = extractFactsFromContent(result, personName, firmName);
          const mentions = extractMentions(result.fullText || '');
          result.mentionedPeople = mentions.people;
          result.mentionedCompanies = mentions.companies;
        }
        
        return result;
      })
    );
    
    results.push(...batchResults);
    
    // Rate limit delay
    if (i + maxConcurrent < validUrls.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  const successful = results.filter(r => r.success);
  console.log(`Crawl complete: ${successful.length}/${results.length} successful`);
  
  return results;
}

/**
 * Extract citation URLs from Perplexity response
 */
function extractCitationsFromPerplexity(perplexityResult) {
  const urls = [];
  
  if (!perplexityResult?.success) return urls;
  
  // Citations are usually in the data.citations array
  if (perplexityResult.data?.citations) {
    urls.push(...perplexityResult.data.citations);
  }
  
  // Also check rawContent for URLs
  const rawContent = perplexityResult.data?.rawContent || '';
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  const contentUrls = rawContent.match(urlPattern) || [];
  urls.push(...contentUrls);
  
  // Deduplicate
  return [...new Set(urls)];
}

module.exports = {
  crawlUrl,
  crawlUrls,
  extractCitationsFromPerplexity,
  extractFactsFromContent,
  extractMentions,
  getDomainTrustScore,
  shouldCrawl,
  isTwitterUrl,
  extractTweetId,
  fetchTweetViaApi,
  isRedditUrl,
  parseRedditUrl,
  fetchRedditPostViaApi,
  DOMAIN_TRUST_SCORES,
};

