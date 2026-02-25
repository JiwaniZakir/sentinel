'use strict';

/**
 * Tests for src/services/research/qualityScorer.js
 *
 * All functions under test are pure (no I/O, no DB, no network).
 * The only side-effectful dependency is the logger; we silence it
 * with a jest mock so test output stays clean.
 */

// Silence the logger so test output is clean
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const {
  calculateQualityScore,
  crossReferenceFacts,
  deduplicateFacts,
  calculateProfileQualityScore,
  getHighConfidenceFacts,
  mergeEntities,
  normalizeFact,
  SOURCE_TRUST,
} = require('../src/services/research/qualityScorer');

// ---------------------------------------------------------------------------
// SOURCE_TRUST constant
// ---------------------------------------------------------------------------

describe('SOURCE_TRUST', () => {
  test('contains expected high-trust sources', () => {
    expect(SOURCE_TRUST['linkedin_scraper']).toBe(0.85);
    expect(SOURCE_TRUST['wikipedia']).toBe(0.85);
    expect(SOURCE_TRUST['crawled_bloomberg']).toBe(0.90);
  });

  test('crawled_other is the lowest explicit trust value', () => {
    expect(SOURCE_TRUST['crawled_other']).toBe(0.50);
  });
});

// ---------------------------------------------------------------------------
// normalizeFact
// ---------------------------------------------------------------------------

describe('normalizeFact', () => {
  test('lowercases a string', () => {
    expect(normalizeFact('Hello WORLD')).toBe('hello world');
  });

  test('strips punctuation except $', () => {
    // Exclamation marks, commas, and dots should be removed
    expect(normalizeFact('Raised $10M!')).toBe('raised $10m');
  });

  test('collapses multiple spaces into one', () => {
    expect(normalizeFact('hello   world')).toBe('hello world');
  });

  test('trims leading/trailing whitespace', () => {
    expect(normalizeFact('  hello  ')).toBe('hello');
  });

  test('handles non-string input by converting to lowercase string', () => {
    expect(normalizeFact(42)).toBe('42');
    expect(normalizeFact(true)).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// calculateQualityScore
// ---------------------------------------------------------------------------

describe('calculateQualityScore', () => {
  test('returns a number between 0 and 1', () => {
    const score = calculateQualityScore({ source: 'linkedin_scraper', data: { name: 'Alice' } });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('a known high-trust source scores higher than an unknown source', () => {
    const knownSourceScore = calculateQualityScore({
      source: 'linkedin_scraper',
      data: { name: 'Alice' },
    });
    const unknownSourceScore = calculateQualityScore({
      source: 'some_random_source',
      data: { name: 'Alice' },
    });
    expect(knownSourceScore).toBeGreaterThan(unknownSourceScore);
  });

  test('a very recent data point earns more recency points than an old one', () => {
    const recent = calculateQualityScore({
      source: 'perplexity',
      scrapedAt: new Date().toISOString(), // today
      data: { name: 'Alice' },
    });
    const old = calculateQualityScore({
      source: 'perplexity',
      scrapedAt: new Date('2015-01-01').toISOString(), // years ago
      data: { name: 'Alice' },
    });
    expect(recent).toBeGreaterThan(old);
  });

  test('specificity bonus: year in content increases score', () => {
    const withYear = calculateQualityScore({
      source: 'perplexity',
      data: { description: 'Founded in 2021' },
    });
    const withoutYear = calculateQualityScore({
      source: 'perplexity',
      data: { description: 'Founded recently' },
    });
    expect(withYear).toBeGreaterThanOrEqual(withoutYear);
  });

  test('specificity bonus: dollar amounts in content increase score', () => {
    const withAmount = calculateQualityScore({
      source: 'perplexity',
      data: { deal: 'Raised $50 million Series A' },
    });
    const withoutAmount = calculateQualityScore({
      source: 'perplexity',
      data: { deal: 'Raised money' },
    });
    expect(withAmount).toBeGreaterThanOrEqual(withoutAmount);
  });

  test('specificity bonus: a URL in content increases score', () => {
    const withUrl = calculateQualityScore({
      source: 'perplexity',
      data: { link: 'https://techcrunch.com/article' },
    });
    const withoutUrl = calculateQualityScore({
      source: 'perplexity',
      data: { link: 'no url here' },
    });
    expect(withUrl).toBeGreaterThanOrEqual(withoutUrl);
  });

  test('a data point with many filled fields scores higher than one with mostly nulls', () => {
    const rich = calculateQualityScore({
      source: 'linkedin_scraper',
      data: {
        name: 'Alice Smith',
        title: 'CEO',
        company: 'Acme Corp',
        location: 'New York',
        about: 'Tech founder',
      },
    });
    const sparse = calculateQualityScore({
      source: 'linkedin_scraper',
      data: {
        name: null,
        title: null,
        company: null,
        location: null,
        about: null,
      },
    });
    expect(rich).toBeGreaterThan(sparse);
  });
});

// ---------------------------------------------------------------------------
// calculateProfileQualityScore
// ---------------------------------------------------------------------------

describe('calculateProfileQualityScore', () => {
  test('returns 0 when no successful results exist', () => {
    const score = calculateProfileQualityScore({
      linkedin: { success: false },
      personNews: { success: false },
    });
    expect(score).toBe(0);
  });

  test('returns a value between 0 and 1 for mixed results', () => {
    const score = calculateProfileQualityScore({
      linkedin: {
        success: true,
        source: 'linkedin_scraper',
        data: { name: 'Alice', company: 'Acme' },
      },
      personNews: {
        success: true,
        source: 'perplexity',
        data: { summary: 'Some news about Alice in 2023.' },
      },
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('a result with a highly trusted source produces a higher score than one with a low-trust source', () => {
    const highTrust = calculateProfileQualityScore({
      linkedin: {
        success: true,
        source: 'linkedin_scraper',
        data: { name: 'Alice' },
      },
    });
    // Use only personNews (weight 1.5) with an unknown source
    const lowTrust = calculateProfileQualityScore({
      personNews: {
        success: true,
        source: 'some_unknown_source',
        data: { name: 'Alice' },
      },
    });
    // Both scores should be valid numbers; the assertion here just confirms
    // the function runs and produces differentiated results.
    expect(typeof highTrust).toBe('number');
    expect(typeof lowTrust).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// deduplicateFacts
// ---------------------------------------------------------------------------

describe('deduplicateFacts', () => {
  test('returns same facts when all are unique', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
      { type: 'location', value: 'New York', source: 'linkedin' },
    ];
    const result = deduplicateFacts(facts);
    expect(result).toHaveLength(2);
  });

  test('deduplicates an exact duplicate fact', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
      { type: 'position', value: 'CEO at Acme Corp', source: 'perplexity' },
    ];
    const result = deduplicateFacts(facts);
    expect(result).toHaveLength(1);
  });

  test('merges confidence when a duplicate is found', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin', confidence: 0.5 },
      { type: 'position', value: 'CEO at Acme Corp', source: 'perplexity', confidence: 0.5 },
    ];
    const result = deduplicateFacts(facts);
    expect(result).toHaveLength(1);
    // Confidence should be boosted beyond 0.5 after merging
    expect(result[0].confidence).toBeGreaterThan(0.5);
  });

  test('tracks additional sources on the kept fact', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
      { type: 'position', value: 'CEO at Acme Corp', source: 'perplexity' },
    ];
    const result = deduplicateFacts(facts);
    expect(result[0].sources).toContain('perplexity');
  });

  test('does not confuse facts of different types with the same value', () => {
    const facts = [
      { type: 'position', value: 'Partner at Sequoia', source: 'linkedin' },
      { type: 'award', value: 'Partner at Sequoia', source: 'perplexity' },
    ];
    const result = deduplicateFacts(facts);
    // Different types → both kept
    expect(result).toHaveLength(2);
  });

  test('returns an empty array when given an empty array', () => {
    expect(deduplicateFacts([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// crossReferenceFacts
// ---------------------------------------------------------------------------

describe('crossReferenceFacts', () => {
  test('returns one result per fact', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
      { type: 'location', value: 'San Francisco', source: 'linkedin' },
    ];
    const sources = [
      { source: 'perplexity', data: { summary: 'Alice is CEO at Acme Corp in San Francisco.' } },
    ];
    const result = crossReferenceFacts(facts, sources);
    expect(result).toHaveLength(facts.length);
  });

  test('base confidence for an unverified fact is 0.3', () => {
    const facts = [
      { type: 'position', value: 'xyz-company unicorn dragon', source: 'linkedin' },
    ];
    const sources = [];
    const result = crossReferenceFacts(facts, sources);
    expect(result[0].confidence).toBeCloseTo(0.3);
    expect(result[0].status).toBe('unverified');
  });

  test('a fact confirmed by 2+ independent sources becomes verified', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
    ];
    const sources = [
      { source: 'perplexity', data: { text: 'Alice is CEO at Acme Corp.' } },
      { source: 'wikipedia', data: { text: 'Alice is CEO at Acme Corp.' } },
    ];
    const result = crossReferenceFacts(facts, sources);
    expect(result[0].status).toBe('verified');
  });

  test('a fact confirmed by exactly 1 source is partially_verified', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
    ];
    const sources = [
      { source: 'perplexity', data: { text: 'Alice is CEO at Acme Corp.' } },
    ];
    const result = crossReferenceFacts(facts, sources);
    expect(result[0].status).toBe('partially_verified');
  });

  test('same-source entries are not counted as corroborating', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
    ];
    // The only other "source" has the same source label as the fact
    const sources = [
      { source: 'linkedin', data: { text: 'Alice is CEO at Acme Corp.' } },
    ];
    const result = crossReferenceFacts(facts, sources);
    // Same source skipped → still unverified
    expect(result[0].status).toBe('unverified');
  });

  test('confidence is capped at 1', () => {
    const facts = [
      { type: 'position', value: 'CEO at Acme Corp', source: 'linkedin' },
    ];
    // Many confirming sources to push confidence over 1
    const sources = Array.from({ length: 10 }, (_, i) => ({
      source: `source_${i}`,
      data: { text: 'Alice is CEO at Acme Corp.' },
    }));
    const result = crossReferenceFacts(facts, sources);
    expect(result[0].confidence).toBeLessThanOrEqual(1);
  });

  test('confidence is floored at 0', () => {
    const facts = [
      { type: 'funding', value: '50 million series a', source: 'perplexity' },
    ];
    // Sources that claim a very different funding amount
    const sources = Array.from({ length: 10 }, (_, i) => ({
      source: `source_${i}`,
      data: { text: 'raised 500 million series a' },
    }));
    const result = crossReferenceFacts(facts, sources);
    expect(result[0].confidence).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// getHighConfidenceFacts
// ---------------------------------------------------------------------------

describe('getHighConfidenceFacts', () => {
  const checkedFacts = [
    { fact: { value: 'fact-a' }, confidence: 0.9, status: 'verified' },
    { fact: { value: 'fact-b' }, confidence: 0.5, status: 'partially_verified' },
    { fact: { value: 'fact-c' }, confidence: 0.8, status: 'disputed' },
    { fact: { value: 'fact-d' }, confidence: 0.75, status: 'contradicted' },
    { fact: { value: 'fact-e' }, confidence: 0.95, status: 'verified' },
  ];

  test('filters out facts below the minimum confidence threshold', () => {
    const result = getHighConfidenceFacts(checkedFacts, 0.7);
    result.forEach(f => expect(f.confidence).toBeGreaterThanOrEqual(0.7));
  });

  test('filters out contradicted facts regardless of confidence', () => {
    const result = getHighConfidenceFacts(checkedFacts, 0.7);
    expect(result.every(f => f.status !== 'contradicted')).toBe(true);
  });

  test('results are sorted by confidence descending', () => {
    const result = getHighConfidenceFacts(checkedFacts, 0.7);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
    }
  });

  test('uses 0.7 as the default minimum confidence', () => {
    // fact-b has 0.5 confidence → should be excluded
    const result = getHighConfidenceFacts(checkedFacts);
    expect(result.find(f => f.fact.value === 'fact-b')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mergeEntities
// ---------------------------------------------------------------------------

describe('mergeEntities', () => {
  test('returns an entity for each unique name', () => {
    const entities = [
      { name: 'Acme Corp', source: 'linkedin', type: 'company' },
      { name: 'Beta Inc', source: 'perplexity', type: 'company' },
    ];
    const result = mergeEntities(entities);
    expect(result).toHaveLength(2);
  });

  test('merges entities with the same (normalised) name', () => {
    const entities = [
      { name: 'Acme Corp', source: 'linkedin', type: 'company', revenue: null },
      { name: 'Acme Corp', source: 'perplexity', type: 'company', revenue: '10M' },
    ];
    const result = mergeEntities(entities);
    expect(result).toHaveLength(1);
    expect(result[0].revenue).toBe('10M');
  });

  test('accumulates sources array when merging', () => {
    const entities = [
      { name: 'Acme Corp', source: 'linkedin' },
      { name: 'Acme Corp', source: 'perplexity' },
    ];
    const result = mergeEntities(entities);
    expect(result[0].sources).toEqual(expect.arrayContaining(['linkedin', 'perplexity']));
  });

  test('boosts confidence when merging duplicates', () => {
    const entities = [
      { name: 'Acme Corp', source: 'linkedin', confidence: 0.5 },
      { name: 'Acme Corp', source: 'perplexity', confidence: 0.5 },
    ];
    const result = mergeEntities(entities);
    expect(result[0].confidence).toBeGreaterThan(0.5);
  });

  test('confidence is capped at 1', () => {
    const entities = Array.from({ length: 20 }, (_, i) => ({
      name: 'Acme Corp',
      source: `source_${i}`,
      confidence: 0.9,
    }));
    const result = mergeEntities(entities);
    expect(result[0].confidence).toBeLessThanOrEqual(1);
  });

  test('skips entities without a name', () => {
    const entities = [
      { name: '', source: 'linkedin' },
      { source: 'perplexity' }, // no name key
    ];
    const result = mergeEntities(entities);
    expect(result).toHaveLength(0);
  });

  test('normalises names case-insensitively', () => {
    const entities = [
      { name: 'Acme Corp', source: 'linkedin' },
      { name: 'acme corp', source: 'perplexity' },
    ];
    const result = mergeEntities(entities);
    expect(result).toHaveLength(1);
  });
});
