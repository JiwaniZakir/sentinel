# Onboarding Setup Checklist

Use this checklist to verify your onboarding flow is properly configured.

## ✅ Pre-Deployment Checklist

### 1. Environment Variables

Copy these to Railway (or `.env` for local):

```bash
# === REQUIRED ===
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-... (for Socket Mode/dev only)
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-your-openai-key

# === CHANNELS (Required) ===
CHANNEL_INTRODUCTIONS=C01ABC123
CHANNEL_BOT_ADMIN=C02DEF456
CHANNEL_COMMUNITY=C03GHI789

# === RESEARCH (Optional but Recommended) ===
PERPLEXITY_API_KEY=pplx-...
TAVILY_API_KEY=tvly-...
SESSION_ENCRYPTION_KEY=<64-char-hex> (for LinkedIn)
LINKEDIN_DAILY_LIMIT_PER_ACCOUNT=75
LINKEDIN_COOLDOWN_HOURS=6

# === SOCIAL (Optional) ===
TWITTER_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAABn...

# === CONFIGURATION ===
ORG_NAME=The Foundry
NODE_ENV=production
PORT=3000
```

**Verify:**
- [ ] All required variables set
- [ ] Channel IDs are correct (check Slack URLs)
- [ ] API keys are valid

### 2. Slack App Configuration

**Bot Token Scopes (OAuth & Permissions):**
- [ ] `channels:join`
- [ ] `channels:read`
- [ ] `chat:write`
- [ ] `chat:write.public`
- [ ] `im:history`
- [ ] `im:read`
- [ ] `im:write`
- [ ] `users:read`
- [ ] `users:read.email`
- [ ] `commands`

**Event Subscriptions:**
- [ ] Event subscriptions enabled
- [ ] Request URL set (for production): `https://your-railway-url.up.railway.app/slack/events`
- [ ] Events subscribed to:
  - [ ] `team_join`
  - [ ] `member_joined_channel`
  - [ ] `message.im`

**Interactivity:**
- [ ] Interactivity enabled
- [ ] Request URL set (same as events): `https://your-railway-url.up.railway.app/slack/events`

**Slash Commands:**
- [ ] `/partnerbot` command created
- [ ] Request URL: `https://your-railway-url.up.railway.app/slack/events`

### 3. Database Setup

```bash
# Push schema to database
npm run db:push

# OR create a migration
npm run db:migrate
```

**Verify:**
- [ ] Database connected
- [ ] All tables created:
  - [ ] `partners`
  - [ ] `onboarding_conversations`
  - [ ] `partner_research`
  - [ ] `person_profiles`
  - [ ] `firm_profiles`
  - [ ] `verified_facts`
  - [ ] `citation_crawls`
  - [ ] `linkedin_accounts` (for session manager)

### 4. Slack Channel Setup

**Create these channels** (if they don't exist):
- [ ] `#introductions` - Where partner intros are posted
- [ ] `#bot-admin` - Where bot sends admin notifications
- [ ] `#community` - General community channel

**Invite the bot** to these channels:
- [ ] `#introductions`
- [ ] `#bot-admin`
- [ ] `#community`

**Get Channel IDs:**
```bash
# In Slack, right-click channel → View channel details → Copy channel ID
# Or check the URL: slack.com/archives/C01ABC123
```

### 5. LinkedIn Session Manager (Optional)

**If you want full research:**

- [ ] Generate encryption key: `/partnerbot linkedin-generate-key`
- [ ] Add `SESSION_ENCRYPTION_KEY` to Railway
- [ ] Add at least 1 LinkedIn account (see [LinkedIn Session Manager Quick Start](./LINKEDIN_SESSION_MANAGER_QUICKSTART.md))
- [ ] Test account pool: `/partnerbot linkedin-pool-stats`

**Skip for now?**
- [ ] Set `PERPLEXITY_API_KEY` and `TAVILY_API_KEY` only
- [ ] Bot will use Tavily LinkedIn search (no login needed)

## 🧪 Testing Checklist

### Local Testing (Development)

```bash
# 1. Start the bot
npm run dev

# 2. In Slack, DM the bot:
"ready"

# 3. Should start onboarding conversation
```

**Verify:**
- [ ] Bot responds to "ready"
- [ ] Conversation flows naturally
- [ ] LinkedIn URL detection works
- [ ] Introduction preview appears
- [ ] Buttons work (approve/edit/skip)

### Production Testing (Railway)

```bash
# 1. Deploy to Railway
git push origin main

# 2. Check deployment logs
# Railway → Your Project → Deployments → View Logs

# 3. Wait for "⚡ PartnerBot is running!"
```

**Test 1: Admin Commands**
```
/partnerbot help
```
Should show command list.

**Test 2: Test Intro Flow**
```
/partnerbot test-intro-flow
```
Should simulate the entire onboarding in your DM.

**Test 3: Test Research**
```
/partnerbot test-research https://linkedin.com/in/someone/
```
Should show research results.

**Test 4: Real User Join**
1. Create a test Slack account
2. Invite them to `#introductions`
3. They should receive a welcome DM
4. Click "Start Onboarding"
5. Complete conversation
6. Approve introduction
7. Check `#introductions` for posted intro

### Verification Points

**After Welcome DM:**
- [ ] DM received within 5 seconds of joining
- [ ] Buttons work (Start Onboarding, Maybe Later, Skip)

**During Conversation:**
- [ ] Bot asks natural, conversational questions
- [ ] LinkedIn URL detection triggers research notification
- [ ] Conversation completes after 6-10 exchanges

**After Conversation:**
- [ ] Introduction preview appears
- [ ] Research quality indicator shown (if research ran)
- [ ] 3 buttons present (Post, Edit, Skip)

**After Posting:**
- [ ] Introduction appears in `#introductions`
- [ ] Tagged with emoji based on partner type
- [ ] Confirmation sent to user
- [ ] Notification in `#bot-admin`

## 🔍 Debugging

### Issue: Bot Not Responding

**Check Railway Logs:**
```
Railway → Deployments → View Logs
```

Look for:
```
✅ Database connected
✅ All listeners registered
⚡ PartnerBot is running!
```

**Common Issues:**
- `DATABASE_URL` not set → Add to Railway
- `OPENAI_API_KEY` invalid → Check API key
- Port binding error → Railway sets `PORT` automatically

### Issue: No Welcome DM

**Check:**
1. Event subscriptions enabled?
2. Bot invited to `#introductions`?
3. User already onboarded? (check database)

**Test Manually:**
```bash
# In Slack DM with bot:
ready
```

Should start conversation regardless of join event.

### Issue: Research Not Working

**Check Research Status:**
```sql
SELECT 
  slack_user_id, 
  research_status, 
  research_completed_at 
FROM partners 
WHERE research_status IS NOT NULL;
```

**Common Issues:**
- No LinkedIn accounts in pool → Add via [Quick Start](./LINKEDIN_SESSION_MANAGER_QUICKSTART.md)
- API keys missing → Add `PERPLEXITY_API_KEY` and `TAVILY_API_KEY`
- Rate limited → Check `/partnerbot linkedin-pool-stats`

### Issue: Introduction Not Posting

**Check:**
1. `CHANNEL_INTRODUCTIONS` set correctly?
2. Bot in channel?
3. Bot has `chat:write.public` scope?

**Test:**
```bash
/partnerbot test-intro-flow
```

Should simulate full flow and show where it fails.

## 📊 Monitoring

### Daily Health Checks

**1. Check Active Onboardings:**
```sql
SELECT COUNT(*) FROM onboarding_conversations 
WHERE status = 'IN_PROGRESS' 
AND started_at > NOW() - INTERVAL '1 day';
```

**2. Check Completion Rate:**
```sql
SELECT 
  COUNT(CASE WHEN onboarding_complete THEN 1 END)::FLOAT / COUNT(*) * 100 as completion_rate
FROM partners
WHERE created_at > NOW() - INTERVAL '7 days';
```

**3. Check Research Success:**
```sql
SELECT research_status, COUNT(*) 
FROM partners 
WHERE research_status IS NOT NULL 
GROUP BY research_status;
```

### Slack Commands

```bash
# Pool health
/partnerbot linkedin-pool-stats

# Test components
/partnerbot test-onboarding
```

## 🚀 Production Readiness

Before going live:

- [ ] All tests passing
- [ ] At least 3 LinkedIn accounts in pool (if using research)
- [ ] Onboarding tested with real users
- [ ] Introductions posting correctly
- [ ] #bot-admin notifications working
- [ ] Research quality scores acceptable (>70%)
- [ ] Response times < 2 minutes for full flow
- [ ] No errors in Railway logs

## 📚 Documentation

**For your team:**
- [ ] Share [Onboarding Flow Guide](./ONBOARDING_FLOW_GUIDE.md)
- [ ] Document channel purposes
- [ ] Train admins on bot commands
- [ ] Set expectations for response times

**For partners:**
- [ ] Prepare welcome message for `#community`
- [ ] Create FAQ about bot
- [ ] Document how to update profile later

## 🎉 Launch!

Once all checks pass:

1. ✅ Announce to team
2. ✅ Monitor first 5 onboardings closely
3. ✅ Collect feedback
4. ✅ Iterate on conversation prompts
5. ✅ Scale LinkedIn account pool as needed

## Need Help?

- 📖 [Onboarding Flow Guide](./ONBOARDING_FLOW_GUIDE.md)
- 🔬 [Research Architecture](./RESEARCH_ARCHITECTURE.md)
- 🔐 [LinkedIn Session Manager](./LINKEDIN_SESSION_MANAGER_SETUP.md)
- 📝 [Production Checklist](./PRODUCTION_CHECKLIST.md)

