-- LinkedIn Account Setup SQL
-- Replace placeholder values with your actual account details

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
  last_scrape_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'your_email@example.com',
  'your_linkedin_email@example.com',
  'your_encrypted_password',
  'your_gmail_app_password',
  'ACTIVE',
  0,
  0,
  0,
  NULL,
  NOW(),
  NOW()
);

-- To generate encrypted_password, use the helper script:
--   SESSION_ENCRYPTION_KEY=<your-key> node scripts/add_linkedin_account.js
--
-- Or use Prisma Studio:
--   npm run db:studio

-- Verify the account was added:
SELECT id, email, linkedin_email, status, scrapes_today, total_scrapes, failure_count, created_at
FROM "LinkedInAccount"
WHERE email = 'your_email@example.com';
