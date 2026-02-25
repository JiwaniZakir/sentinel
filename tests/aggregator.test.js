'use strict';

/**
 * Tests for src/services/research/aggregator.js
 *
 * generateAIContext, generateSummaryCard, generateTalkingPoints,
 * isResearchFresh, and mergeResearch are all pure functions.
 *
 * The module also requires linkedin/perplexity/tavily services but
 * never calls them from the functions under test, so we stub them.
 */

jest.mock('../src/services/research/linkedin', () => ({}));
jest.mock('../src/services/research/perplexity', () => ({}));
jest.mock('../src/services/research/tavily', () => ({}));

const {
  generateAIContext,
  generateSummaryCard,
  generateTalkingPoints,
  isResearchFresh,
  mergeResearch,
} = require('../src/services/research/aggregator');

// Helpers
function makeResearchSummary(overrides = {}) {
  return {
    profile: {
      name: 'Alice Smith',
      headline: 'Partner at Acme VC',
      currentCompany: 'Acme VC',
      currentTitle: 'General Partner',
      location: 'New York',
      about: 'Experienced investor focused on deep tech.',
    },
    experiences: [
      { title: 'General Partner', company: 'Acme VC', duration: '3 years', description: 'Led fund 3.' },
      { title: 'Associate', company: 'Beta Capital', duration: '2 years', description: null },
    ],
    educations: [
      { school: 'MIT', degree: 'B.S.', field: 'Computer Science' },
    ],
    highlights: [
      { type: 'news', content: 'Alice led a $50M Series B for StartupX.' },
    ],
    firmInfo: {
      overview: 'Acme VC is a leading early-stage fund.',
      portfolio: 'StartupX, TechY',
    },
    socialLinks: {
      twitter: 'https://twitter.com/alice',
      substack: 'https://alice.substack.com',
      github: 'https://github.com/alice',
    },
    sources: ['linkedin', 'perplexity_person'],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateAIContext
// ---------------------------------------------------------------------------

describe('generateAIContext', () => {
  test('returns empty string for null input', () => {
    expect(generateAIContext(null)).toBe('');
  });

  test('includes the person name', () => {
    const ctx = generateAIContext(makeResearchSummary());
    expect(ctx).toContain('Alice Smith');
  });

  test('includes the headline', () => {
    const ctx = generateAIContext(makeResearchSummary());
    expect(ctx).toContain('Partner at Acme VC');
  });

  test('includes career history section', () => {
    const ctx = generateAIContext(makeResearchSummary());
    expect(ctx).toContain('Career History');
    expect(ctx).toContain('General Partner');
  });

  test('includes education section', () => {
    const ctx = generateAIContext(makeResearchSummary());
    expect(ctx).toContain('Education');
    expect(ctx).toContain('MIT');
  });

  test('includes highlights', () => {
    const ctx = generateAIContext(makeResearchSummary());
    expect(ctx).toContain('NEWS');
    expect(ctx).toContain('StartupX');
  });

  test('includes firm information', () => {
    const ctx = generateAIContext(makeResearchSummary());
    expect(ctx).toContain('Acme VC is a leading early-stage fund');
  });

  test('includes social links when present', () => {
    const ctx = generateAIContext(makeResearchSummary());
    expect(ctx).toContain('twitter.com/alice');
    expect(ctx).toContain('alice.substack.com');
  });

  test('returns a string even when all optional fields are missing', () => {
    const minimal = { profile: { name: 'Bob' } };
    const ctx = generateAIContext(minimal);
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
  });

  test('truncates long experience descriptions to 200 chars', () => {
    const longDesc = 'x'.repeat(300);
    const summary = makeResearchSummary({
      experiences: [{ title: 'CEO', company: 'Corp', duration: '1 year', description: longDesc }],
    });
    const ctx = generateAIContext(summary);
    // The truncated description + '...' should be present, not the full 300-char string
    expect(ctx).toContain('...');
    expect(ctx).not.toContain(longDesc);
  });
});

// ---------------------------------------------------------------------------
// generateSummaryCard
// ---------------------------------------------------------------------------

describe('generateSummaryCard', () => {
  test('returns null for null input', () => {
    expect(generateSummaryCard(null)).toBeNull();
  });

  test('returns an object with the correct top-level shape', () => {
    const card = generateSummaryCard(makeResearchSummary());
    expect(card).toMatchObject({
      name: 'Alice Smith',
      company: 'Acme VC',
      location: 'New York',
    });
  });

  test('includes experienceCount', () => {
    const card = generateSummaryCard(makeResearchSummary());
    expect(card.experienceCount).toBe(2);
  });

  test('topExperiences is limited to 3 entries', () => {
    const summary = makeResearchSummary({
      experiences: Array.from({ length: 6 }, (_, i) => ({
        title: `Role ${i}`,
        company: `Company ${i}`,
        duration: '1 year',
      })),
    });
    const card = generateSummaryCard(summary);
    expect(card.topExperiences).toHaveLength(3);
  });

  test('education is limited to 2 entries', () => {
    const summary = makeResearchSummary({
      educations: [
        { school: 'MIT', degree: 'B.S.' },
        { school: 'Stanford', degree: 'M.S.' },
        { school: 'Harvard', degree: 'PhD' },
      ],
    });
    const card = generateSummaryCard(summary);
    expect(card.education).toHaveLength(2);
  });

  test('socialLinks is present', () => {
    const card = generateSummaryCard(makeResearchSummary());
    expect(card.socialLinks.twitter).toBe('https://twitter.com/alice');
  });

  test('sources array is populated', () => {
    const card = generateSummaryCard(makeResearchSummary());
    expect(card.sources).toEqual(expect.arrayContaining(['linkedin']));
  });
});

// ---------------------------------------------------------------------------
// generateTalkingPoints
// ---------------------------------------------------------------------------

describe('generateTalkingPoints', () => {
  test('returns an empty array for null input', () => {
    expect(generateTalkingPoints(null)).toEqual([]);
  });

  test('adds a career point when there are multiple experiences with different companies', () => {
    const points = generateTalkingPoints(makeResearchSummary());
    const careerPoint = points.find(p => p.type === 'career');
    expect(careerPoint).toBeDefined();
    expect(careerPoint.content).toContain('Beta Capital');
    expect(careerPoint.content).toContain('Acme VC');
  });

  test('adds an education point when educations are present', () => {
    const points = generateTalkingPoints(makeResearchSummary());
    const eduPoint = points.find(p => p.type === 'education');
    expect(eduPoint).toBeDefined();
    expect(eduPoint.content).toContain('MIT');
  });

  test('adds a content creator point when Substack is present', () => {
    const points = generateTalkingPoints(makeResearchSummary());
    const contentPoint = points.find(p => p.type === 'content');
    expect(contentPoint).toBeDefined();
    expect(contentPoint.content.toLowerCase()).toContain('substack');
  });

  test('adds a firm point when portfolio is present', () => {
    const points = generateTalkingPoints(makeResearchSummary());
    const firmPoint = points.find(p => p.type === 'firm');
    expect(firmPoint).toBeDefined();
  });

  test('adds a news highlight point when highlights include type "news"', () => {
    const points = generateTalkingPoints(makeResearchSummary());
    const newsPoint = points.find(p => p.type === 'news');
    expect(newsPoint).toBeDefined();
  });

  test('does not add career point when all experiences are at the same company', () => {
    const summary = makeResearchSummary({
      experiences: [
        { title: 'CEO', company: 'Acme', duration: '3 yr' },
        { title: 'VP', company: 'Acme', duration: '2 yr' },
      ],
    });
    const points = generateTalkingPoints(summary);
    expect(points.find(p => p.type === 'career')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isResearchFresh
// ---------------------------------------------------------------------------

describe('isResearchFresh', () => {
  test('returns false for null input', () => {
    expect(isResearchFresh(null)).toBe(false);
  });

  test('returns false when generatedAt is missing', () => {
    expect(isResearchFresh({})).toBe(false);
  });

  test('returns true for research generated right now', () => {
    const summary = { generatedAt: new Date().toISOString() };
    expect(isResearchFresh(summary)).toBe(true);
  });

  test('returns true for research generated within maxAgeDays', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const summary = { generatedAt: fiveDaysAgo.toISOString() };
    expect(isResearchFresh(summary, 30)).toBe(true);
  });

  test('returns false for research older than maxAgeDays', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const summary = { generatedAt: sixtyDaysAgo.toISOString() };
    expect(isResearchFresh(summary, 30)).toBe(false);
  });

  test('uses 30 days as the default maxAgeDays', () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const summary = { generatedAt: thirtyOneDaysAgo.toISOString() };
    expect(isResearchFresh(summary)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergeResearch
// ---------------------------------------------------------------------------

describe('mergeResearch', () => {
  test('returns newResearch when existing is null', () => {
    const newR = makeResearchSummary();
    expect(mergeResearch(null, newR)).toBe(newR);
  });

  test('returns existing when newResearch is null', () => {
    const existing = makeResearchSummary();
    expect(mergeResearch(existing, null)).toBe(existing);
  });

  test('merges profile fields (new overrides existing for same keys)', () => {
    const existing = makeResearchSummary({ profile: { name: 'Old Name', headline: 'Old Headline' } });
    const newR = makeResearchSummary({ profile: { name: 'New Name' } });
    const merged = mergeResearch(existing, newR);
    expect(merged.profile.name).toBe('New Name');
  });

  test('prefers newResearch experiences over existing', () => {
    const existing = makeResearchSummary({ experiences: [{ title: 'Old Role', company: 'OldCo' }] });
    const newR = makeResearchSummary({
      experiences: [{ title: 'New Role', company: 'NewCo' }],
    });
    const merged = mergeResearch(existing, newR);
    expect(merged.experiences[0].company).toBe('NewCo');
  });

  test('concatenates highlights from both', () => {
    const existing = makeResearchSummary({
      highlights: [{ type: 'news', content: 'Old news' }],
    });
    const newR = makeResearchSummary({
      highlights: [{ type: 'deals', content: 'New deals' }],
    });
    const merged = mergeResearch(existing, newR);
    expect(merged.highlights).toHaveLength(2);
  });

  test('deduplicates sources', () => {
    const existing = makeResearchSummary({ sources: ['linkedin', 'perplexity_person'] });
    const newR = makeResearchSummary({ sources: ['linkedin', 'wikipedia_person'] });
    const merged = mergeResearch(existing, newR);
    const linkedinOccurrences = merged.sources.filter(s => s === 'linkedin').length;
    expect(linkedinOccurrences).toBe(1);
  });

  test('updates generatedAt on the merged result', () => {
    const before = Date.now();
    const existing = makeResearchSummary();
    const newR = makeResearchSummary();
    const merged = mergeResearch(existing, newR);
    const mergedTime = new Date(merged.generatedAt).getTime();
    expect(mergedTime).toBeGreaterThanOrEqual(before);
  });

  test('merges socialLinks from both (new overrides on conflict)', () => {
    const existing = makeResearchSummary({ socialLinks: { twitter: 'https://twitter.com/old' } });
    const newR = makeResearchSummary({ socialLinks: { twitter: 'https://twitter.com/new', github: 'https://github.com/alice' } });
    const merged = mergeResearch(existing, newR);
    expect(merged.socialLinks.twitter).toBe('https://twitter.com/new');
    expect(merged.socialLinks.github).toBe('https://github.com/alice');
  });
});
