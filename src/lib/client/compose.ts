/**
 * Canvas compositing for the editor.
 *
 * Kept as pure functions so the same code renders the on-screen preview and
 * the full-resolution export — what the user sees is exactly what downloads.
 */

export interface ComposeSettings {
  background:
    | { type: 'transparent' }
    | { type: 'color'; color: string }
    | { type: 'image'; url: string };
  /** Multiplier applied to the subject, 0.2–3. */
  scale: number;
  /** Subject offset as a fraction of canvas size, -1..1. */
  offsetX: number;
  offsetY: number;
  /** Degrees, any value; 90-degree steps come from the rotate buttons. */
  rotation: number;
  /** Output aspect ratio; null keeps the source ratio. */
  aspect: number | null;
  /** Zoom-to-fill padding around the subject as a fraction of the canvas. */
  padding: number;
}

export const DEFAULT_COMPOSE_SETTINGS: ComposeSettings = {
  background: { type: 'transparent' },
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  aspect: null,
  padding: 0,
};

export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Output dimensions for a given source and aspect choice. Cropping never
 * upscales: the canvas is inscribed in the source so no pixels are invented.
 */
export function resolveCanvasSize(source: CanvasSize, aspect: number | null): CanvasSize {
  if (!aspect) return { width: source.width, height: source.height };

  const sourceAspect = source.width / source.height;
  if (sourceAspect > aspect) {
    const height = source.height;
    return { width: Math.round(height * aspect), height };
  }
  const width = source.width;
  return { width, height: Math.round(width / aspect) };
}

/**
 * Draws the composition into `context`.
 *
 * @param subject decoded cutout
 * @param backgroundImage optional decoded replacement background
 */
export function drawComposition(
  context: CanvasRenderingContext2D,
  canvas: CanvasSize,
  subject: CanvasImageSource & CanvasSize,
  settings: ComposeSettings,
  backgroundImage?: (CanvasImageSource & CanvasSize) | null,
): void {
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (settings.background.type === 'color') {
    context.fillStyle = settings.background.color;
    context.fillRect(0, 0, width, height);
  } else if (settings.background.type === 'image' && backgroundImage) {
    drawCover(context, backgroundImage, width, height);
  }

  // Fit the subject inside the canvas, then apply the user's scale.
  const padded = 1 - Math.min(0.4, Math.max(0, settings.padding));
  const fit = Math.min(width / subject.width, height / subject.height) * padded;
  const drawWidth = subject.width * fit * settings.scale;
  const drawHeight = subject.height * fit * settings.scale;

  context.save();
  context.translate(
    width / 2 + settings.offsetX * width * 0.5,
    height / 2 + settings.offsetY * height * 0.5,
  );
  if (settings.rotation !== 0) {
    context.rotate((settings.rotation * Math.PI) / 180);
  }
  context.drawImage(subject, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
}

/** object-fit: cover, in canvas terms. */
function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & CanvasSize,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

/** Decodes a blob or URL into an ImageBitmap with its intrinsic size. */
export async function loadBitmap(
  source: Blob | string,
): Promise<ImageBitmap & CanvasSize> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  return (await createImageBitmap(blob)) as ImageBitmap & CanvasSize;
}

/**
 * Renders at full source resolution and returns a PNG blob.
 * The preview canvas is deliberately not reused — it is sized for the screen.
 */
export async function exportComposition(
  subject: ImageBitmap & CanvasSize,
  settings: ComposeSettings,
  backgroundImage?: (ImageBitmap & CanvasSize) | null,
): Promise<Blob> {
  const size = resolveCanvasSize(subject, settings.aspect);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');

  drawComposition(context, size, subject, settings, backgroundImage);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not export the image.'))),
      'image/png',
    );
  });
}

export const ASPECT_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: 'Original', value: null },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
];

export const COLOR_PRESETS = [
  '#ffffff',
  '#0e0e10',
  '#f4f2ee',
  '#d7f24b',
  '#2f6fed',
  '#e8563f',
  '#1f7a52',
  '#f6d365',
];
