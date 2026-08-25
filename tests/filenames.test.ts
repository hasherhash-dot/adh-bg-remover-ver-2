import { describe, expect, it } from 'vitest';
import { cutoutFilename, formatBytes, formatDuration, replaceExtension } from '@/lib/utils';

/**
 * Download naming.
 *
 * Two failure modes worth guarding: a PNG that still carries `.jpg` in its
 * name (confusing, and some tools trust the extension), and a suffix that
 * stacks every time an already-processed file is run through again.
 */
describe('cutoutFilename', () => {
  it.each([
    ['photo.jpg', 'photo-no-background.png'],
    ['photo.jpeg', 'photo-no-background.png'],
    ['IMG_4021.HEIC', 'IMG_4021-no-background.png'],
    ['shot.webp', 'shot-no-background.png'],
    ['already.png', 'already-no-background.png'],
    ['no-extension', 'no-extension-no-background.png'],
  ])('%s -> %s', (input, expected) => {
    expect(cutoutFilename(input)).toBe(expected);
  });

  it('never leaves the source extension inside the name', () => {
    for (const name of ['a.jpg', 'b.jpeg', 'c.webp', 'd.heic', 'e.avif']) {
      const result = cutoutFilename(name);
      expect(result.endsWith('.png')).toBe(true);
      expect(result.slice(0, -4)).not.toMatch(/\.(jpe?g|webp|heic|avif)$/i);
    }
  });

  it('does not stack the suffix on a repeat download', () => {
    const once = cutoutFilename('photo.jpg');
    expect(cutoutFilename(once)).toBe(once);
    expect(cutoutFilename(cutoutFilename(once))).toBe(once);
  });

  it('falls back to a usable name for empty input', () => {
    expect(cutoutFilename('')).toBe('image-no-background.png');
    expect(cutoutFilename('   ')).toBe('image-no-background.png');
  });

  it('keeps dots inside the stem', () => {
    expect(cutoutFilename('my.photo.v2.jpg')).toBe('my.photo.v2-no-background.png');
  });
});

describe('replaceExtension', () => {
  it('swaps the extension without touching the stem', () => {
    expect(replaceExtension('photo.jpg', 'png')).toBe('photo.png');
    expect(replaceExtension('archive', 'zip')).toBe('archive.zip');
  });
});

describe('display formatting', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [2048, '2 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('handles nonsense byte counts without rendering NaN', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });

  it.each([
    [250, '250 ms'],
    [1500, '1.5 s'],
    [16_500, '16.5 s'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('handles nonsense durations without rendering NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});
