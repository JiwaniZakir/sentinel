-- LinkedIn Account Setup SQL
-- Account: scrapinglinkedin868@gmail.com

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
  'scrapinglinkedin868@gmail.com',
  'scrapinglinkedin868@gmail.com',
  'bd42aca9f4f83f6d59deb1c74b4179a4:07c2b597c2cea3610af9b54e02ca1532:df70d15c9ab90078ae5b',
  'pipt uugw fnet vfsz',
  'ACTIVE',
  0,
  0,
  0,
  NULL,
  NOW(),
  NOW()
);

-- Verify the account was added:
SELECT id, email, linkedin_email, status, scrapes_today, total_scrapes, failure_count, created_at
FROM "LinkedInAccount"
WHERE email = 'scrapinglinkedin868@gmail.com';

