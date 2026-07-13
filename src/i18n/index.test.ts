import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectSystemLanguage,
  getInterfaceLangKey,
  getSupportedLanguages,
  normalizeLanguagePreference,
} from './index';

afterEach(() => vi.unstubAllGlobals());

describe('language policy', () => {
  it('only exposes the PaperMoon locales', () => {
    expect(getSupportedLanguages()).toEqual(['zh-CN', 'zh-TW', 'ja-JP']);
  });

  it('normalizes retired and unknown preferences to system', () => {
    expect(normalizeLanguagePreference('en-US')).toBe('system');
    expect(normalizeLanguagePreference('ko-KR')).toBe('system');
    expect(normalizeLanguagePreference('invalid')).toBe('system');
  });

  it('uses a supported system language and Chinese fallback', () => {
    vi.stubGlobal('navigator', { languages: ['ja-JP'] });
    expect(detectSystemLanguage()).toBe('ja-JP');

    vi.stubGlobal('navigator', { languages: ['en-US'] });
    expect(getInterfaceLangKey('ko-KR')).toBe('zh_cn');
  });
});
