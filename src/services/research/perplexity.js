/**
 * Perplexity API Service
 * 
 * Uses Perplexity AI for deep research on people and firms.
 * Returns structured data with citations.
 */

const { logger } = require('../../utils/logger');

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-sonar-small-128k-online';

/**
 * Make a request to the Perplexity API
 */
async function callPerplexity(messages, options = {}) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  
  if (!apiKey) {
    return {
      success: false,
      error: 'PERPLEXITY_API_KEY not configured',
      error_type: 'AUTH_MISSING',
    };
  }
  
  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || DEFAULT_MODEL,
        messages,
        temperature: options.temperature || 0.2,
        max_tokens: options.maxTokens || 2000,
        return_citations: true,
        return_related_questions: false,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      content: data.choices[0]?.message?.content,
      citations: data.citations || [],
      usage: data.usage,
    };
    
  } catch (error) {
    console.error('Perplexity API error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: 'API_ERROR',
    };
  }
}

/**
 * Research a person - find news, articles, talks, etc.
 */
async function researchPerson(name, firm, role) {
  console.log('=== PERPLEXITY PERSON RESEARCH ===');
  console.log('Name:', name, 'Firm:', firm, 'Role:', role);
  
  const query = `Research ${name}, ${role || 'professional'} at ${firm}. Find:
1. Recent news articles or press mentions (last 2 years)
2. Podcast or interview appearances
3. Notable investments, deals, or projects they've led
4. Published articles, blog posts, or thought leadership
5. Speaking engagements or conference talks
6. Any awards or recognition

Return the information as a structured summary with specific details and dates where available. Include source URLs.`;

  const result = await callPerplexity([
    {
      role: 'system',
      content: 'You are a research assistant. Provide factual, well-sourced information about professionals. Include specific details like dates, company names, and achievements. Format your response clearly with sections.',
    },
    {
      role: 'user',
      content: query,
    },
  ]);
  
  if (!result.success) {
    return result;
  }
  
  // Parse the response into structured data
  return {
    success: true,
    source: 'perplexity',
    researchType: 'PERSON_NEWS',
    query: query,
    data: {
      rawContent: result.content,
      citations: result.citations,
      summary: extractSummary(result.content),
      newsArticles: extractSection(result.content, 'news'),
      podcasts: extractSection(result.content, 'podcast'),
      deals: extractSection(result.content, 'deal', 'investment', 'project'),
      articles: extractSection(result.content, 'article', 'blog', 'publish'),
      speaking: extractSection(result.content, 'speak', 'conference', 'talk'),
      awards: extractSection(result.content, 'award', 'recognition'),
    },
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Research a firm/company - find funding, portfolio, news, etc.
 */
async function researchFirm(firmName, firmType) {
  console.log('=== PERPLEXITY FIRM RESEARCH ===');
  console.log('Firm:', firmName, 'Type:', firmType);
  
  const firmContext = firmType === 'VC' ? 
    'venture capital fund' : 
    firmType === 'CORPORATE' ? 
    'corporation' : 
    'organization';
  
  const vcSpecific = firmType === 'VC' ? `
- Fund size and investment stage focus
- Notable portfolio companies
- Recent investments (last 12 months)
- Limited Partners (LPs) if known` : '';
  
  const query = `Research ${firmName} (${firmContext}). Find:
1. Company overview and founding story
2. Key leadership team members
3. Recent news and press releases (last 6 months)
4. Company size and growth trajectory
${vcSpecific}
5. Any notable achievements or milestones

Return the information as a structured summary with specific details. Include source URLs.`;

  const result = await callPerplexity([
    {
      role: 'system',
      content: 'You are a business research assistant. Provide factual, well-sourced information about companies and organizations. Include specific details like funding amounts, dates, and names. Format your response clearly with sections.',
    },
    {
      role: 'user',
      content: query,
    },
  ]);
  
  if (!result.success) {
    return result;
  }
  
  return {
    success: true,
    source: 'perplexity',
    researchType: 'FIRM_INFO',
    query: query,
    data: {
      rawContent: result.content,
      citations: result.citations,
      overview: extractSection(result.content, 'overview', 'about', 'founded'),
      leadership: extractSection(result.content, 'leader', 'team', 'founder'),
      news: extractSection(result.content, 'news', 'press', 'announce'),
      portfolio: extractSection(result.content, 'portfolio', 'investment', 'fund'),
      achievements: extractSection(result.content, 'achievement', 'milestone', 'award'),
    },
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Extract a summary from the content
 */
function extractSummary(content) {
  if (!content) return null;
  
  // Take the first paragraph or first 500 characters
  const paragraphs = content.split('\n\n');
  const firstPara = paragraphs[0] || '';
  
  return firstPara.length > 500 ? firstPara.substring(0, 500) + '...' : firstPara;
}

/**
 * Extract sections from content based on keywords
 */
function extractSection(content, ...keywords) {
  if (!content) return null;
  
  const lines = content.split('\n');
  const relevantLines = [];
  let inRelevantSection = false;
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Check if this line starts a relevant section
    if (keywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
      inRelevantSection = true;
    }
    
    // Check if we've moved to a new section (starts with #, *, or number)
    if (inRelevantSection && line.match(/^[#*\d]/) && !keywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
      inRelevantSection = false;
    }
    
    if (inRelevantSection && line.trim()) {
      relevantLines.push(line.trim());
    }
  }
  
  return relevantLines.length > 0 ? relevantLines.join('\n') : null;
}

/**
 * Generate a text summary for AI context
 */
function generatePerplexitySummary(personResearch, firmResearch) {
  let summary = '';
  
  if (personResearch?.success && personResearch.data) {
    summary += '### Recent News & Activity:\n';
    if (personResearch.data.newsArticles) {
      summary += personResearch.data.newsArticles + '\n\n';
    }
    if (personResearch.data.deals) {
      summary += '### Notable Deals/Projects:\n' + personResearch.data.deals + '\n\n';
    }
    if (personResearch.data.speaking) {
      summary += '### Speaking/Thought Leadership:\n' + personResearch.data.speaking + '\n\n';
    }
  }
  
  if (firmResearch?.success && firmResearch.data) {
    summary += '### About Their Firm:\n';
    if (firmResearch.data.overview) {
      summary += firmResearch.data.overview + '\n\n';
    }
    if (firmResearch.data.portfolio) {
      summary += '### Portfolio/Investments:\n' + firmResearch.data.portfolio + '\n\n';
    }
  }
  
  return summary || null;
}

module.exports = {
  researchPerson,
  researchFirm,
  generatePerplexitySummary,
  callPerplexity,
};

