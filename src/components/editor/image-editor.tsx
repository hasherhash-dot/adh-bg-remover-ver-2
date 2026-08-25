'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Crop,
  Download,
  Image as ImageIcon,
  Loader2,
  Redo2,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useEditorState } from '@/hooks/use-editor-state';
import { track } from '@/lib/analytics';
import {
  ASPECT_PRESETS,
  COLOR_PRESETS,
  DEFAULT_COMPOSE_SETTINGS,
  drawComposition,
  exportComposition,
  loadBitmap,
  resolveCanvasSize,
  type ComposeSettings,
} from '@/lib/client/compose';
import { cn, clamp, cutoutFilename } from '@/lib/utils';

/**
 * Lightweight post-processing editor.
 *
 * Scope is intentionally small: background, subject placement, crop ratio and
 * rotation. Everything renders through the same `drawComposition` used by the
 * exporter, so the preview is accurate, and the export runs at the source
 * image's full resolution.
 */

export interface ImageEditorProps {
  /** The transparent cutout produced by the service. */
  resultBlob: Blob;
  filename: string;
  onClose?: () => void;
  className?: string;
}

export function ImageEditor({ resultBlob, filename, onClose, className }: ImageEditorProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const subjectRef = useRef<(ImageBitmap & { width: number; height: number }) | null>(null);
  const backgroundRef = useRef<(ImageBitmap & { width: number; height: number }) | null>(null);
  const dragState = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null,
  );
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const colorInputId = useId();

  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [backgroundName, setBackgroundName] = useState<string | null>(null);

  const history = useEditorState<ComposeSettings>(DEFAULT_COMPOSE_SETTINGS);
  const { state: settings, set } = history;

  // Decode the cutout once; every re-render draws from the same bitmap.
  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;

    void loadBitmap(resultBlob).then((decoded) => {
      if (cancelled) {
        decoded.close();
        return;
      }
      bitmap = decoded;
      subjectRef.current = decoded;
      setReady(true);
    });

    return () => {
      cancelled = true;
      bitmap?.close();
      subjectRef.current = null;
    };
  }, [resultBlob]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const subject = subjectRef.current;
    if (!canvas || !subject) return;

    const output = resolveCanvasSize(subject, settings.aspect);
    // The preview is capped; the export uses full resolution.
    const previewScale = Math.min(1, 1200 / Math.max(output.width, output.height));
    const width = Math.max(1, Math.round(output.width * previewScale));
    const height = Math.max(1, Math.round(output.height * previewScale));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext('2d');
    if (!context) return;
    drawComposition(context, { width, height }, subject, settings, backgroundRef.current);
  }, [settings]);

  useEffect(() => {
    if (ready) render();
  }, [ready, render]);

  const onBackgroundFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ tone: 'error', title: 'That file is not an image.' });
      return;
    }
    try {
      backgroundRef.current?.close();
      backgroundRef.current = await loadBitmap(file);
      setBackgroundName(file.name);
      set((current) => ({ ...current, background: { type: 'image', url: file.name } }));
      track('editor_background_changed', { type: 'image' });
    } catch {
      toast({ tone: 'error', title: "We couldn't read that background image." });
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    set(
      (current) => ({
        ...current,
        offsetX: clamp(drag.offsetX + ((event.clientX - drag.x) / rect.width) * 2, -1, 1),
        offsetY: clamp(drag.offsetY + ((event.clientY - drag.y) / rect.height) * 2, -1, 1),
      }),
      { coalesceKey: 'position' },
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  };

  const download = async () => {
    const subject = subjectRef.current;
    if (!subject) return;
    setExporting(true);
    try {
      const blob = await exportComposition(subject, settings, backgroundRef.current);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = cutoutFilename(filename);
      anchor.click();
      URL.revokeObjectURL(url);
      track('download_clicked', { format: 'png', background: settings.background.type });
      toast({ tone: 'success', title: 'Image downloaded' });
    } catch {
      toast({ tone: 'error', title: "We couldn't export the image.", description: 'Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  // Keyboard shortcuts matching every other editor the user has ever used.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history]);

  useEffect(() => {
    const background = backgroundRef;
    return () => {
      background.current?.close();
      background.current = null;
    };
  }, []);

  return (
    <div className={cn('grid gap-6 lg:grid-cols-[1fr_300px]', className)}>
      {/* Canvas */}
      <div className="flex flex-col gap-3">
        <div className="flex min-h-52 items-center justify-center">
          {!ready && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Preparing editor…
            </div>
          )}
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={cn(
              'checkerboard max-h-[46vh] max-w-full rounded-lg border border-line',
              'cursor-grab touch-none active:cursor-grabbing',
              !ready && 'hidden',
            )}
            aria-label="Editable preview. Drag to reposition the subject."
          />
        </div>
        <p className="text-center text-xs text-ink-subtle">
          Drag the subject to reposition
          <span className="hidden sm:inline"> · ⌘Z to undo</span>
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={history.undo}
            disabled={!history.canUndo}
            aria-label="Undo"
          >
            <Undo2 aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label="Redo"
          >
            <Redo2 aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              history.reset();
              backgroundRef.current?.close();
              backgroundRef.current = null;
              setBackgroundName(null);
            }}
          >
            Reset
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={onClose}
              aria-label="Close editor"
            >
              <X aria-hidden />
            </Button>
          )}
        </div>

        <Section title="Background">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                set((c) => ({ ...c, background: { type: 'transparent' } }));
                track('editor_background_changed', { type: 'transparent' });
              }}
              aria-pressed={settings.background.type === 'transparent'}
              className={cn(
                'checkerboard checkerboard-sm size-8 rounded-xs border transition-all',
                settings.background.type === 'transparent'
                  ? 'border-ink ring-2 ring-ink ring-offset-2'
                  : 'border-line hover:border-ink/40',
              )}
              title="Transparent"
              aria-label="Transparent background"
            />
            {COLOR_PRESETS.map((color) => {
              const active =
                settings.background.type === 'color' && settings.background.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    set((c) => ({ ...c, background: { type: 'color', color } }));
                    track('editor_background_changed', { type: 'color' });
                  }}
                  aria-pressed={active}
                  aria-label={`Background colour ${color}`}
                  title={color}
                  className={cn(
                    'size-8 rounded-xs border transition-all',
                    active
                      ? 'border-ink ring-2 ring-ink ring-offset-2'
                      : 'border-line hover:border-ink/40',
                  )}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <label
              htmlFor={colorInputId}
              className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted"
            >
              <input
                id={colorInputId}
                type="color"
                value={
                  settings.background.type === 'color' ? settings.background.color : '#ffffff'
                }
                onChange={(event) =>
                  set((c) => ({ ...c, background: { type: 'color', color: event.target.value } }), {
                    coalesceKey: 'color',
                  })
                }
                className="size-8 cursor-pointer rounded-xs border border-line bg-transparent p-0.5"
              />
              Custom colour
            </label>
          </div>

          <input
            ref={backgroundInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              void onBackgroundFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => backgroundInputRef.current?.click()}
          >
            <ImageIcon aria-hidden />
            {backgroundName ? 'Change background image' : 'Upload background image'}
          </Button>
          {backgroundName && (
            <p className="mt-1.5 truncate text-xs text-ink-subtle" title={backgroundName}>
              {backgroundName}
            </p>
          )}
        </Section>

        <Section title="Subject">
          <SliderRow
            label="Scale"
            value={settings.scale}
            min={0.2}
            max={3}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(value) => set((c) => ({ ...c, scale: value }), { coalesceKey: 'scale' })}
          />
          <SliderRow
            label="Padding"
            value={settings.padding}
            min={0}
            max={0.4}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(value) =>
              set((c) => ({ ...c, padding: value }), { coalesceKey: 'padding' })
            }
          />
          <div className="mt-3 flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => set((c) => ({ ...c, rotation: c.rotation - 90 }))}
              aria-label="Rotate left 90 degrees"
            >
              <RotateCcw aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => set((c) => ({ ...c, rotation: c.rotation + 90 }))}
              aria-label="Rotate right 90 degrees"
            >
              <RotateCw aria-hidden />
            </Button>
            <span className="ml-1 text-xs tabular-nums text-ink-subtle">
              {((settings.rotation % 360) + 360) % 360}°
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => set((c) => ({ ...c, offsetX: 0, offsetY: 0 }))}
            >
              Centre
            </Button>
          </div>
        </Section>

        <Section title="Crop" icon={<Crop className="size-3.5" aria-hidden />}>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => set((c) => ({ ...c, aspect: preset.value }))}
                aria-pressed={settings.aspect === preset.value}
                className={cn(
                  'rounded-xs border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  settings.aspect === preset.value
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line text-ink-muted hover:border-ink/35 hover:text-ink',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Section>

        <Button
          variant="accent"
          size="lg"
          className="sticky bottom-0 z-10 w-full shadow-float lg:static lg:shadow-subtle"
          onClick={download}
          loading={exporting}
          loadingLabel="Exporting…"
          disabled={!ready}
        >
          <Download aria-hidden />
          Download PNG
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">
          {label}
        </label>
        <span className="text-xs tabular-nums text-ink-subtle">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range-input"
      />
    </div>
  );
}
