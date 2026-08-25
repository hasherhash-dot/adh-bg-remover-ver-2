import sharp from 'sharp';

/**
 * Synthetic fixtures. Generated rather than committed as binaries so the test
 * suite stays dependency-free and the images can be parameterised per test.
 */

export interface FixtureOptions {
  width?: number;
  height?: number;
  /** Background colour — the mock provider keys off the border colour. */
  background?: string;
  subject?: string;
}

/** A clearly-separable subject (dark blob) on a flat light background. */
export async function subjectOnFlatBackground(options: FixtureOptions = {}) {
  const width = options.width ?? 400;
  const height = options.height ?? 300;
  const background = options.background ?? '#f2f4f7';
  const subject = options.subject ?? '#101820';

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${background}"/>
    <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 5}" ry="${height / 3}" fill="${subject}"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function asJpeg(options: FixtureOptions = {}): Promise<Buffer> {
  return sharp(await subjectOnFlatBackground(options)).jpeg({ quality: 92 }).toBuffer();
}

export async function asWebp(options: FixtureOptions = {}): Promise<Buffer> {
  return sharp(await subjectOnFlatBackground(options)).webp().toBuffer();
}

/** Valid header, truncated body — decoders must reject this. */
export async function corruptedPng(): Promise<Buffer> {
  const valid = await subjectOnFlatBackground({ width: 64, height: 64 });
  return valid.subarray(0, 40);
}

export function notAnImage(): Buffer {
  return Buffer.from('#!/bin/sh\necho "definitely not an image"\n', 'utf8');
}

/** Reports enormous dimensions in the header to test the pixel budget. */
export function pixelBombHeader(): Buffer {
  // PNG signature + IHDR declaring 60000x60000.
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(60_000, 8);
  ihdr.writeUInt32BE(60_000, 12);
  ihdr.writeUInt8(8, 16);
  ihdr.writeUInt8(6, 17);
  return Buffer.concat([signature, ihdr]);
}
