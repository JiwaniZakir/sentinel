# LinkedIn Account Setup - Quick Reference

## 1. Generate Encryption Key

In Slack, run:
```
/partnerbot linkedin-generate-key
```

Copy the generated key and add it to your environment:
```
SESSION_ENCRYPTION_KEY=<your-generated-64-char-hex-key>
```

**Add this to Railway -> Variables -> SESSION_ENCRYPTION_KEY**

---

## 2. Prepare Account Details

You will need:
- **Gmail Email**: your_email@example.com
- **LinkedIn Email**: your_linkedin_email@example.com
- **Gmail App Password**: Generate one at https://myaccount.google.com/apppasswords
- **LinkedIn Password**: Your LinkedIn account password (will be encrypted)

---

## 3. Quick Setup (3 Steps)

### Step 1: Add Encryption Key to Railway
```
SESSION_ENCRYPTION_KEY=<your-generated-key>
```

### Step 2: Push Database Schema
```bash
npm run db:push
```

### Step 3: Add Account (Choose One)

**Option A: Helper Script**
```bash
SESSION_ENCRYPTION_KEY=<your-key> node scripts/add_linkedin_account.js
```

**Option B: Prisma Studio**
```bash
npm run db:studio
```
Then add a record with your account details.

**Option C: SQL**
See `scripts/add_linkedin_account.sql`

---

## 4. Verify Setup

```bash
# In Slack
/partnerbot linkedin-pool-stats
/partnerbot test-linkedin https://linkedin.com/in/someone/
```

---

## Full Documentation

- [Complete Setup Guide](./docs/LINKEDIN_ACCOUNT_SETUP_COMPLETE.md)
- [Session Manager Setup](./docs/LINKEDIN_SESSION_MANAGER_SETUP.md)
- [Quick Start Guide](./docs/LINKEDIN_SESSION_MANAGER_QUICKSTART.md)
