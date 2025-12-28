# LinkedIn Session Manager Setup Guide

This guide walks you through setting up the LinkedIn Session Manager system with account pooling, session persistence, and email verification.

## Overview

The LinkedIn Session Manager allows the bot to:
- **Rotate across multiple LinkedIn accounts** to avoid rate limits
- **Persist sessions** for up to 30 days (reducing logins)
- **Handle email verification** automatically via Gmail IMAP
- **Track account health** and automatically manage cooldowns
- **Scale to 12+ accounts** for high-volume scraping

## Architecture

```
┌─────────────┐
│ Scrape      │
│ Request     │
└──────┬──────┘
       │
       v
┌──────────────────┐
│ Account Pool     │  ← Selects best available account
│ - Rotation       │
│ - Health checks  │
└──────┬───────────┘
       │
       v
┌──────────────────┐
│ Session Manager  │  ← Checks for valid session
│ - Cookie cache   │
│ - Encryption     │
└──────┬───────────┘
       │
       ├─ Valid session? ────> Use cached cookies
       │
       └─ No session? ──────┐
                            v
              ┌──────────────────────┐
              │ Login Flow           │
              │ 1. Submit creds      │
              │ 2. Check for verify  │
              │ 3. Get code via IMAP │
              │ 4. Submit code       │
              │ 5. Save session      │
              └──────────────────────┘
```

## Prerequisites

### 1. LinkedIn Burner Accounts

Create 1-12 LinkedIn accounts specifically for scraping:

- ⚠️ **DO NOT use your personal account**
- Use throwaway email addresses
- Complete profile setup (adds legitimacy)
- Connect with 50-100 people (optional, helps avoid detection)
- Disable 2FA on LinkedIn (we use Gmail 2FA instead)

### 2. Gmail Accounts with App Passwords

For each LinkedIn account, you need a Gmail account:

1. **Enable 2FA** on Gmail:
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "LinkedIn Bot"
   - Copy the 16-character password (spaces are okay)

### 3. Encryption Key

Generate a secure encryption key for storing passwords and cookies:

```bash
# In Slack
/partnerbot linkedin-generate-key
```

This will output a 64-character hex key. Save it securely!

## Setup Steps

### Step 1: Database Migration

The LinkedIn Session Manager adds a new `linkedin_accounts` table:

```bash
# Push schema to database
npm run db:push

# Or create a migration
npm run db:migrate
```

### Step 2: Add Environment Variables to Railway

Add these to your Railway project:

```bash
# Required: Encryption key for passwords and cookies
SESSION_ENCRYPTION_KEY=<64-char-hex-key-from-generate-command>

# Optional: Rate limiting configuration
LINKEDIN_DAILY_LIMIT_PER_ACCOUNT=75
LINKEDIN_COOLDOWN_HOURS=6
```

### Step 3: Add LinkedIn Accounts

#### Option A: Via Prisma Studio (Recommended for first account)

```bash
npm run db:studio
```

1. Open `LinkedInAccount` model
2. Click "Add record"
3. Fill in:
   - `email`: Gmail address
   - `linkedinEmail`: LinkedIn login email
   - `gmailAppPassword`: 16-char app password from Gmail
   - `encryptedPassword`: See encryption helper below
   - `status`: ACTIVE

#### Option B: Via SQL (Bulk insert)

```sql
INSERT INTO linkedin_accounts (
  id,
  email,
  linkedin_email,
  encrypted_password,
  gmail_app_password,
  status,
  scrapes_today,
  total_scrapes,
  failure_count
) VALUES (
  gen_random_uuid(),
  'burner1@gmail.com',
  'burner1@linkedin.com',
  '<encrypted-password>',
  'abcd efgh ijkl mnop',
  'ACTIVE',
  0,
  0,
  0
);
```

#### Encryption Helper Script

Create a temporary script to encrypt passwords:

```javascript
// encrypt-password.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const key = Buffer.from(process.env.SESSION_ENCRYPTION_KEY, 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

const password = process.argv[2];
console.log(encrypt(password));
```

Usage:
```bash
SESSION_ENCRYPTION_KEY=your-key node encrypt-password.js "your-linkedin-password"
```

### Step 4: Verify Setup

In Slack, run:

```
/partnerbot linkedin-accounts
```

You should see your accounts listed with status `ACTIVE`.

```
/partnerbot linkedin-pool-stats
```

Verify pool statistics show available accounts.

### Step 5: Test Scraping

Test with a sample LinkedIn profile:

```
/partnerbot test-linkedin https://www.linkedin.com/in/someone/
```

Watch the logs for:
- ✅ Account selection
- ✅ Session check (first time will login)
- ✅ Email verification (if triggered)
- ✅ Session save
- ✅ Profile data extraction

## Usage

### Monitoring Accounts

```bash
# List all accounts
/partnerbot linkedin-accounts

# View pool statistics
/partnerbot linkedin-pool-stats
```

### Managing Accounts

```bash
# Disable an account
/partnerbot linkedin-disable-account burner1@gmail.com

# Reset failures and cooldown
/partnerbot linkedin-reset-account burner1@gmail.com
```

### How It Works

#### 1. Account Selection

When a scrape is requested:
1. Filter accounts: `ACTIVE` status, not in cooldown, under daily limit
2. Sort by `lastUsedAt` (least recently used first)
3. Select the first account

#### 2. Session Management

Before scraping:
1. Check if account has valid session cookies in database
2. If yes → Load cookies into Selenium
3. If no → Trigger login flow

After scraping:
1. Extract fresh cookies from Selenium
2. Encrypt and store in database
3. Set expiry to 30 days from now

#### 3. Failure Handling

On scrape failure:
- **Rate limited** → 6-hour cooldown
- **Security checkpoint** → Mark as `VERIFICATION_REQUIRED`, 6-hour cooldown
- **3+ failures** → Mark as `BANNED`
- **Success** → Reset failure count

#### 4. Email Verification

When LinkedIn sends a verification challenge:
1. Python script detects checkpoint URL
2. Calls `waitForLinkedInCode()` via IMAP
3. Searches Gmail inbox every 3 seconds
4. Extracts 6-digit code from email
5. Submits code via Selenium
6. Continues with scrape

## Rate Limits

### Per Account
- **75 scrapes/day** (conservative, LinkedIn allows ~100-200)
- **6-hour cooldown** after verification challenge
- **30-day sessions** reduce login frequency

### Pool Capacity
With 12 accounts:
- **900 scrapes/day** total capacity
- Distributed load reduces individual account risk

## Troubleshooting

### "No available accounts"

Check pool stats:
```
/partnerbot linkedin-pool-stats
```

Common causes:
- All accounts in cooldown → Wait or add more accounts
- All accounts over daily limit → Wait for daily reset (midnight UTC)
- All accounts banned → Check logs, may need new accounts

### "Verification code not received"

1. Check Gmail App Password is correct
2. Verify Gmail IMAP is enabled
3. Check spam folder manually
4. Try generating a new App Password

### "Failed to decrypt cookies"

- `SESSION_ENCRYPTION_KEY` was changed
- Database contains cookies from a different key
- Reset the account: `/partnerbot linkedin-reset-account <email>`

### Account banned

LinkedIn bans are usually temporary (7-30 days). Options:
1. Wait for ban to lift
2. Disable account: `/partnerbot linkedin-disable-account <email>`
3. Add replacement account

## Security Best Practices

1. **Never commit credentials** to Git
2. **Use burner accounts only** - never your personal LinkedIn
3. **Rotate encryption key** if leaked (requires re-encrypting all data)
4. **Monitor account health** regularly
5. **Keep backup accounts** ready for replacements
6. **Use unique passwords** for each burner account
7. **Enable Railway secrets** for sensitive env vars

## Scaling to 12 Accounts

1. Create 12 burner LinkedIn accounts
2. Create 12 Gmail accounts with App Passwords
3. Add all to database (use bulk SQL insert)
4. Deploy to Railway
5. Monitor pool stats to ensure distribution

With 12 accounts:
- Risk is distributed (one ban doesn't stop scraping)
- Cooldowns are staggered (always accounts available)
- Daily capacity is 900 scrapes

## Performance

### Session Reuse
- First scrape: ~30s (login + scrape)
- Subsequent scrapes: ~10s (cached session)
- **3x speed improvement** with session reuse

### Email Verification
- Adds ~30-60s when triggered
- Fully automated (no manual intervention)
- Rare after first successful login per account

## Maintenance

### Daily Tasks
- Check pool stats
- Verify available accounts > 0

### Weekly Tasks
- Review account health
- Reset any stuck accounts
- Add new accounts if needed

### Monthly Tasks
- Rotate out banned accounts
- Update documentation
- Review rate limits (adjust if needed)

## Advanced Configuration

### Custom Rate Limits

```bash
# Railway environment variables
LINKEDIN_DAILY_LIMIT_PER_ACCOUNT=100  # Higher limit (riskier)
LINKEDIN_COOLDOWN_HOURS=12            # Longer cooldown (safer)
```

### Proxy Rotation

For additional anonymity, consider adding proxy rotation:

```javascript
// In setup_driver() in scrape_linkedin.py
chrome_options.add_argument('--proxy-server=http://proxy.example.com:8080')
```

Proxies help avoid IP-based rate limiting on Railway.

## Support

For issues:
1. Check Railway logs
2. Run `/partnerbot linkedin-pool-stats`
3. Review account status
4. Check this documentation

Common log patterns:
- "No available accounts" → Add more accounts or wait for reset
- "Security checkpoint" → Verification triggered (automated)
- "Session expired" → Normal, will re-login automatically

