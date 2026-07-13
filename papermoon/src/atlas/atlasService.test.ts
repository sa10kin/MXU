import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/utils/logger', () => ({ loggers: { app: { warn: vi.fn() } } }));
vi.mock('@/utils/paths', () => ({
  getCacheDir: vi.fn(),
  isTauri: vi.fn(() => false),
  joinPath: (...parts: string[]) => parts.join('/'),
}));

import {
  atlasImageFileName,
  atlasServerFromFgoClient,
  buildBasicServantFaceDownloadList,
  buildServantRecognitionImageList,
  missingAtlasDatasets,
  selectCraftEssenceAsset,
  type AtlasCacheStatus,
} from './atlasService';

describe('Atlas helpers', () => {
  it('maps FGO clients to Atlas servers', () => {
    expect(atlasServerFromFgoClient('cn')).toBe('CN');
    expect(atlasServerFromFgoClient('JP')).toBe('JP');
    expect(atlasServerFromFgoClient('tw')).toBe('TW');
  });

  it('reports missing datasets and sanitizes image names', () => {
    const status: AtlasCacheStatus = {
      server: 'TW',
      cacheDir: '/atlas/TW',
      datasets: {
        servants: { dataset: 'servants', available: true, count: 1, path: 'servants.json' },
        craftEssences: {
          dataset: 'craftEssences',
          available: false,
          count: 0,
          path: 'craft_essences.json',
        },
        mysticCodes: {
          dataset: 'mysticCodes',
          available: false,
          count: 0,
          path: 'mystic_codes.json',
        },
      },
    };

    expect(missingAtlasDatasets(status)).toEqual(['craftEssences', 'mysticCodes']);
    expect(
      atlasImageFileName(1, { kind: 'faces', variant: 'a/b', url: 'https://example.com' }),
    ).toBe('1_faces_a-b.png');
  });

  it('selects the matching craft essence image', () => {
    const assets = [
      { kind: 'equipFaces', variant: 'b', url: 'https://example.com/equip.png' },
      { kind: 'faces', variant: 'b', url: 'https://example.com/face-b.png' },
      { kind: 'faces', variant: 'a', url: 'https://example.com/face-a.png' },
    ];

    expect(selectCraftEssenceAsset(assets, 'faces')?.url).toBe('https://example.com/face-a.png');
    expect(selectCraftEssenceAsset(assets, 'equipFaces')?.url).toBe(
      'https://example.com/equip.png',
    );
  });

  it('plans shared face-cache downloads from the basic servant catalogue', () => {
    expect(
      buildBasicServantFaceDownloadList(
        {
          servants: [
            { id: 100100, name: 'Artoria', face: 'https://example.com/f_1001000.png' },
            { id: 100100, name: 'Artoria duplicate', face: 'https://example.com/f_1001001.png' },
            { id: 100200, name: 'No image' },
          ],
        },
        '/atlas/assets/servants/faces',
      ),
    ).toEqual([
      {
        url: 'https://example.com/f_1001000.png',
        save_path: '/atlas/assets/servants/faces/100100_face.png',
      },
    ]);
  });

  it('separates full servant recognition assets by kind and removes scene duplicates', () => {
    const dirs = {
      faces: '/assets/faces',
      narrowFigure: '/assets/narrow_figure',
      commands: '/assets/commands',
      commandNp: '/assets/command_np',
      status: '/assets/status',
    };
    expect(
      buildServantRecognitionImageList(
        {
          servants: [
            {
              id: 100100,
              name: 'Artoria',
              assets: {
                team: [{ kind: 'faces', variant: 'a', url: 'https://example.com/face.png' }],
                face: [{ kind: 'faces', variant: 'a', url: 'https://example.com/face.png' }],
                battle: [
                  { kind: 'narrowFigure', variant: 'b', url: 'https://example.com/narrow.png' },
                ],
              },
            },
          ],
        },
        dirs,
      ),
    ).toEqual([
      {
        kind: 'faces',
        save_path: '/assets/faces/100100_faces_a.png',
        url: 'https://example.com/face.png',
      },
      {
        kind: 'narrowFigure',
        save_path: '/assets/narrow_figure/100100_narrowFigure_b.png',
        url: 'https://example.com/narrow.png',
      },
    ]);
  });
});
