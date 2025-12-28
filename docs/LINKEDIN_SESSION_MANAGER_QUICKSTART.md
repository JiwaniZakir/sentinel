# LinkedIn Session Manager - Quick Start

Get up and running with the LinkedIn Session Manager in 15 minutes.

## What You Need

1. **1 burner LinkedIn account** (NOT your personal account)
2. **1 Gmail account** with 2FA enabled
3. **Railway access** to your bot deployment

## 5-Minute Setup

### Step 1: Generate Encryption Key (1 min)

In Slack:
```
/partnerbot linkedin-generate-key
```

Copy the output (64-character hex key).

### Step 2: Add to Railway (2 min)

Go to your Railway project → Variables → Add:

```
SESSION_ENCRYPTION_KEY=<paste-key-here>
```

Deploy the changes.

### Step 3: Get Gmail App Password (3 min)

1. Go to https://myaccount.google.com/apppasswords
2. Sign in to your Gmail
3. Create app password → Name: "LinkedIn Bot"
4. Copy the 16-character password

### Step 4: Encrypt LinkedIn Password (2 min)

Create a file `encrypt.js`:

```javascript
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const key = Buffer.from('YOUR_SESSION_ENCRYPTION_KEY', 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

console.log(encrypt(process.argv[2]));
```

Run:
```bash
node encrypt.js "your-linkedin-password"
```

Copy the output.

### Step 5: Add Account to Database (7 min)

```bash
npm run db:push  # If you haven't migrated yet
npm run db:studio
```

In Prisma Studio:
1. Open `LinkedInAccount` model
2. Click "Add record"
3. Fill in:
   - **id**: (auto-generated, leave blank)
   - **email**: `your-gmail@gmail.com`
   - **linkedinEmail**: `your-linkedin@example.com`
   - **encryptedPassword**: Paste encrypted password from Step 4
   - **gmailAppPassword**: `abcd efgh ijkl mnop` (from Step 3)
   - **status**: `ACTIVE`
   - **scrapesToday**: `0`
   - **totalScrapes**: `0`
   - **failureCount**: `0`
4. Save

## Test It

In Slack:

```
/partnerbot linkedin-pool-stats
```

Should show 1 available account.

```
/partnerbot test-linkedin https://www.linkedin.com/in/someone/
```

Should successfully scrape the profile!

## What Happens Next

### First Scrape
1. Bot selects your account
2. Logs into LinkedIn
3. Scrapes the profile
4. **Saves session cookies** (encrypted in database)
5. Session lasts 30 days

### Subsequent Scrapes
1. Bot loads cached session
2. Scrapes instantly (no login needed!)
3. **3x faster** than logging in each time

### If Verification Triggered
1. LinkedIn sends code to your Gmail
2. Bot checks Gmail via IMAP
3. Extracts code automatically
4. Submits and continues
5. **Fully automated!**

## Rate Limits

With 1 account:
- **75 scrapes/day**
- 6-hour cooldown if challenged
- Sessions last 30 days

## Scaling to 12 Accounts

Want 900 scrapes/day? Add 11 more accounts:

1. Create 11 more burner LinkedIn accounts
2. Create 11 more Gmails with App Passwords
3. Repeat Step 4-5 for each account
4. Done!

See [Full Setup Guide](./LINKEDIN_SESSION_MANAGER_SETUP.md) for bulk instructions.

## Monitoring

```bash
# View all accounts
/partnerbot linkedin-accounts

# Pool stats
/partnerbot linkedin-pool-stats

# Reset a stuck account
/partnerbot linkedin-reset-account your-gmail@gmail.com
```

## Common Issues

### "No encryption key"
→ Add `SESSION_ENCRYPTION_KEY` to Railway

### "No available accounts"
→ Run `/partnerbot linkedin-pool-stats` to diagnose

### "Verification code not received"
→ Check Gmail App Password is correct

### Session expired
→ Normal! Bot will re-login automatically

## Next Steps

- ✅ Add more accounts for higher capacity
- ✅ Monitor pool stats daily
- ✅ Read [Full Setup Guide](./LINKEDIN_SESSION_MANAGER_SETUP.md)
- ✅ See [Architecture Docs](./LINKEDIN_SESSION_MANAGER_SETUP.md#architecture)

## Need Help?

1. Check Railway logs
2. Run `/partnerbot linkedin-accounts`
3. Review [Troubleshooting](./LINKEDIN_SESSION_MANAGER_SETUP.md#troubleshooting)

