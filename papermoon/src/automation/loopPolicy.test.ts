import { describe, expect, it } from 'vitest';

import { recoveryFruitQuantity, type RecoveryItem } from './loopPolicy';

describe('LoopPolicy editor helpers', () => {
  it('uses the in-game quantity for one AP recovery', () => {
    const items: RecoveryItem[] = ['none', 'gold', 'silver', 'bronze', 'copper'];
    expect(items.map(recoveryFruitQuantity)).toEqual([0, 1, 2, 4, 10]);
  });
});
