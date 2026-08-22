import { describe, expect, it } from 'vitest';

import {
  buildCraftEssenceOptions,
  filterCraftEssences,
  mergeCraftEssenceOptions,
  resolveCraftEssence,
} from './craftEssenceSearch';

describe('craft essence search', () => {
  const options = buildCraftEssenceOptions([
    { id: 9401270, collectionNo: 330, name: '迦勒底午餐時光', nameCn: '迦勒底午餐时光' },
  ]);

  it('finds a localized partial name', () => {
    expect(filterCraftEssences(options, '午餐时光')[0]?.craftEssence.id).toBe(9401270);
  });

  it('resolves a collection number to the Atlas ID', () => {
    expect(resolveCraftEssence(options, '330')?.craftEssence.id).toBe(9401270);
  });

  it('uses resource scope, interface labels, and both Chinese names', () => {
    const tw = mergeCraftEssenceOptions(
      {
        TW: [{ id: 1, collectionNo: 1, name: '繁中禮裝' }],
        CN: [
          { id: 1, collectionNo: 1, name: '简中礼装' },
          { id: 2, collectionNo: 2, name: '简中限定' },
        ],
      },
      'TW',
      'CN',
    );
    expect(tw.map(({ craftEssence }) => craftEssence.name)).toEqual(['简中礼装']);
    expect(filterCraftEssences(tw, '繁中禮裝')).toHaveLength(1);
  });
});
