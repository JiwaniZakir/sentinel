'use strict';

/**
 * Tests for src/utils/validators.js
 *
 * Most functions are pure. isAdmin() depends on the config module which
 * reads environment variables. We mock config so the test is deterministic.
 */

// Mock config before requiring validators
jest.mock('../src/config', () => ({
  adminSlackIds: ['ADMIN_USER_1', 'ADMIN_USER_2'],
}));

const {
  isAdmin,
  isValidPartnerType,
  isValidEventType,
  parsePartnerType,
  parseSectors,
  parseStages,
  isValidUrl,
  isValidEmail,
  sanitizeForSlack,
} = require('../src/utils/validators');

// ---------------------------------------------------------------------------
// isAdmin
// ---------------------------------------------------------------------------

describe('isAdmin', () => {
  test('returns true for a user ID in the admin list', () => {
    expect(isAdmin('ADMIN_USER_1')).toBe(true);
  });

  test('returns true for the second admin user', () => {
    expect(isAdmin('ADMIN_USER_2')).toBe(true);
  });

  test('returns false for a non-admin user ID', () => {
    expect(isAdmin('RANDOM_USER_99')).toBe(false);
  });

  test('returns false for an empty string', () => {
    expect(isAdmin('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidPartnerType
// ---------------------------------------------------------------------------

describe('isValidPartnerType', () => {
  test.each(['VC', 'CORPORATE', 'COMMUNITY_BUILDER', 'ANGEL', 'OTHER'])(
    'accepts valid partner type "%s"',
    (type) => {
      expect(isValidPartnerType(type)).toBe(true);
    },
  );

  test('is case-insensitive', () => {
    expect(isValidPartnerType('vc')).toBe(true);
    expect(isValidPartnerType('angel')).toBe(true);
  });

  test('rejects an unknown partner type', () => {
    expect(isValidPartnerType('UNKNOWN_TYPE')).toBe(false);
  });

  test('returns false for null/undefined', () => {
    expect(isValidPartnerType(null)).toBe(false);
    expect(isValidPartnerType(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidEventType
// ---------------------------------------------------------------------------

describe('isValidEventType', () => {
  const validTypes = [
    'pitch_night',
    'demo_day',
    'office_hours',
    'networking_event',
    'workshop',
    'other',
  ];

  test.each(validTypes)('accepts valid event type "%s"', (type) => {
    expect(isValidEventType(type)).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(isValidEventType('PITCH_NIGHT')).toBe(true);
    expect(isValidEventType('Workshop')).toBe(true);
  });

  test('rejects an unknown event type', () => {
    expect(isValidEventType('hackathon')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parsePartnerType
// ---------------------------------------------------------------------------

describe('parsePartnerType', () => {
  test('returns OTHER for null/undefined', () => {
    expect(parsePartnerType(null)).toBe('OTHER');
    expect(parsePartnerType(undefined)).toBe('OTHER');
  });

  test('parses VC variants', () => {
    expect(parsePartnerType('VC')).toBe('VC');
    expect(parsePartnerType('venture capital')).toBe('VC');
    expect(parsePartnerType('Venture Capital Firm')).toBe('VC');
  });

  test('parses CORPORATE variants', () => {
    expect(parsePartnerType('corporate')).toBe('CORPORATE');
    expect(parsePartnerType('Enterprise Partner')).toBe('CORPORATE');
  });

  test('parses COMMUNITY_BUILDER variants', () => {
    expect(parsePartnerType('community builder')).toBe('COMMUNITY_BUILDER');
    expect(parsePartnerType('accelerator')).toBe('COMMUNITY_BUILDER');
    expect(parsePartnerType('incubator')).toBe('COMMUNITY_BUILDER');
  });

  test('parses ANGEL', () => {
    expect(parsePartnerType('angel')).toBe('ANGEL');
    expect(parsePartnerType('Angel Investor')).toBe('ANGEL');
  });

  test('returns OTHER for unrecognised strings', () => {
    expect(parsePartnerType('some random string')).toBe('OTHER');
  });
});

// ---------------------------------------------------------------------------
// parseSectors
// ---------------------------------------------------------------------------

describe('parseSectors', () => {
  test('returns empty array for null/undefined', () => {
    expect(parseSectors(null)).toEqual([]);
    expect(parseSectors(undefined)).toEqual([]);
  });

  test('returns the array as-is when already an array', () => {
    const input = ['Fintech', 'HealthTech'];
    expect(parseSectors(input)).toEqual(input);
  });

  test('splits a comma-separated string into trimmed sectors', () => {
    expect(parseSectors('Fintech, HealthTech, AI')).toEqual(['Fintech', 'HealthTech', 'AI']);
  });

  test('splits a semicolon-separated string', () => {
    expect(parseSectors('Fintech;HealthTech')).toEqual(['Fintech', 'HealthTech']);
  });

  test('filters out empty tokens', () => {
    expect(parseSectors('Fintech,,AI')).toEqual(['Fintech', 'AI']);
  });
});

// ---------------------------------------------------------------------------
// parseStages
// ---------------------------------------------------------------------------

describe('parseStages', () => {
  test('returns empty array for null', () => {
    expect(parseStages(null)).toEqual([]);
  });

  test('returns an array unchanged', () => {
    expect(parseStages(['pre-seed', 'seed'])).toEqual(['pre-seed', 'seed']);
  });

  test('splits a comma-separated string', () => {
    expect(parseStages('pre-seed, seed, Series A')).toEqual(['pre-seed', 'seed', 'Series A']);
  });
});

// ---------------------------------------------------------------------------
// isValidUrl
// ---------------------------------------------------------------------------

describe('isValidUrl', () => {
  test('returns true for null (optional field)', () => {
    expect(isValidUrl(null)).toBe(true);
    expect(isValidUrl(undefined)).toBe(true);
    expect(isValidUrl('')).toBe(true);
  });

  test('returns true for a valid https URL', () => {
    expect(isValidUrl('https://www.example.com')).toBe(true);
  });

  test('returns true for a valid http URL', () => {
    expect(isValidUrl('http://example.com/path?q=1')).toBe(true);
  });

  test('returns false for a string that is not a URL', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  test('returns false for a URL missing the scheme', () => {
    expect(isValidUrl('www.example.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------

describe('isValidEmail', () => {
  test('returns true for null/empty (optional field)', () => {
    expect(isValidEmail(null)).toBe(true);
    expect(isValidEmail('')).toBe(true);
  });

  test('returns true for a standard email address', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  test('returns true for an email with subdomain', () => {
    expect(isValidEmail('user@mail.example.co.uk')).toBe(true);
  });

  test('returns false for a string without @', () => {
    expect(isValidEmail('notanemail')).toBe(false);
  });

  test('returns false for an email with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sanitizeForSlack
// ---------------------------------------------------------------------------

describe('sanitizeForSlack', () => {
  test('returns empty string for null/undefined', () => {
    expect(sanitizeForSlack(null)).toBe('');
    expect(sanitizeForSlack(undefined)).toBe('');
  });

  test('escapes ampersands', () => {
    expect(sanitizeForSlack('AT&T')).toBe('AT&amp;T');
  });

  test('escapes less-than signs', () => {
    expect(sanitizeForSlack('a < b')).toBe('a &lt; b');
  });

  test('escapes greater-than signs', () => {
    expect(sanitizeForSlack('a > b')).toBe('a &gt; b');
  });

  test('escapes all three special characters in one string', () => {
    expect(sanitizeForSlack('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert("xss")&lt;/script&gt;',
    );
  });

  test('leaves plain text unchanged', () => {
    expect(sanitizeForSlack('Hello world')).toBe('Hello world');
  });
});
