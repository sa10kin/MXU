import { describe, expect, it } from 'vitest';

import { matchesClassFilter, parseAtlasCraftEssenceId } from './AtlasBrowserPage';

describe('Atlas servant class filters', () => {
  it('keeps Beast variants in all and groups them under Beast', () => {
    expect(matchesClassFilter('beastEresh', '')).toBe(true);
    expect(matchesClassFilter('beastEresh', 'beast')).toBe(true);
    expect(matchesClassFilter('beastEresh', 'unknown')).toBe(false);
    expect(matchesClassFilter('beastEresh', 'saber')).toBe(false);
  });

  it('separates Shielder from Unknown', () => {
    expect(matchesClassFilter('shielder', 'shielder')).toBe(true);
    expect(matchesClassFilter('shielder', 'unknown')).toBe(false);
  });
});

describe('Atlas craft essence ID query', () => {
  it('accepts only a positive exact #AtlasID', () => {
    expect(parseAtlasCraftEssenceId('#9408800')).toBe(9408800);
    expect(parseAtlasCraftEssenceId(' #9408800 ')).toBe(9408800);
    expect(parseAtlasCraftEssenceId('9408800')).toBeNull();
    expect(parseAtlasCraftEssenceId('#0')).toBeNull();
    expect(parseAtlasCraftEssenceId('#9408800x')).toBeNull();
  });
});
