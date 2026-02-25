'use strict';

/**
 * Tests for src/utils/formatters.js
 *
 * All functions are pure (no I/O, no external dependencies).
 */

const {
  formatPartnerType,
  formatSectors,
  formatStageFocus,
  truncate,
  divider,
  section,
  context,
  actions,
  header,
} = require('../src/utils/formatters');

// ---------------------------------------------------------------------------
// formatPartnerType
// ---------------------------------------------------------------------------

describe('formatPartnerType', () => {
  test.each([
    ['VC', 'VC Partner'],
    ['CORPORATE', 'Corporate Partner'],
    ['COMMUNITY_BUILDER', 'Community Builder'],
    ['ANGEL', 'Angel Investor'],
    ['OTHER', 'Partner'],
  ])('maps %s → "%s"', (input, expected) => {
    expect(formatPartnerType(input)).toBe(expected);
  });

  test('returns the raw type when not in the map', () => {
    expect(formatPartnerType('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE');
  });
});

// ---------------------------------------------------------------------------
// formatSectors
// ---------------------------------------------------------------------------

describe('formatSectors', () => {
  test('returns "N/A" for null', () => {
    expect(formatSectors(null)).toBe('N/A');
  });

  test('returns "N/A" for an empty array', () => {
    expect(formatSectors([])).toBe('N/A');
  });

  test('joins sectors with ", "', () => {
    expect(formatSectors(['Fintech', 'AI', 'HealthTech'])).toBe('Fintech, AI, HealthTech');
  });

  test('handles a single sector', () => {
    expect(formatSectors(['Fintech'])).toBe('Fintech');
  });
});

// ---------------------------------------------------------------------------
// formatStageFocus
// ---------------------------------------------------------------------------

describe('formatStageFocus', () => {
  test('returns "N/A" for null', () => {
    expect(formatStageFocus(null)).toBe('N/A');
  });

  test('returns "N/A" for an empty array', () => {
    expect(formatStageFocus([])).toBe('N/A');
  });

  test('joins stages with ", "', () => {
    expect(formatStageFocus(['pre-seed', 'seed', 'Series A'])).toBe('pre-seed, seed, Series A');
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe('truncate', () => {
  test('returns empty string for null/undefined', () => {
    expect(truncate(null)).toBe('');
    expect(truncate(undefined)).toBe('');
  });

  test('returns the text unchanged when shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('returns the text unchanged when exactly equal to maxLength', () => {
    const text = 'a'.repeat(100);
    expect(truncate(text, 100)).toBe(text);
  });

  test('truncates to maxLength and appends "..."', () => {
    const text = 'a'.repeat(110);
    const result = truncate(text, 100);
    expect(result).toHaveLength(100);
    expect(result.endsWith('...')).toBe(true);
  });

  test('uses 100 as the default maxLength', () => {
    const text = 'a'.repeat(105);
    const result = truncate(text);
    expect(result).toHaveLength(100);
  });
});

// ---------------------------------------------------------------------------
// Slack Block Kit builders
// ---------------------------------------------------------------------------

describe('divider', () => {
  test('returns an object with type "divider"', () => {
    expect(divider()).toEqual({ type: 'divider' });
  });
});

describe('section', () => {
  test('returns a section block with mrkdwn text', () => {
    const block = section('Hello *world*');
    expect(block.type).toBe('section');
    expect(block.text.type).toBe('mrkdwn');
    expect(block.text.text).toBe('Hello *world*');
  });
});

describe('context', () => {
  test('returns a context block with mrkdwn elements', () => {
    const block = context(['line one', 'line two']);
    expect(block.type).toBe('context');
    expect(block.elements).toHaveLength(2);
    expect(block.elements[0]).toEqual({ type: 'mrkdwn', text: 'line one' });
    expect(block.elements[1]).toEqual({ type: 'mrkdwn', text: 'line two' });
  });

  test('returns an empty elements array for empty input', () => {
    expect(context([])).toEqual({ type: 'context', elements: [] });
  });
});

describe('actions', () => {
  test('returns an actions block with the correct block_id', () => {
    const block = actions('my_action_block', [
      { text: 'Approve', value: 'approve', actionId: 'do_approve', style: 'primary' },
    ]);
    expect(block.type).toBe('actions');
    expect(block.block_id).toBe('my_action_block');
  });

  test('maps each button to a button element', () => {
    const block = actions('block', [
      { text: 'Yes', value: 'yes', actionId: 'yes_action', style: 'primary' },
      { text: 'No', value: 'no', actionId: 'no_action', style: 'danger' },
    ]);
    expect(block.elements).toHaveLength(2);
    expect(block.elements[0].type).toBe('button');
    expect(block.elements[0].text.text).toBe('Yes');
    expect(block.elements[0].value).toBe('yes');
    expect(block.elements[0].action_id).toBe('yes_action');
    expect(block.elements[0].style).toBe('primary');
    expect(block.elements[1].style).toBe('danger');
  });

  test('each button text block has emoji: true', () => {
    const block = actions('block', [{ text: 'OK', value: 'ok', actionId: 'ok_action' }]);
    expect(block.elements[0].text.emoji).toBe(true);
  });
});

describe('header', () => {
  test('returns a header block with plain_text type', () => {
    const block = header('My Header');
    expect(block.type).toBe('header');
    expect(block.text.type).toBe('plain_text');
    expect(block.text.text).toBe('My Header');
    expect(block.text.emoji).toBe(true);
  });
});
