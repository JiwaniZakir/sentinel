'use strict';

/**
 * Tests for src/utils/researchQueries.js
 *
 * All exported functions are pure helpers with no I/O.
 */

const {
  getPersonResearchQuery,
  getFirmResearchQuery,
  getSocialProfileQuery,
  CONTENT_KEYWORDS,
  categorizeSearchResults,
  formatResearchForSlack,
} = require('../src/utils/researchQueries');

// ---------------------------------------------------------------------------
// getPersonResearchQuery
// ---------------------------------------------------------------------------

describe('getPersonResearchQuery', () => {
  test('includes the person name in the query', () => {
    const query = getPersonResearchQuery('Alice Smith', 'Acme VC', 'Partner');
    expect(query).toContain('Alice Smith');
  });

  test('includes the firm name in the query', () => {
    const query = getPersonResearchQuery('Alice Smith', 'Acme VC', 'Partner');
    expect(query).toContain('Acme VC');
  });

  test('includes the role when provided', () => {
    const query = getPersonResearchQuery('Alice Smith', 'Acme VC', 'Partner');
    expect(query).toContain('Partner');
  });

  test('uses "professional" as the default role when none provided', () => {
    const query = getPersonResearchQuery('Alice Smith', 'Acme VC');
    expect(query).toContain('professional');
  });

  test('returns a non-empty string', () => {
    const query = getPersonResearchQuery('Alice', 'Firm');
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getFirmResearchQuery
// ---------------------------------------------------------------------------

describe('getFirmResearchQuery', () => {
  test('includes the firm name in the query', () => {
    const query = getFirmResearchQuery('Acme Ventures', 'VC');
    expect(query).toContain('Acme Ventures');
  });

  test('includes VC-specific sections when firmType is VC', () => {
    const query = getFirmResearchQuery('Sequoia', 'VC');
    expect(query.toLowerCase()).toMatch(/fund size|portfolio|general partner/i);
  });

  test('includes CORPORATE-specific sections when firmType is CORPORATE', () => {
    const query = getFirmResearchQuery('BigCo', 'CORPORATE');
    expect(query.toLowerCase()).toMatch(/innovation|startup|strategic/i);
  });

  test('does not include VC-specific text for CORPORATE firms', () => {
    const query = getFirmResearchQuery('BigCo', 'CORPORATE');
    expect(query).not.toContain('Fund size');
  });

  test('returns a non-empty string for any firmType', () => {
    const query = getFirmResearchQuery('SomeFirm', 'OTHER');
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getSocialProfileQuery
// ---------------------------------------------------------------------------

describe('getSocialProfileQuery', () => {
  test('includes the person name', () => {
    const q = getSocialProfileQuery('Alice Smith', 'Acme VC');
    expect(q).toContain('Alice Smith');
  });

  test('includes the firm name', () => {
    const q = getSocialProfileQuery('Alice Smith', 'Acme VC');
    expect(q).toContain('Acme VC');
  });

  test('mentions common social platforms', () => {
    const q = getSocialProfileQuery('Alice', 'Firm');
    // Should reference at least one known platform
    expect(q).toMatch(/twitter|substack|github|podcast/i);
  });
});

// ---------------------------------------------------------------------------
// CONTENT_KEYWORDS
// ---------------------------------------------------------------------------

describe('CONTENT_KEYWORDS', () => {
  test('is an object', () => {
    expect(typeof CONTENT_KEYWORDS).toBe('object');
  });

  test('contains twitter keywords', () => {
    expect(CONTENT_KEYWORDS.twitter).toEqual(expect.arrayContaining(['twitter.com']));
  });

  test('contains substack keywords', () => {
    expect(CONTENT_KEYWORDS.substack).toEqual(expect.arrayContaining(['substack.com']));
  });

  test('contains github keywords', () => {
    expect(CONTENT_KEYWORDS.github).toEqual(expect.arrayContaining(['github.com']));
  });
});

// ---------------------------------------------------------------------------
// categorizeSearchResults
// ---------------------------------------------------------------------------

describe('categorizeSearchResults', () => {
  test('categorizes a Twitter URL correctly', () => {
    const results = [{ url: 'https://twitter.com/alice', title: 'Alice on Twitter' }];
    const cat = categorizeSearchResults(results);
    expect(cat.twitter).not.toBeNull();
    expect(cat.twitter.url).toBe('https://twitter.com/alice');
  });

  test('categorizes a Substack URL correctly', () => {
    const results = [{ url: 'https://alice.substack.com', title: 'Alice Newsletter' }];
    const cat = categorizeSearchResults(results);
    expect(cat.substack).not.toBeNull();
    expect(cat.substack.url).toBe('https://alice.substack.com');
  });

  test('categorizes a GitHub URL correctly', () => {
    const results = [{ url: 'https://github.com/alice', title: 'Alice on GitHub' }];
    const cat = categorizeSearchResults(results);
    expect(cat.github).not.toBeNull();
  });

  test('puts a URL with no recognisable keywords into the "other" bucket', () => {
    // The URL must not match any keyword in CONTENT_KEYWORDS (no "blog", "twitter", etc.)
    const results = [{ url: 'https://randomprofile.example.com/alice', title: 'Alice profile' }];
    const cat = categorizeSearchResults(results);
    expect(cat.other).toHaveLength(1);
    expect(cat.other[0].url).toBe('https://randomprofile.example.com/alice');
  });

  test('matches a URL that contains "blog" to the blog category, not other', () => {
    const results = [{ url: 'https://somerandomblog.io/alice', title: 'Random blog' }];
    const cat = categorizeSearchResults(results);
    expect(cat.blog).not.toBeNull();
    expect(cat.blog.url).toBe('https://somerandomblog.io/alice');
    expect(cat.other).toHaveLength(0);
  });

  test('skips LinkedIn URLs (not categorized)', () => {
    const results = [
      { url: 'https://www.linkedin.com/in/alice', title: 'Alice on LinkedIn' },
    ];
    const cat = categorizeSearchResults(results);
    // LinkedIn should not appear in any specific category or "other"
    expect(cat.other).toHaveLength(0);
  });

  test('only stores the first match per category', () => {
    const results = [
      { url: 'https://twitter.com/alice', title: 'Alice' },
      { url: 'https://twitter.com/alice_extra', title: 'Alice extra' },
    ];
    const cat = categorizeSearchResults(results);
    expect(cat.twitter.url).toBe('https://twitter.com/alice');
  });

  test('handles an empty results array without throwing', () => {
    const cat = categorizeSearchResults([]);
    expect(cat.twitter).toBeNull();
    expect(cat.other).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// formatResearchForSlack
// ---------------------------------------------------------------------------

describe('formatResearchForSlack', () => {
  test('returns a fallback string when passed null', () => {
    expect(formatResearchForSlack(null)).toBe('No research data available.');
  });

  test('includes the person name when present', () => {
    const summary = {
      profile: { name: 'Alice Smith', headline: 'Investor' },
    };
    const result = formatResearchForSlack(summary);
    expect(result).toContain('Alice Smith');
  });

  test('includes the headline when present', () => {
    const summary = {
      profile: { name: 'Alice', headline: 'Partner at Acme VC' },
    };
    const result = formatResearchForSlack(summary);
    expect(result).toContain('Partner at Acme VC');
  });

  test('includes highlights when available', () => {
    const summary = {
      profile: { name: 'Alice' },
      highlights: [{ type: 'news', content: 'Alice was featured in TechCrunch' }],
    };
    const result = formatResearchForSlack(summary);
    expect(result).toContain('TechCrunch');
  });

  test('includes social links when available', () => {
    const summary = {
      profile: { name: 'Alice' },
      socialLinks: { twitter: 'https://twitter.com/alice' },
    };
    const result = formatResearchForSlack(summary);
    expect(result).toContain('https://twitter.com/alice');
  });

  test('returns a non-empty string for an empty summary object', () => {
    const result = formatResearchForSlack({});
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
