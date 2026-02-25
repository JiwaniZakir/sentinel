'use strict';

/**
 * Tests for the pure helper functions in src/services/research/profileAggregator.js
 *
 * buildPersonProfile and buildFirmProfile are async functions that hit the DB
 * and are not tested here. We focus only on the deterministic extraction and
 * merging helpers that the module exports.
 *
 * External dependencies (DB, qualityScorer, logger) are mocked so we never
 * touch the database or make network calls.
 */

jest.mock('../src/services/database', () => ({
  partners: {
    findById: jest.fn(),
    update: jest.fn(),
    updateById: jest.fn(),
  },
  prisma: {
    personProfile: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    firmProfile: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../src/services/research/qualityScorer', () => ({
  calculateProfileQualityScore: jest.fn(() => 0.75),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const {
  extractLinkedInData,
  extractPerplexityPersonData,
  extractPerplexityFirmData,
  extractSocialData,
  extractWikipediaPersonData,
  extractWikipediaFirmData,
} = require('../src/services/research/profileAggregator');

// ---------------------------------------------------------------------------
// extractLinkedInData
// ---------------------------------------------------------------------------

describe('extractLinkedInData', () => {
  test('returns null when result is not successful', () => {
    expect(extractLinkedInData({ success: false })).toBeNull();
    expect(extractLinkedInData(null)).toBeNull();
    expect(extractLinkedInData(undefined)).toBeNull();
  });

  test('extracts core fields from a successful result', () => {
    const result = {
      success: true,
      data: {
        name: 'Alice Smith',
        headline: 'GP at Acme VC',
        about: 'Deep tech investor.',
        location: 'New York',
        currentCompany: 'Acme VC',
        currentTitle: 'General Partner',
        photoUrl: 'https://example.com/photo.jpg',
        experiences: [{ title: 'GP', company: 'Acme VC' }],
        education: [{ school: 'MIT', degree: 'B.S.' }],
        skills: ['Investing', 'Board governance'],
      },
    };
    const data = extractLinkedInData(result);
    expect(data.name).toBe('Alice Smith');
    expect(data.headline).toBe('GP at Acme VC');
    expect(data.about).toBe('Deep tech investor.');
    expect(data.location).toBe('New York');
    expect(data.currentCompany).toBe('Acme VC');
    expect(data.currentTitle).toBe('General Partner');
    expect(data.photoUrl).toBe('https://example.com/photo.jpg');
    expect(data.experiences).toHaveLength(1);
    expect(data.skills).toEqual(['Investing', 'Board governance']);
  });

  test('defaults experiences and skills to empty arrays when missing', () => {
    const result = { success: true, data: { name: 'Alice' } };
    const data = extractLinkedInData(result);
    expect(data.experiences).toEqual([]);
    expect(data.skills).toEqual([]);
  });

  test('accepts "educations" key as well as "education"', () => {
    const result = {
      success: true,
      data: {
        educations: [{ school: 'Stanford', degree: 'M.S.' }],
      },
    };
    const data = extractLinkedInData(result);
    expect(data.educations).toHaveLength(1);
    expect(data.educations[0].school).toBe('Stanford');
  });
});

// ---------------------------------------------------------------------------
// extractPerplexityPersonData
// ---------------------------------------------------------------------------

describe('extractPerplexityPersonData', () => {
  test('returns null when result is not successful', () => {
    expect(extractPerplexityPersonData(null)).toBeNull();
    expect(extractPerplexityPersonData({ success: false })).toBeNull();
  });

  test('extracts summary and thesis', () => {
    const result = {
      success: true,
      data: {
        summary: 'Alice is a seasoned investor.',
        thesis: 'Focus on climate tech.',
        newsArticles: null,
        deals: null,
        articles: null,
        podcasts: null,
        speaking: null,
        awards: null,
      },
    };
    const data = extractPerplexityPersonData(result);
    expect(data.summary).toBe('Alice is a seasoned investor.');
    expect(data.thesis).toBe('Focus on climate tech.');
  });

  test('returns empty arrays for missing list fields', () => {
    const result = { success: true, data: {} };
    const data = extractPerplexityPersonData(result);
    expect(Array.isArray(data.news)).toBe(true);
    expect(Array.isArray(data.deals)).toBe(true);
    expect(Array.isArray(data.articles)).toBe(true);
    expect(Array.isArray(data.podcasts)).toBe(true);
    expect(Array.isArray(data.speaking)).toBe(true);
    expect(Array.isArray(data.awards)).toBe(true);
  });

  test('parses newsArticles text into an array', () => {
    const result = {
      success: true,
      data: { newsArticles: 'Alice featured in TechCrunch' },
    };
    const data = extractPerplexityPersonData(result);
    expect(Array.isArray(data.news)).toBe(true);
    expect(data.news.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// extractPerplexityFirmData
// ---------------------------------------------------------------------------

describe('extractPerplexityFirmData', () => {
  test('returns null when result is not successful', () => {
    expect(extractPerplexityFirmData(null)).toBeNull();
    expect(extractPerplexityFirmData({ success: false })).toBeNull();
  });

  test('extracts overview, headquarters, and foundedYear', () => {
    const result = {
      success: true,
      data: {
        overview: 'Top-tier early stage fund.',
        headquarters: 'San Francisco',
        foundedYear: 2010,
        sectors: ['Fintech', 'AI'],
        stages: ['seed', 'Series A'],
        exits: [],
      },
    };
    const data = extractPerplexityFirmData(result);
    expect(data.overview).toBe('Top-tier early stage fund.');
    expect(data.headquarters).toBe('San Francisco');
    expect(data.foundedYear).toBe(2010);
    expect(data.sectors).toEqual(['Fintech', 'AI']);
  });

  test('defaults sectors, stages, and exits to empty arrays when missing', () => {
    const result = { success: true, data: {} };
    const data = extractPerplexityFirmData(result);
    expect(data.sectors).toEqual([]);
    expect(data.stages).toEqual([]);
    expect(data.exits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractSocialData
// ---------------------------------------------------------------------------

describe('extractSocialData', () => {
  test('returns null when result is not successful', () => {
    expect(extractSocialData(null)).toBeNull();
    expect(extractSocialData({ success: false })).toBeNull();
  });

  test('extracts known social platforms', () => {
    const result = {
      success: true,
      data: {
        profiles: {
          twitter: { url: 'https://twitter.com/alice' },
          substack: { url: 'https://alice.substack.com' },
          github: { url: 'https://github.com/alice' },
          medium: null,
          youtube: null,
          podcast: null,
          blog: null,
        },
      },
    };
    const data = extractSocialData(result);
    expect(data.twitter.url).toBe('https://twitter.com/alice');
    expect(data.substack.url).toBe('https://alice.substack.com');
    expect(data.github.url).toBe('https://github.com/alice');
    expect(data.medium).toBeNull();
  });

  test('returns undefined for platforms not present in the profiles object', () => {
    const result = {
      success: true,
      data: { profiles: {} },
    };
    const data = extractSocialData(result);
    expect(data.twitter).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// extractWikipediaPersonData
// ---------------------------------------------------------------------------

describe('extractWikipediaPersonData', () => {
  test('returns null when result is not successful', () => {
    expect(extractWikipediaPersonData(null)).toBeNull();
    expect(extractWikipediaPersonData({ success: false })).toBeNull();
  });

  test('extracts summary, url, and categories', () => {
    const result = {
      success: true,
      data: {
        summary: 'Alice is a notable investor.',
        url: 'https://en.wikipedia.org/wiki/Alice_Smith',
        categories: ['American investors', 'Living people'],
        career_info: { raw_career: 'Alice started at Goldman Sachs.' },
        education: { raw_education: 'B.S. from MIT.' },
      },
    };
    const data = extractWikipediaPersonData(result);
    expect(data.summary).toBe('Alice is a notable investor.');
    expect(data.url).toBe('https://en.wikipedia.org/wiki/Alice_Smith');
    expect(data.categories).toEqual(['American investors', 'Living people']);
    expect(data.careerInfo).toBe('Alice started at Goldman Sachs.');
    expect(data.education).toBe('B.S. from MIT.');
  });

  test('location is always null (Wikipedia does not supply it)', () => {
    const result = { success: true, data: { summary: 'S', url: 'U' } };
    expect(extractWikipediaPersonData(result).location).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractWikipediaFirmData
// ---------------------------------------------------------------------------

describe('extractWikipediaFirmData', () => {
  test('returns null when result is not successful', () => {
    expect(extractWikipediaFirmData(null)).toBeNull();
    expect(extractWikipediaFirmData({ success: false })).toBeNull();
  });

  test('extracts description and url', () => {
    const result = {
      success: true,
      data: {
        summary: 'Acme VC was founded in 2010.',
        url: 'https://en.wikipedia.org/wiki/Acme_VC',
        categories: ['Venture capital firms'],
        company_info: {},
      },
    };
    const data = extractWikipediaFirmData(result);
    expect(data.description).toBe('Acme VC was founded in 2010.');
    expect(data.url).toBe('https://en.wikipedia.org/wiki/Acme_VC');
  });

  test('extracts foundedYear from founding_info text', () => {
    const result = {
      success: true,
      data: {
        summary: 'A VC firm.',
        url: 'https://en.wikipedia.org/wiki/Acme',
        company_info: {
          founding_info: 'Founded in 2005 by two former bankers.',
        },
      },
    };
    const data = extractWikipediaFirmData(result);
    expect(data.foundedYear).toBe(2005);
  });

  test('foundedYear is null when no year in founding_info', () => {
    const result = {
      success: true,
      data: {
        summary: 'A VC firm.',
        url: 'https://en.wikipedia.org/wiki/Acme',
        company_info: { founding_info: 'Founded recently.' },
      },
    };
    const data = extractWikipediaFirmData(result);
    expect(data.foundedYear).toBeNull();
  });

  test('extracts headquarters from summary using "headquartered in" pattern', () => {
    const result = {
      success: true,
      data: {
        summary: 'Acme VC is headquartered in San Francisco, California.',
        url: 'https://en.wikipedia.org/wiki/Acme',
        company_info: {},
      },
    };
    const data = extractWikipediaFirmData(result);
    expect(data.headquarters).toBe('San Francisco');
  });

  test('headquarters is null when no matching pattern found', () => {
    const result = {
      success: true,
      data: {
        summary: 'Acme VC is a great firm.',
        url: 'https://en.wikipedia.org/wiki/Acme',
        company_info: {},
      },
    };
    const data = extractWikipediaFirmData(result);
    expect(data.headquarters).toBeNull();
  });
});
