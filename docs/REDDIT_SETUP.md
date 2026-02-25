# Reddit API Setup

## Step 1: Create Reddit App

1. Go to https://www.reddit.com/prefs/apps
2. Scroll to "Developed Applications"
3. Click **"create another app..."** or **"are you a developer? create an app..."**

4. Fill in the form:
   - **Name**: `Partner Research Bot`
   - **App type**: Select **"script"**
   - **Description**: `Research bot for partner intelligence gathering`
   - **About URL**: (leave blank or add your org website)
   - **Redirect URI**: `http://localhost:8080` (required but not used)

5. Click **"create app"**

## Step 2: Get Credentials

After creating the app, you'll see:

```
Partner Research Bot
personal use script
<your_client_id>          ← This is your CLIENT ID (14 characters)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
secret    <your_client_secret>  ← This is your CLIENT SECRET (27 characters)
```

**Client ID**: Located directly under "personal use script" (small text)
**Client Secret**: Next to the word "secret"

## Step 3: Add to Railway

In Railway Dashboard → Your Project → Variables:

```bash
REDDIT_CLIENT_ID=<your_14_char_client_id>
REDDIT_CLIENT_SECRET=<your_27_char_client_secret>
REDDIT_USER_AGENT=SentinelBot/1.0 (by /u/YOUR_REDDIT_USERNAME)
```

**Important**: Update `YOUR_REDDIT_USERNAME` with your actual Reddit username in the User-Agent!

Then **redeploy**.

## What Reddit Research Provides

### User Activity
- Recent posts (last 25-50)
- Recent comments
- Subreddit participation frequency
- Engagement metrics (upvotes/scores)

### Analysis
- **Top Subreddits**: Where they're most active
- **Interests**: Extracted from subreddit names
- **Expertise**: Identified from high-scoring posts
- **Activity Level**: High/medium/low engagement
- **Content Style**: Post vs comment ratio

### Example Insights

```
u/tech_investor
📊 42 posts, 156 comments

Most Active Subreddits:
- r/startups (34 posts/comments)
- r/venturecapital (28 posts/comments)
- r/SaaS (21 posts/comments)
- r/entrepreneur (15 posts/comments)

Interests:
- Startups
- Venture Capital
- SaaS
- Entrepreneurship

Expertise Indicators:
- r/startups (7 high-scoring posts, 90% confidence)
- r/venturecapital (Multiple well-received posts, 85% confidence)

Top Content:
> "After 15 years in VC, here's what I look for..."
↑ 487 points in r/venturecapital

Activity Level: high
Avg Engagement: 34.5 points
```

## Integration in Research Pipeline

Reddit research runs when:
1. **Reddit username found** in onboarding or social profiles
2. **Reddit URLs cited** by Perplexity (automatically crawled)

### Stage 1: Data Collection
```
Sources:
- LinkedIn
- Perplexity
- Tavily
- Twitter
- Reddit (NEW!)  ← If username available
- Wikipedia
```

### Stage 2: Citation Crawling
```
Citations from Perplexity:
- 3 Reddit posts → Fetched via API ✅
  (No login required, public data only)
```

## Use Cases

### 1. Validate Expertise
Someone claims to be an expert in AI/ML?
→ Check their Reddit history in r/MachineLearning

### 2. Find Shared Interests
Partner active in r/climate?
→ Connect with community members interested in climate tech

### 3. Assess Community Engagement
High karma + quality posts = respected community member

### 4. Discover Thought Leadership
Highly upvoted posts indicate valuable insights

## Privacy & Ethics

- ✅ Only fetches **public** Reddit posts/comments
- ✅ User controls what they post publicly
- ✅ Data stored with partner consent
- ✅ Can be deleted on request
- ✅ Respects Reddit's API Terms of Service

## Rate Limits

Reddit API (script app):
- 60 requests per minute
- More than enough for research use case
- Automatic token refresh

## Troubleshooting

### "Reddit API not configured"
- Check CLIENT_ID and CLIENT_SECRET are set in Railway
- Ensure no extra spaces in the values

### "403 Forbidden"
- Check your USER_AGENT includes your Reddit username
- Format: `SentinelBot/1.0 (by /u/your_username)`

### "User not found"
- Reddit username doesn't exist or is shadowbanned
- Try a different username

## Test Command

Once Railway redeploys:

```
/partnerbot test-reddit your_reddit_username
```

Example:
```
/partnerbot test-reddit tech_investor
```

