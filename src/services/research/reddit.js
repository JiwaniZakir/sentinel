/**
 * Reddit API Service
 * 
 * Fetches Reddit posts and comments to understand someone's interests,
 * expertise, and community involvement.
 */

const config = require('../../config');
const { logger } = require('../../utils/logger');

const REDDIT_API_URL = 'https://oauth.reddit.com';
const REDDIT_AUTH_URL = 'https://www.reddit.com/api/v1/access_token';

let accessToken = null;
let tokenExpiry = null;

/**
 * Get Reddit OAuth access token
 */
async function getAccessToken() {
  // Check if we have a valid token
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  
  console.log('Getting new Reddit access token...');
  
  if (!config.reddit.clientId || !config.reddit.clientSecret) {
    throw new Error('Reddit API credentials not configured');
  }
  
  try {
    const auth = Buffer.from(
      `${config.reddit.clientId}:${config.reddit.clientSecret}`
    ).toString('base64');
    
    const response = await fetch(REDDIT_AUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': config.reddit.userAgent,
      },
      body: 'grant_type=client_credentials',
    });
    
    if (!response.ok) {
      throw new Error(`Reddit auth failed: ${response.status}`);
    }
    
    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early
    
    console.log('Reddit access token obtained');
    return accessToken;
    
  } catch (error) {
    console.error('Reddit auth error:', error.message);
    throw error;
  }
}

/**
 * Fetch a Reddit post by URL or ID
 */
async function getPost(postId, subreddit) {
  const token = await getAccessToken();
  
  try {
    const response = await fetch(
      `${REDDIT_API_URL}/r/${subreddit}/comments/${postId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': config.reddit.userAgent,
        },
      }
    );
    
    if (!response.ok) {
      return {
        success: false,
        error: `Reddit API error: ${response.status}`,
      };
    }
    
    const data = await response.json();
    const post = data[0]?.data?.children[0]?.data;
    const comments = data[1]?.data?.children || [];
    
    if (!post) {
      return {
        success: false,
        error: 'Post not found',
      };
    }
    
    return {
      success: true,
      data: {
        post: {
          id: post.id,
          title: post.title,
          text: post.selftext,
          author: post.author,
          subreddit: post.subreddit,
          url: `https://reddit.com${post.permalink}`,
          score: post.score,
          upvoteRatio: post.upvote_ratio,
          numComments: post.num_comments,
          createdAt: new Date(post.created_utc * 1000).toISOString(),
        },
        comments: comments.slice(0, 10).map(c => ({
          author: c.data.author,
          text: c.data.body,
          score: c.data.score,
          createdAt: new Date(c.data.created_utc * 1000).toISOString(),
        })),
      },
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get user's recent posts and comments
 */
async function getUserActivity(username, limit = 25) {
  console.log('=== REDDIT USER ACTIVITY ===');
  console.log('Username:', username);
  
  const token = await getAccessToken();
  
  try {
    // Get posts
    const postsResponse = await fetch(
      `${REDDIT_API_URL}/user/${username}/submitted?limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': config.reddit.userAgent,
        },
      }
    );
    
    // Get comments
    const commentsResponse = await fetch(
      `${REDDIT_API_URL}/user/${username}/comments?limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': config.reddit.userAgent,
        },
      }
    );
    
    if (!postsResponse.ok || !commentsResponse.ok) {
      return {
        success: false,
        error: 'Failed to fetch user activity',
      };
    }
    
    const postsData = await postsResponse.json();
    const commentsData = await commentsResponse.json();
    
    const posts = (postsData.data?.children || []).map(p => ({
      type: 'post',
      title: p.data.title,
      text: p.data.selftext,
      subreddit: p.data.subreddit,
      score: p.data.score,
      numComments: p.data.num_comments,
      url: `https://reddit.com${p.data.permalink}`,
      createdAt: new Date(p.data.created_utc * 1000).toISOString(),
    }));
    
    const comments = (commentsData.data?.children || []).map(c => ({
      type: 'comment',
      text: c.data.body,
      subreddit: c.data.subreddit,
      score: c.data.score,
      url: `https://reddit.com${c.data.permalink}`,
      createdAt: new Date(c.data.created_utc * 1000).toISOString(),
    }));
    
    console.log(`Found ${posts.length} posts, ${comments.length} comments`);
    
    return {
      success: true,
      data: {
        posts,
        comments,
        totalActivity: posts.length + comments.length,
      },
    };
    
  } catch (error) {
    console.error('Reddit API error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Research a Reddit user's activity and interests
 */
async function researchRedditUser(username) {
  console.log('=== REDDIT USER RESEARCH ===');
  console.log('Username:', username);
  
  if (!config.reddit.clientId) {
    return {
      success: false,
      error: 'Reddit API not configured',
      error_type: 'AUTH_MISSING',
    };
  }
  
  try {
    const activityResult = await getUserActivity(username, 50);
    
    if (!activityResult.success) {
      return activityResult;
    }
    
    const { posts, comments } = activityResult.data;
    
    // Analyze activity
    const analysis = analyzeRedditActivity(posts, comments, username);
    
    return {
      success: true,
      source: 'reddit',
      researchType: 'REDDIT_ACTIVITY',
      query: username,
      data: {
        username,
        profile: {
          url: `https://reddit.com/u/${username}`,
          totalPosts: posts.length,
          totalComments: comments.length,
        },
        recentPosts: posts.slice(0, 10),
        recentComments: comments.slice(0, 10),
        analysis,
        scrapedAt: new Date().toISOString(),
      },
    };
    
  } catch (error) {
    console.error('Reddit research error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: 'RESEARCH_ERROR',
    };
  }
}

/**
 * Analyze Reddit activity to extract insights
 */
function analyzeRedditActivity(posts, comments, username) {
  const allContent = [...posts, ...comments];
  
  if (allContent.length === 0) {
    return {
      subredditFrequency: {},
      topSubreddits: [],
      interests: [],
      expertise: [],
      engagement: 0,
      activityLevel: 'low',
    };
  }
  
  // Subreddit frequency
  const subredditCount = {};
  let totalScore = 0;
  
  for (const item of allContent) {
    subredditCount[item.subreddit] = (subredditCount[item.subreddit] || 0) + 1;
    totalScore += item.score || 0;
  }
  
  const topSubreddits = Object.entries(subredditCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([subreddit, count]) => ({ subreddit, count }));
  
  // Extract interests from subreddits
  const interests = identifyInterests(topSubreddits);
  
  // Extract expertise indicators
  const expertise = identifyExpertiseFromReddit(posts, comments, topSubreddits);
  
  // Calculate activity level
  const avgScore = allContent.length > 0 ? totalScore / allContent.length : 0;
  const activityLevel = allContent.length > 40 ? 'high' : 
                        allContent.length > 15 ? 'medium' : 'low';
  
  // Find high-engagement content
  const topContent = [...allContent]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)
    .map(item => ({
      type: item.type,
      text: (item.title || item.text)?.substring(0, 200),
      subreddit: item.subreddit,
      score: item.score,
      url: item.url,
    }));
  
  return {
    subredditFrequency: subredditCount,
    topSubreddits,
    interests,
    expertise,
    engagement: avgScore.toFixed(1),
    activityLevel,
    totalActivity: allContent.length,
    postVsCommentRatio: posts.length / Math.max(comments.length, 1),
    topContent,
  };
}

/**
 * Identify interests from subreddit names
 */
function identifyInterests(topSubreddits) {
  const interestMap = {
    'startups': 'Startups',
    'entrepreneur': 'Entrepreneurship',
    'venturecapital': 'Venture Capital',
    'investing': 'Investing',
    'technology': 'Technology',
    'programming': 'Programming',
    'machinelearning': 'Machine Learning',
    'artificial': 'AI',
    'datascience': 'Data Science',
    'cryptocurrency': 'Cryptocurrency',
    'finance': 'Finance',
    'business': 'Business',
    'marketing': 'Marketing',
    'saas': 'SaaS',
    'productivity': 'Productivity',
    'remotework': 'Remote Work',
  };
  
  const interests = [];
  
  for (const { subreddit, count } of topSubreddits) {
    const subredditLower = subreddit.toLowerCase();
    
    for (const [key, interest] of Object.entries(interestMap)) {
      if (subredditLower.includes(key) && !interests.some(i => i.interest === interest)) {
        interests.push({ interest, frequency: count });
      }
    }
  }
  
  return interests.slice(0, 8);
}

/**
 * Identify expertise from Reddit activity
 */
function identifyExpertiseFromReddit(posts, comments, topSubreddits) {
  const expertise = [];
  
  // High-scoring posts indicate expertise
  const highScoringPosts = posts.filter(p => p.score > 20);
  
  if (highScoringPosts.length > 3) {
    const subreddits = [...new Set(highScoringPosts.map(p => p.subreddit))];
    for (const subreddit of subreddits.slice(0, 3)) {
      expertise.push({
        area: subreddit,
        confidence: 0.7,
        source: 'high_scoring_posts',
        evidence: `Multiple well-received posts in r/${subreddit}`,
      });
    }
  }
  
  // Frequent participation indicates interest/expertise
  for (const { subreddit, count } of topSubreddits.slice(0, 5)) {
    if (count > 10 && !expertise.some(e => e.area === subreddit)) {
      expertise.push({
        area: subreddit,
        confidence: 0.6,
        source: 'frequent_participation',
        evidence: `${count} posts/comments in r/${subreddit}`,
      });
    }
  }
  
  return expertise.slice(0, 5);
}

/**
 * Parse Reddit URL to extract info
 */
function parseRedditUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Post URL: /r/subreddit/comments/postid/title
    const postMatch = urlObj.pathname.match(/\/r\/([^\/]+)\/comments\/([^\/]+)/);
    if (postMatch) {
      return {
        type: 'post',
        subreddit: postMatch[1],
        postId: postMatch[2],
      };
    }
    
    // User URL: /u/username or /user/username
    const userMatch = urlObj.pathname.match(/\/(u|user)\/([^\/]+)/);
    if (userMatch) {
      return {
        type: 'user',
        username: userMatch[2],
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract Reddit username from text
 */
function extractRedditUsername(text) {
  if (!text) return null;
  
  // Match /u/username or reddit.com/u/username
  const patterns = [
    /\/u\/([a-zA-Z0-9_-]+)/,
    /reddit\.com\/u\/([a-zA-Z0-9_-]+)/,
    /reddit\.com\/user\/([a-zA-Z0-9_-]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

/**
 * Generate summary for AI context
 */
function generateRedditSummary(redditData) {
  if (!redditData?.success || !redditData.data) {
    return null;
  }
  
  const { profile, analysis } = redditData.data;
  
  let summary = `### Reddit Activity:\n`;
  summary += `**u/${profile.username}**\n`;
  summary += `📊 ${profile.totalPosts} posts, ${profile.totalComments} comments\n`;
  
  if (analysis?.topSubreddits?.length > 0) {
    summary += `\n**Most Active Subreddits:**\n`;
    analysis.topSubreddits.slice(0, 5).forEach(s => {
      summary += `- r/${s.subreddit} (${s.count} posts/comments)\n`;
    });
  }
  
  if (analysis?.interests?.length > 0) {
    summary += `\n**Interests:**\n`;
    analysis.interests.forEach(i => {
      summary += `- ${i.interest}\n`;
    });
  }
  
  if (analysis?.expertise?.length > 0) {
    summary += `\n**Expertise Indicators:**\n`;
    analysis.expertise.forEach(e => {
      summary += `- ${e.area} (${e.evidence})\n`;
    });
  }
  
  if (analysis?.topContent?.length > 0) {
    summary += `\n**Top Content:**\n`;
    const top = analysis.topContent[0];
    summary += `> ${top.text}\n`;
    summary += `↑ ${top.score} points in r/${top.subreddit}\n`;
  }
  
  summary += `\n**Activity Level:** ${analysis?.activityLevel}\n`;
  summary += `**Avg Engagement:** ${analysis?.engagement} points\n`;
  
  return summary;
}

module.exports = {
  researchRedditUser,
  getPost,
  getUserActivity,
  parseRedditUrl,
  extractRedditUsername,
  generateRedditSummary,
  analyzeRedditActivity,
};

