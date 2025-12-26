# Twitter/X API Setup

## Step 1: Get Bearer Token

You have API Key and Secret. Now generate a Bearer Token:

### Option A: Use Twitter Developer Portal (Easiest)
1. Go to https://developer.twitter.com/en/portal/dashboard
2. Select your app
3. Go to "Keys and tokens" tab
4. Under "Authentication Tokens", click "Generate" for Bearer Token
5. Copy the Bearer Token

### Option B: Generate Using API (Code Below)

```bash
# Use your credentials
API_KEY="AcZkDB13tIqNMxRRmqaNYe1sa"
API_SECRET="GgK16nN8bMbNqiM9miRHLvvKvX3R3dkACgA06IQieVcPJUno9m"

# Generate Bearer Token
BEARER_TOKEN=$(echo -n "$API_KEY:$API_SECRET" | base64)

curl -X POST 'https://api.twitter.com/oauth2/token' \
  -H "Authorization: Basic $BEARER_TOKEN" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'grant_type=client_credentials'
```

Response will contain `access_token` - that's your Bearer Token!

## Step 2: Add to Railway Environment Variables

In Railway Dashboard, add these variables:

```bash
TWITTER_API_KEY=AcZkDB13tIqNMxRRmqaNYe1sa
TWITTER_API_SECRET=GgK16nN8bMbNqiM9miRHLvvKvX3R3dkACgA06IQieVcPJUno9m
TWITTER_BEARER_TOKEN=<your_bearer_token_from_step_1>
```

## Step 3: Test

Once Railway redeploys, test with:

```
/partnerbot test-twitter harris_s
```

## What Twitter Research Provides

### Profile Data
- Bio/description
- Location
- Follower/following counts
- Verification status
- Profile image

### Recent Tweets (last 50)
- Tweet text
- Engagement metrics (likes, retweets, replies)
- Hashtags and mentions
- URLs shared

### Analysis
- **Topic Frequency**: What they talk about most
- **Posting Frequency**: How active they are
- **Engagement Rate**: How their audience responds
- **Top Tweets**: Most popular recent posts
- **Interests**: Extracted from hashtags and content
- **Expertise**: Identified from bio + tweet patterns

### Example Insights

```
@harris_s (Harris Stolzenberg)
📊 1,234 followers, 892 tweets

Bio: Partner @PearVC. Investing in developer tools and infrastructure.

Top Interests:
- devtools (mentioned 42 times)
- infrastructure (mentioned 38 times)
- opensource (mentioned 31 times)
- kubernetes (mentioned 28 times)
- ai (mentioned 24 times)

Expertise Areas:
- Developer Tools (92% confidence)
- Infrastructure (88% confidence)
- Venture Capital (90% confidence, from bio)

Most Engaging Tweet:
> "Excited to lead the Series A in @CompanyX. Amazing team building..."
👍 234 likes, 🔄 45 retweets

Activity: Posts ~2.3 times per day
Engagement Rate: 3.8%
```

## Integration in Research Pipeline

Twitter research runs in **Stage 1: Data Collection** alongside:
- LinkedIn (Tavily)
- Perplexity (news & deals)
- Tavily (social profiles) 
- Wikipedia (background)

The Twitter data enriches:
- **PersonProfile**: Interests, expertise areas, thought leadership
- **Verified Facts**: Cross-reference with tweets (e.g., "announced investment in X")
- **Introduction**: "Active on Twitter sharing insights about developer tools..."

## Rate Limits

Twitter API v2 (Essential access):
- 500,000 tweets per month
- ~16,000 per day
- More than enough for research use case

## Privacy Notes

- Only fetches public tweets
- Respects Twitter's Terms of Service
- Data stored with partner consent
- Can be deleted on request

