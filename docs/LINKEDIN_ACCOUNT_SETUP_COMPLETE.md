# LinkedIn Account Setup - Complete Guide

## ✅ What's Been Done

### 1. Encryption Key Generated

```
SESSION_ENCRYPTION_KEY=e547bb6cac0dc6d440d522297f5571b93ba66c1c22a2ea7ffa0a60e40fd8d167
```

### 2. LinkedIn Password Encrypted

```
Encrypted Password: bd42aca9f4f83f6d59deb1c74b4179a4:07c2b597c2cea3610af9b54e02ca1532:df70d15c9ab90078ae5b
```

### 3. Account Details

- **Gmail Email**: scrapinglinkedin868@gmail.com
- **LinkedIn Email**: scrapinglinkedin868@gmail.com
- **Gmail App Password**: pipt uugw fnet vfsz
- **Status**: Ready to add to database

---

## 📋 Setup Steps

### Step 1: Add Encryption Key to Railway

1. Go to Railway Dashboard → Your Project
2. Click on "Variables" tab
3. Click "+ New Variable"
4. Add:
   ```
   Name: SESSION_ENCRYPTION_KEY
   Value: e547bb6cac0dc6d440d522297f5571b93ba66c1c22a2ea7ffa0a60e40fd8d167
   ```
5. Click "Add" and Railway will redeploy automatically

⚠️ **Important**: Save this key securely. Never change it once set (data will be unreadable).

---

### Step 2: Push Database Schema

Run this locally (if you have DATABASE_URL set) or via Railway console:

```bash
npm run db:push
```

Or create a migration:

```bash
npx prisma migrate dev --name add_linkedin_accounts
```

This creates the `linkedin_accounts` table.

---

### Step 3: Add Account to Database

You have **3 options**:

#### Option A: Use Helper Script (Easiest) ⭐

```bash
# Make sure DATABASE_URL is set in your .env or environment
SESSION_ENCRYPTION_KEY=e547bb6cac0dc6d440d522297f5571b93ba66c1c22a2ea7ffa0a60e40fd8d167 node scripts/add_linkedin_account.js
```

This will:
- Encrypt the password
- Add the account to the database
- Verify it was added successfully

#### Option B: Use Prisma Studio (Visual)

```bash
npm run db:studio
```

1. Open `LinkedInAccount` model
2. Click "Add record"
3. Fill in:

| Field | Value |
|-------|-------|
| `email` | scrapinglinkedin868@gmail.com |
| `linkedinEmail` | scrapinglinkedin868@gmail.com |
| `encryptedPassword` | bd42aca9f4f83f6d59deb1c74b4179a4:07c2b597c2cea3610af9b54e02ca1532:df70d15c9ab90078ae5b |
| `gmailAppPassword` | pipt uugw fnet vfsz |
| `status` | ACTIVE |
| `scrapesToday` | 0 |
| `totalScrapes` | 0 |
| `failureCount` | 0 |

4. Click "Save"

#### Option C: Use SQL Directly

Connect to your PostgreSQL database and run:

```sql
INSERT INTO "LinkedInAccount" (
  id,
  email,
  linkedin_email,
  encrypted_password,
  gmail_app_password,
  status,
  scrapes_today,
  total_scrapes,
  failure_count,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'scrapinglinkedin868@gmail.com',
  'scrapinglinkedin868@gmail.com',
  'bd42aca9f4f83f6d59deb1c74b4179a4:07c2b597c2cea3610af9b54e02ca1532:df70d15c9ab90078ae5b',
  'pipt uugw fnet vfsz',
  'ACTIVE',
  0,
  0,
  0,
  NOW(),
  NOW()
);
```

---

### Step 4: Verify Setup

Once Railway redeploys with the encryption key, test in Slack:

```bash
# Check account pool status
/partnerbot linkedin-pool-stats
```

Expected output:
```
📊 LinkedIn Account Pool Stats

Total Accounts: 1
Active: 1
Available: 1 (under daily limit)
In Cooldown: 0
Disabled: 0

Daily Capacity: 75 scrapes/day
Used Today: 0
Available: 75

Total Scrapes (All Time): 0
```

---

### Step 5: Test LinkedIn Scraping

Test with a LinkedIn URL:

```bash
/partnerbot test-linkedin https://linkedin.com/in/someone/
```

**What happens:**
1. Bot selects your account from the pool
2. Logs into LinkedIn (or uses existing session)
3. If verification code needed → fetches from Gmail automatically
4. Completes login and scrapes profile
5. Returns profile data

**First run may take 30-60 seconds** (initial login + email verification)

**Subsequent runs:** 5-10 seconds (session reused)

---

## 🔍 Troubleshooting

### Issue: "SESSION_ENCRYPTION_KEY not found"

**Solution:** Make sure you added it to Railway variables and redeployed.

### Issue: "Account already exists"

**Solution:** Account is already in database. Use `/partnerbot linkedin-accounts` to view it.

### Issue: "LinkedIn security checkpoint"

**Solution:** Normal for first login. The system will:
1. Detect security checkpoint
2. Fetch verification code from Gmail
3. Enter code automatically
4. Complete login

If it still fails after 3 attempts, the account may need manual verification.

### Issue: "Gmail IMAP connection failed"

**Check:**
1. Gmail App Password is correct (16 chars, no spaces in stored value)
2. Gmail has 2FA enabled
3. "Less secure app access" is NOT enabled (we use App Passwords instead)

---

## 📊 Monitoring

### Check Account Health

```bash
# View all accounts
/partnerbot linkedin-accounts

# View pool statistics
/partnerbot linkedin-pool-stats
```

### Check Account Usage

The account tracks:
- `scrapesToday`: How many scrapes today (resets at midnight)
- `totalScrapes`: Lifetime total
- `failureCount`: Consecutive failures
- `lastUsedAt`: Last scrape timestamp
- `status`: ACTIVE, COOLDOWN, VERIFICATION_REQUIRED, BANNED

### Daily Limits

Default: **75 scrapes/day per account**

If you need more:
1. Add more accounts (up to 12 recommended)
2. Or increase `LINKEDIN_DAILY_LIMIT_PER_ACCOUNT` in Railway (risky)

---

## 🚀 Next Steps

### Scale to 12 Accounts

Once this account is working:
1. Create 11 more burner LinkedIn accounts
2. Set up Gmail accounts with App Passwords
3. Add each using Option A, B, or C above

**Capacity with 12 accounts:**
- 12 accounts × 75 scrapes/day = **900 scrapes/day**
- Enough for 100+ partners/day (most need ~5 scrapes)

### Integrate with Onboarding

The account pool is already integrated! When a partner shares their LinkedIn URL during onboarding:

1. Bot automatically selects an available account
2. Scrapes their profile
3. Falls back to Tavily if LinkedIn fails
4. Continues with research pipeline

**No additional setup needed!** ✨

---

## 📝 Summary

**Status:** ✅ Ready to deploy

**What you have:**
- ✅ Encryption key generated
- ✅ Password encrypted
- ✅ Account details prepared
- ✅ Helper scripts created

**What to do:**
1. Add `SESSION_ENCRYPTION_KEY` to Railway
2. Push database schema (`npm run db:push`)
3. Add account (Option A, B, or C)
4. Test (`/partnerbot linkedin-pool-stats`)
5. Test scraping (`/partnerbot test-linkedin <url>`)

**Time to complete:** ~5 minutes

---

## 🎉 Done!

Once tested, your LinkedIn scraping is production-ready and integrated with the onboarding flow!

For questions, see:
- [LinkedIn Session Manager Setup](./LINKEDIN_SESSION_MANAGER_SETUP.md)
- [LinkedIn Session Manager Quick Start](./LINKEDIN_SESSION_MANAGER_QUICKSTART.md)

