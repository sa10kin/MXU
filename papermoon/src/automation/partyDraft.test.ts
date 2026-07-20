import { describe, expect, it } from 'vitest';

import { setPartySupport, updatePartySlot } from './partyDraft';

describe('party draft helpers', () => {
  it('keeps slots sorted and removes the whole slot when cleared', () => {
    const party = updatePartySlot([{ slot: 3, servantId: 30 }], 1, { servantId: 10 });
    expect(party.map(({ slot }) => slot)).toEqual([1, 3]);
    expect(updatePartySlot(party, 1, null)).toEqual([{ slot: 3, servantId: 30 }]);
  });

  it('allows only one support slot', () => {
    const party = setPartySupport(
      [
        { slot: 1, servantId: 10, support: true },
        { slot: 2, servantId: 20 },
      ],
      2,
      true,
    );
    expect(party).toEqual([
      { slot: 1, servantId: 10 },
      { slot: 2, support: true },
    ]);
  });

  it('creates an empty support slot and removes it when unchecked', () => {
    const party = setPartySupport([], 3, true);
    expect(party).toEqual([{ slot: 3, support: true }]);
    expect(setPartySupport(party, 3, false)).toEqual([]);
  });

  it('drops the orphaned placeholder when moving support off an empty slot', () => {
    const party = setPartySupport(
      [
        { slot: 1, servantId: 10 },
        { slot: 5, support: true },
      ],
      2,
      true,
    );
    expect(party).toEqual([
      { slot: 1, servantId: 10 },
      { slot: 2, support: true },
    ]);
  });
});
