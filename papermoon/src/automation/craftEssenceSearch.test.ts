import { describe, expect, it } from 'vitest';

import {
  buildCraftEssenceOptions,
  filterCraftEssences,
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
});
