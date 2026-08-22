import { describe, expect, it } from 'vitest';

import type { OptionValue } from '@/types/interface';

import { collectIds } from './battleAssets';

function optionValue(json: unknown, support?: unknown): OptionValue {
  return {
    type: 'input',
    values: {
      json: JSON.stringify(json),
      support: support === undefined ? '' : JSON.stringify(support),
    },
  } as OptionValue;
}

const plan = {
  schemaVersion: 1,
  name: 't',
  party: [
    { slot: 1, servantId: 704000, craftEssenceId: 9400010 },
    { slot: 2, servantId: 504500 },
  ],
  maxTurns: 3,
  waves: [],
};

describe('collectIds', () => {
  it('collects party servants and craft essences', () => {
    const { servantIds, craftEssenceIds } = collectIds(optionValue(plan));
    expect(servantIds.sort()).toEqual([504500, 704000]);
    expect(craftEssenceIds).toEqual([9400010]);
  });

  it('includes support policy targets only when a support slot exists', () => {
    const support = {
      schemaVersion: 1,
      servantId: 2300900,
      servantType: 'grand',
      craftEssences: [{ id: 9403990 }, { id: 9404000 }],
    };
    const withoutSupportSlot = collectIds(optionValue(plan, support));
    expect(withoutSupportSlot.servantIds).not.toContain(2300900);

    const supportPlan = { ...plan, party: [...plan.party, { slot: 3, support: true }] };
    const withSupportSlot = collectIds(optionValue(supportPlan, support));
    expect(withSupportSlot.servantIds).toContain(2300900);
    expect(withSupportSlot.craftEssenceIds).toContain(9403990);
    expect(withSupportSlot.craftEssenceIds).toContain(9404000);
  });
});
