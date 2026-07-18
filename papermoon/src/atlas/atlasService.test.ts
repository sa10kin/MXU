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
  buildServantIndex,
  buildServantRecognitionImageList,
  missingAtlasDatasets,
  selectCraftEssenceAsset,
  selectServantsForRecognitionDownload,
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
        dataset: 'servants',
        atlas_id: 100100,
        kind: 'faces',
        variant: 'basic',
      },
    ]);
  });

  it('separates full servant recognition assets by kind and removes scene duplicates', () => {
    const dirs = {
      faces: '/assets/faces',
      narrowFigure: '/assets/narrow_figure',
      commands: '/assets/commands',
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
        dataset: 'servants',
        atlas_id: 100100,
        kind: 'faces',
        variant: 'a',
        save_path: '/assets/faces/100100_faces_a.png',
        url: 'https://example.com/face.png',
      },
      {
        dataset: 'servants',
        atlas_id: 100100,
        kind: 'narrowFigure',
        variant: 'b',
        save_path: '/assets/narrow_figure/100100_narrowFigure_b.png',
        url: 'https://example.com/narrow.png',
      },
    ]);
  });

  it('marks known collectionNo zero records as internal battle forms', () => {
    const index = buildServantIndex(
      [
        { id: 2501400, collectionNo: 413, name: 'Aoko', extraAssets: {} },
        {
          id: 2501500,
          collectionNo: 0,
          name: 'Super Aoko',
          extraAssets: {
            commands: { ascension: { 0: 'https://example.com/aoko-command.png' } },
          },
        },
      ],
      'TW',
    );

    expect(index.servants[0]).toMatchObject({ selectable: true });
    expect(index.servants[1]).toMatchObject({
      selectable: false,
      formOf: 2501400,
      formType: 'battleTransformation',
      recognitionScopes: ['battle'],
    });
    expect(index.servants[1].assets.command).toContainEqual({
      kind: 'commands',
      variant: 'ascension/0',
      url: 'https://example.com/aoko-command.png',
    });
  });

  it('skips unknown collectionNo zero records from bulk recognition downloads', () => {
    const dirs = {
      faces: '/assets/faces',
      narrowFigure: '/assets/narrow_figure',
      commands: '/assets/commands',
      status: '/assets/status',
    };
    const entries = buildServantRecognitionImageList(
      {
        servants: [
          {
            id: 999,
            collectionNo: 0,
            name: 'Unknown internal form',
            assets: {
              command: [{ kind: 'commands', variant: 'a', url: 'https://example.com/command.png' }],
            },
          },
        ],
      },
      dirs,
    );

    expect(entries).toEqual([]);
  });

  it('keeps battle assets but skips selection figures for internal forms', () => {
    const dirs = {
      faces: '/assets/faces',
      narrowFigure: '/assets/narrow_figure',
      commands: '/assets/commands',
      status: '/assets/status',
    };
    const entries = buildServantRecognitionImageList(
      {
        servants: [
          {
            id: 2501500,
            collectionNo: 0,
            name: 'Super Aoko',
            selectable: false,
            formOf: 2501400,
            formType: 'battleTransformation',
            recognitionScopes: ['battle'],
            assets: {
              battle: [
                {
                  kind: 'narrowFigure',
                  variant: '0',
                  url: 'https://example.com/aoko-narrow.png',
                },
              ],
              command: [
                {
                  kind: 'commands',
                  variant: '0',
                  url: 'https://example.com/aoko-command.png',
                },
              ],
            },
          },
        ],
      },
      dirs,
    );

    expect(entries).toEqual([
      {
        dataset: 'servants',
        atlas_id: 2501500,
        kind: 'commands',
        variant: '0',
        save_path: '/assets/commands/2501500_commands_0.png',
        url: 'https://example.com/aoko-command.png',
      },
    ]);
  });
});

describe('selectServantsForRecognitionDownload', () => {
  it('keeps planned servants and their internal battle forms', () => {
    const servants = [
      { id: 2501400, collectionNo: 413, name: 'Aoko' },
      { id: 2501500, collectionNo: 0, name: 'Super Aoko', formOf: 2501400 },
      { id: 100100, collectionNo: 2, name: 'Artoria' },
    ];
    const selected = selectServantsForRecognitionDownload(servants, [2501400]);
    expect(selected.map((servant) => servant.id)).toEqual([2501400, 2501500]);
  });
});
