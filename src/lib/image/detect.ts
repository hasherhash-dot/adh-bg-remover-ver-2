/**
 * Content-sniffing for uploaded images.
 *
 * The browser-supplied MIME type and the filename extension are both trivially
 * spoofed, so neither is trusted. Every upload is identified from its magic
 * bytes before it reaches a decoder.
 */

export type DetectedImageType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff'
  | 'image/avif'
  | 'image/heic'
  | 'image/heif';

/** Formats the pipeline accepts as input. */
export const SUPPORTED_INPUT_TYPES: readonly DetectedImageType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
] as const;

const startsWith = (buf: Buffer, bytes: readonly number[], offset = 0): boolean => {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
};

/**
 * ISO base media files (HEIC/HEIF/AVIF) share a container. The brand string in
 * the `ftyp` box at offset 8 tells them apart.
 */
function detectIsoBmff(buf: Buffer): DetectedImageType | null {
  if (buf.length < 12) return null;
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return null;

  const majorBrand = buf.toString('ascii', 8, 12);
  // Compatible brands follow the major brand and 4-byte minor version.
  const boxSize = Math.min(buf.readUInt32BE(0), buf.length);
  const brands = new Set<string>([majorBrand]);
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.add(buf.toString('ascii', offset, offset + 4));
  }

  if (brands.has('avif') || brands.has('avis')) return 'image/avif';
  if (brands.has('heic') || brands.has('heix') || brands.has('hevc') || brands.has('hevx')) {
    return 'image/heic';
  }
  if (brands.has('mif1') || brands.has('msf1') || brands.has('heim') || brands.has('heis')) {
    return 'image/heif';
  }
  return null;
}

/**
 * Identify an image from its leading bytes.
 * @returns the detected MIME type, or null if the bytes are not a known image.
 */
export function detectImageType(buf: Buffer): DetectedImageType | null {
  if (buf.length < 12) return null;

  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(buf, [0x42, 0x4d])) return 'image/bmp';
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'image/tiff';
  }
  // RIFF....WEBP
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return detectIsoBmff(buf);
}

export function isSupportedInputType(type: DetectedImageType | null): type is DetectedImageType {
  return type !== null && SUPPORTED_INPUT_TYPES.includes(type);
}

/** HEIC/HEIF need a JS decoder before sharp can see them. */
export function requiresHeicDecode(type: DetectedImageType): boolean {
  return type === 'image/heic' || type === 'image/heif';
}

/**
 * Strips directory components and control characters from a client-supplied
 * filename, then clamps its length. The result is only ever used to name a
 * download — it is never used to build a filesystem path.
 */
export function sanitizeFilename(name: string, fallback = 'image'): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  /* eslint-disable-next-line no-control-regex */
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/^\.+/, '')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 120);
}

/** `photo.heic` -> `photo.png` */
export function toPngFilename(name: string): string {
  const safe = sanitizeFilename(name);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  return `${stem || 'image'}.png`;
}
