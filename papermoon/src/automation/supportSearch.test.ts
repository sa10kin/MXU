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

  it('uses the selected server for display names', () => {
    const cn = mergeSupportServants(
      {
        TW: [{ id: 800100, collectionNo: 1, name: '瑪修．基利艾拉特' }],
        CN: [{ id: 800100, collectionNo: 1, name: '玛修·基列莱特' }],
      },
      'CN',
    );
    expect(filterSupportServants(cn, '瑪修')[0]?.servant.name).toBe('玛修·基列莱特');
  });

  it('uses aliases saved in the Atlas browser', () => {
    const aliased = mergeSupportServants(
      { TW: [{ id: 800100, collectionNo: 1, name: '瑪修．基利艾拉特' }] },
      'TW',
      'TW',
      { '1': ['小茄子'] },
    );
    expect(resolveSupportServant(aliased, '小茄子')?.servant.id).toBe(800100);
  });

  it('limits candidates to the resource server', () => {
    const tw = mergeSupportServants(
      {
        TW: [{ id: 1, collectionNo: 1, name: '梵谷' }],
        CN: [
          { id: 1, collectionNo: 1, name: '梵高' },
          { id: 2, collectionNo: 2, name: '简中限定' },
        ],
      },
      'TW',
      'CN',
    );
    expect(tw.map(({ servant }) => servant.name)).toEqual(['梵高']);
    expect(filterSupportServants(tw, '梵谷')).toHaveLength(1);
  });
});
