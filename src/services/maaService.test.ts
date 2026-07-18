import { describe, expect, it } from 'vitest';
import { dedupeAdbDevices, resolveAdbReconnectTarget } from './maaService';

describe('resolveAdbReconnectTarget', () => {
  it('keeps the saved address without reusing an emulator-private ADB path', () => {
    const device = {
      name: 'BlueStacks',
      adb_path: '/saved/adb',
      address: '127.0.0.1:5555',
      screencap_methods: '0',
      input_methods: '0',
      config: '{}',
    };

    expect(
      resolveAdbReconnectTarget(device, '127.0.0.1:5565', { adb_path: '/project/adb' }),
    ).toEqual({
      adb_path: '/project/adb',
      address: '127.0.0.1:5565',
    });
    expect(resolveAdbReconnectTarget(device)).toEqual({
      address: '127.0.0.1:5555',
    });
    expect(resolveAdbReconnectTarget(undefined, undefined, { address: '127.0.0.1:5555' })).toEqual({
      address: '127.0.0.1:5555',
    });
  });

  it('hides duplicate discoveries for the same ADB address', () => {
    const devices = dedupeAdbDevices([
      {
        name: 'BlueStacks',
        adb_path: '/opt/homebrew/bin/adb',
        address: '127.0.0.1:5555',
        screencap_methods: '0',
        input_methods: '0',
        config: '{}',
      },
      {
        name: '/opt/homebrew/bin/adb',
        adb_path: '/opt/homebrew/bin/adb',
        address: '127.0.0.1:5555',
        screencap_methods: '0',
        input_methods: '0',
        config: '{}',
      },
    ]);

    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe('BlueStacks');
  });
});
