# LinkedIn Account Setup - Quick Reference

## 🔑 Your Encryption Key

```
SESSION_ENCRYPTION_KEY=e547bb6cac0dc6d440d522297f5571b93ba66c1c22a2ea7ffa0a60e40fd8d167
```

**Add this to Railway → Variables → SESSION_ENCRYPTION_KEY**

---

## 📝 Your Account Details

**Gmail:** scrapinglinkedin868@gmail.com  
**LinkedIn:** scrapinglinkedin868@gmail.com  
**Gmail App Password:** pipt uugw fnet vfsz  
**Encrypted Password:** `bd42aca9f4f83f6d59deb1c74b4179a4:07c2b597c2cea3610af9b54e02ca1532:df70d15c9ab90078ae5b`

---

## ⚡ Quick Setup (3 Steps)

### 1. Add to Railway
```
SESSION_ENCRYPTION_KEY=e547bb6cac0dc6d440d522297f5571b93ba66c1c22a2ea7ffa0a60e40fd8d167
```

### 2. Push Database Schema
```bash
npm run db:push
```

### 3. Add Account (Choose One)

**Option A: Helper Script** ⭐
```bash
SESSION_ENCRYPTION_KEY=e547bb6cac0dc6d440d522297f5571b93ba66c1c22a2ea7ffa0a60e40fd8d167 node scripts/add_linkedin_account.js
```

**Option B: Prisma Studio**
```bash
npm run db:studio
```
Then add record with values from "Your Account Details" above.

**Option C: SQL**
See `scripts/add_linkedin_account.sql`

---

## ✅ Verify Setup

```bash
# In Slack
/partnerbot linkedin-pool-stats
/partnerbot test-linkedin https://linkedin.com/in/someone/
```

---

## 📚 Full Documentation

- [Complete Setup Guide](./docs/LINKEDIN_ACCOUNT_SETUP_COMPLETE.md)
- [Session Manager Setup](./docs/LINKEDIN_SESSION_MANAGER_SETUP.md)
- [Quick Start Guide](./docs/LINKEDIN_SESSION_MANAGER_QUICKSTART.md)

