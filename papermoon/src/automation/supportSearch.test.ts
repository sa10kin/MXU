import { describe, expect, it } from 'vitest';

import {
  filterSupportServants,
  mergeSupportServants,
  resolveSupportServant,
} from './supportSearch';

describe('support servant search', () => {
  const options = mergeSupportServants({
    TW: [{ id: 800100, collectionNo: 1, name: '瑪修．基利艾拉特' }],
    CN: [{ id: 800100, collectionNo: 1, name: '玛修·基列莱特' }],
  });

  it('returns the TW display entry for a simplified Chinese name', () => {
    expect(resolveSupportServant(options, '玛修')?.servant.name).toBe('瑪修．基利艾拉特');
  });

  it('resolves a complete collection number', () => {
    expect(resolveSupportServant(options, '1')?.servant.id).toBe(800100);
  });

  it('shows a TW candidate when filtering by a simplified Chinese name', () => {
    expect(filterSupportServants(options, '玛修')[0]?.servant.name).toBe('瑪修．基利艾拉特');
  });
});
