/**
 * Twitter/X API Service
 * 
 * Fetches tweets, profile info, and analyzes posting patterns
 * to understand interests, expertise, and thought leadership.
 */

const config = require('../../config');
const { logger } = require('../../utils/logger');

const TWITTER_API_URL = 'https://api.twitter.com/2';

/**
 * Get Twitter user by username
 */
async function getUserByUsername(username) {
  if (!username) return null;
  
  // Clean username (remove @ if present)
  const cleanUsername = username.replace('@', '');
  
  console.log('=== TWITTER USER LOOKUP ===');
  console.log('Username:', cleanUsername);
  
  try {
    const response = await fetch(
      `${TWITTER_API_URL}/users/by/username/${cleanUsername}?user.fields=id,name,username,description,location,verified,public_metrics,created_at,profile_image_url`,
      {
        headers: {
          'Authorization': `Bearer ${config.twitter.bearerToken}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twitter API error:', response.status, errorText);
      return {
        success: false,
        error: `Twitter API error: ${response.status}`,
        error_type: 'API_ERROR',
      };
    }
    
    const data = await response.json();
    
    if (!data.data) {
      return {
        success: false,
        error: 'User not found',
        error_type: 'USER_NOT_FOUND',
      };
    }
    
    console.log('Twitter user found:', data.data.username);
    
    return {
      success: true,
      data: data.data,
    };
    
  } catch (error) {
    console.error('Twitter fetch error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: 'FETCH_ERROR',
    };
  }
}

/**
 * Get recent tweets from a user
 */
async function getUserTweets(userId, maxResults = 50) {
  console.log('=== FETCHING TWITTER TWEETS ===');
  console.log('User ID:', userId);
  console.log('Max results:', maxResults);
  
  try {
    const response = await fetch(
      `${TWITTER_API_URL}/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at,public_metrics,entities,referenced_tweets&exclude=retweets,replies`,
      {
        headers: {
          'Authorization': `Bearer ${config.twitter.bearerToken}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twitter API error:', response.status, errorText);
      return {
        success: false,
        error: `Twitter API error: ${response.status}`,
        error_type: 'API_ERROR',
      };
    }
    
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return {
        success: true,
        data: [],
        meta: data.meta,
      };
    }
    
    console.log(`Fetched ${data.data.length} tweets`);
    
    return {
      success: true,
      data: data.data,
      meta: data.meta,
    };
    
  } catch (error) {
    console.error('Twitter fetch error:', error.message);
    return {
      success: false,
      error: error.message,
      error_type: 'FETCH_ERROR',
    };
  }
}

/**
 * Research a person's Twitter profile and recent activity
 */
async function researchTwitterProfile(username) {
  console.log('=== TWITTER PROFILE RESEARCH ===');
  console.log('Username:', username);
  
  if (!config.twitter.bearerToken) {
    return {
      success: false,
      error: 'Twitter API credentials not configured',
      error_type: 'AUTH_MISSING',
    };
  }
  
  // Get user profile
  const userResult = await getUserByUsername(username);
  if (!userResult.success) {
    return userResult;
  }
  
  const user = userResult.data;
  
  // Get recent tweets (last 50, excluding retweets and replies)
  const tweetsResult = await getUserTweets(user.id, 50);
  if (!tweetsResult.success) {
    return {
      success: true, // Still return user data even if tweets fail
      data: {
        profile: user,
        tweets: [],
        analysis: null,
      },
    };
  }
  
  const tweets = tweetsResult.data;
  
  // Analyze tweets
  const analysis = analyzeTweets(tweets, user);
  
  return {
    success: true,
    source: 'twitter',
    researchType: 'TWITTER_PROFILE',
    query: username,
    data: {
      profile: {
        id: user.id,
        username: user.username,
        name: user.name,
        bio: user.description,
        location: user.location,
        verified: user.verified,
        followersCount: user.public_metrics?.followers_count,
        followingCount: user.public_metrics?.following_count,
        tweetCount: user.public_metrics?.tweet_count,
        profileImageUrl: user.profile_image_url,
        createdAt: user.created_at,
        url: `https://twitter.com/${user.username}`,
      },
      tweets: tweets.slice(0, 20).map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at,
        likes: tweet.public_metrics?.like_count,
        retweets: tweet.public_metrics?.retweet_count,
        replies: tweet.public_metrics?.reply_count,
        hashtags: tweet.entities?.hashtags?.map(h => h.tag) || [],
        mentions: tweet.entities?.mentions?.map(m => m.username) || [],
        urls: tweet.entities?.urls?.map(u => u.expanded_url) || [],
      })),
      analysis,
      scrapedAt: new Date().toISOString(),
    },
  };
}

/**
 * Analyze tweets to extract insights
 */
function analyzeTweets(tweets, user) {
  if (!tweets || tweets.length === 0) {
    return {
      topicFrequency: {},
      postingFrequency: 0,
      engagementRate: 0,
      topTweets: [],
      interests: [],
      expertise: [],
    };
  }
  
  // Extract topics from hashtags and keywords
  const topics = {};
  const allHashtags = [];
  const allMentions = new Set();
  let totalEngagement = 0;
  
  for (const tweet of tweets) {
    // Hashtags
    if (tweet.entities?.hashtags) {
      for (const hashtag of tweet.entities.hashtags) {
        const tag = hashtag.tag.toLowerCase();
        allHashtags.push(tag);
        topics[tag] = (topics[tag] || 0) + 1;
      }
    }
    
    // Mentions
    if (tweet.entities?.mentions) {
      for (const mention of tweet.entities.mentions) {
        allMentions.add(mention.username);
      }
    }
    
    // Engagement
    if (tweet.public_metrics) {
      totalEngagement += (
        tweet.public_metrics.like_count +
        tweet.public_metrics.retweet_count +
        tweet.public_metrics.reply_count
      );
    }
    
    // Extract keywords from text
    const keywords = extractKeywords(tweet.text);
    for (const keyword of keywords) {
      topics[keyword] = (topics[keyword] || 0) + 1;
    }
  }
  
  // Sort topics by frequency
  const sortedTopics = Object.entries(topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  
  // Calculate engagement rate
  const avgEngagement = tweets.length > 0 ? totalEngagement / tweets.length : 0;
  const engagementRate = user.public_metrics?.followers_count > 0
    ? (avgEngagement / user.public_metrics.followers_count) * 100
    : 0;
  
  // Find top tweets by engagement
  const topTweets = [...tweets]
    .sort((a, b) => {
      const engagementA = (a.public_metrics?.like_count || 0) +
                         (a.public_metrics?.retweet_count || 0) * 2;
      const engagementB = (b.public_metrics?.like_count || 0) +
                         (b.public_metrics?.retweet_count || 0) * 2;
      return engagementB - engagementA;
    })
    .slice(0, 5)
    .map(tweet => ({
      text: tweet.text.substring(0, 200),
      likes: tweet.public_metrics?.like_count,
      retweets: tweet.public_metrics?.retweet_count,
      createdAt: tweet.created_at,
    }));
  
  // Identify interests and expertise from frequent topics
  const interests = sortedTopics
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, frequency: count }));
  
  // Extract expertise indicators (topics + bio analysis)
  const expertise = identifyExpertise(sortedTopics, user.description, tweets);
  
  // Calculate posting frequency (tweets per day)
  const oldestTweet = tweets[tweets.length - 1];
  const newestTweet = tweets[0];
  let postingFrequency = 0;
  
  if (oldestTweet && newestTweet) {
    const daysDiff = (new Date(newestTweet.created_at) - new Date(oldestTweet.created_at)) / (1000 * 60 * 60 * 24);
    postingFrequency = daysDiff > 0 ? tweets.length / daysDiff : 0;
  }
  
  return {
    topicFrequency: Object.fromEntries(sortedTopics),
    postingFrequency: postingFrequency.toFixed(2),
    engagementRate: engagementRate.toFixed(2),
    avgEngagementPerTweet: avgEngagement.toFixed(0),
    topTweets,
    interests,
    expertise,
    topHashtags: allHashtags.slice(0, 10),
    frequentMentions: Array.from(allMentions).slice(0, 10),
    totalTweetsAnalyzed: tweets.length,
  };
}

/**
 * Extract keywords from tweet text
 */
function extractKeywords(text) {
  if (!text) return [];
  
  const keywords = [
    'AI', 'ML', 'startup', 'founder', 'investment', 'venture', 'capital',
    'SaaS', 'fintech', 'crypto', 'blockchain', 'web3', 'enterprise',
    'developer', 'product', 'growth', 'fundraising', 'seed', 'series',
    'IPO', 'acquisition', 'exit', 'portfolio', 'pitch', 'deck',
    'revenue', 'ARR', 'MRR', 'customer', 'market', 'innovation',
    'technology', 'platform', 'infrastructure', 'data', 'analytics',
    'mobile', 'app', 'software', 'hardware', 'robotics', 'autonomous',
    'healthcare', 'biotech', 'climate', 'sustainability', 'energy',
    'education', 'edtech', 'consumer', 'retail', 'ecommerce',
  ];
  
  const textLower = text.toLowerCase();
  const found = [];
  
  for (const keyword of keywords) {
    if (textLower.includes(keyword.toLowerCase())) {
      found.push(keyword.toLowerCase());
    }
  }
  
  return found;
}

/**
 * Identify expertise from topics and bio
 */
function identifyExpertise(sortedTopics, bio, tweets) {
  const expertise = [];
  
  // From bio
  if (bio) {
    const bioLower = bio.toLowerCase();
    
    if (bioLower.includes('investor') || bioLower.includes('vc') || bioLower.includes('venture')) {
      expertise.push({ area: 'Venture Capital', confidence: 0.9, source: 'bio' });
    }
    if (bioLower.includes('founder') || bioLower.includes('co-founder')) {
      expertise.push({ area: 'Entrepreneurship', confidence: 0.9, source: 'bio' });
    }
    if (bioLower.includes('engineer') || bioLower.includes('developer')) {
      expertise.push({ area: 'Engineering', confidence: 0.8, source: 'bio' });
    }
    if (bioLower.includes('ai') || bioLower.includes('machine learning') || bioLower.includes('ml')) {
      expertise.push({ area: 'AI/ML', confidence: 0.85, source: 'bio' });
    }
  }
  
  // From frequent topics
  const topicMap = {
    'ai': 'AI/ML',
    'ml': 'AI/ML',
    'saas': 'SaaS',
    'fintech': 'Fintech',
    'crypto': 'Crypto/Web3',
    'blockchain': 'Blockchain',
    'web3': 'Web3',
    'startup': 'Startups',
    'founder': 'Entrepreneurship',
    'enterprise': 'Enterprise Software',
    'developer': 'Developer Tools',
    'climate': 'Climate Tech',
    'healthcare': 'Healthcare',
  };
  
  for (const [topic, count] of sortedTopics.slice(0, 10)) {
    const area = topicMap[topic];
    if (area && !expertise.some(e => e.area === area)) {
      const confidence = Math.min(0.7 + (count / tweets.length), 0.95);
      expertise.push({ area, confidence, source: 'tweets', frequency: count });
    }
  }
  
  return expertise.slice(0, 5);
}

/**
 * Find Twitter username from various sources
 */
function extractTwitterUsername(text) {
  if (!text) return null;
  
  // Match @username or twitter.com/username or x.com/username
  const patterns = [
    /@([a-zA-Z0-9_]+)/,
    /twitter\.com\/([a-zA-Z0-9_]+)/,
    /x\.com\/([a-zA-Z0-9_]+)/,
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
function generateTwitterSummary(twitterData) {
  if (!twitterData?.success || !twitterData.data) {
    return null;
  }
  
  const { profile, analysis } = twitterData.data;
  
  let summary = `### Twitter/X Profile:\n`;
  summary += `**@${profile.username}** (${profile.name})\n`;
  summary += `📊 ${profile.followersCount?.toLocaleString()} followers, ${profile.tweetCount?.toLocaleString()} tweets\n`;
  
  if (profile.bio) {
    summary += `\n**Bio:** ${profile.bio}\n`;
  }
  
  if (analysis?.interests?.length > 0) {
    summary += `\n**Top Interests:**\n`;
    analysis.interests.slice(0, 5).forEach(i => {
      summary += `- ${i.topic} (mentioned ${i.frequency} times)\n`;
    });
  }
  
  if (analysis?.expertise?.length > 0) {
    summary += `\n**Expertise Areas:**\n`;
    analysis.expertise.forEach(e => {
      summary += `- ${e.area} (${(e.confidence * 100).toFixed(0)}% confidence)\n`;
    });
  }
  
  if (analysis?.topTweets?.length > 0) {
    summary += `\n**Most Engaging Recent Tweet:**\n`;
    const top = analysis.topTweets[0];
    summary += `> ${top.text.substring(0, 150)}...\n`;
    summary += `👍 ${top.likes} likes, 🔄 ${top.retweets} retweets\n`;
  }
  
  summary += `\n**Activity:** Posts ~${analysis?.postingFrequency} times per day\n`;
  summary += `**Engagement Rate:** ${analysis?.engagementRate}%\n`;
  
  return summary;
}

module.exports = {
  researchTwitterProfile,
  getUserByUsername,
  getUserTweets,
  analyzeTweets,
  extractTwitterUsername,
  generateTwitterSummary,
};

