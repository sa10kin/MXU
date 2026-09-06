import { describe, it, expect } from 'vitest';
import { decodeDataUrl } from './useFrameUrl';

describe('decodeDataUrl', () => {
  it('解出正确的 mime 与字节', async () => {
    // "PNG!" 的 base64
    const blob = decodeDataUrl('data:image/png;base64,UE5HIQ==');
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/png');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(
      new Uint8Array([0x50, 0x4e, 0x47, 0x21]),
    );
  });

  it('非 base64 的 data URL 返回 null（调用方退回原始字符串）', () => {
    expect(decodeDataUrl('data:image/png,notbase64')).toBeNull();
  });

  it('非 data URL 返回 null', () => {
    expect(decodeDataUrl('blob:http://localhost/abc')).toBeNull();
    expect(decodeDataUrl('')).toBeNull();
  });

  it('base64 载荷损坏时返回 null 而不是抛出', () => {
    expect(decodeDataUrl('data:image/png;base64,@@@')).toBeNull();
  });
});
