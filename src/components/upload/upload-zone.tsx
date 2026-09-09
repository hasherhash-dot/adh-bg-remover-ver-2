'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Sparkles, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACCEPT_ATTRIBUTE, UPLOAD_LIMITS } from '@/lib/config/public';
import { Button } from '@/components/ui/button';

/** Native image drags can contain Files too; only external drags are uploads. */
function useInternalDrag() {
  const internal = useRef(false);
  useEffect(() => {
    const start = () => { internal.current = true; };
    const end = () => { internal.current = false; };
    window.addEventListener('dragstart', start, true);
    window.addEventListener('dragend', end, true);
    return () => {
      window.removeEventListener('dragstart', start, true);
      window.removeEventListener('dragend', end, true);
    };
  }, []);
  return internal;
}

/**
 * The primary way images enter the product. Supports four input paths — drop,
 * click-to-browse, keyboard activation and clipboard paste — because on
 * different devices each one is the obvious gesture.
 *
 * Accessibility: the drop area is a real <button>, so it is reachable by Tab,
 * activates on Enter/Space, and announces itself and the accepted formats. The
 * file input behind it is taken out of the tab order — two stops for one
 * control, one of them invisible and unlabelled, is worse than one good stop.
 */

export interface UploadZoneProps {
  onFiles: (files: File[], source: 'drop' | 'browse' | 'paste') => void;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  /** Listen for paste anywhere on the page, not just when focused. */
  globalPaste?: boolean;
}

export function UploadZone({
  onFiles,
  multiple = true,
  disabled = false,
  className,
  globalPaste = true,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const internalDrag = useInternalDrag();
  const inputId = useId();
  const descriptionId = `${inputId}-description`;

  const emit = useCallback(
    (list: FileList | File[] | null, source: 'drop' | 'browse' | 'paste') => {
      if (!list) return;
      const files = Array.from(list);
      if (files.length === 0) return;
      onFiles(multiple ? files : files.slice(0, 1), source);
    },
    [multiple, onFiles],
  );

  // Clipboard support: Cmd/Ctrl+V anywhere on the page, as long as the user is
  // not typing into a field.
  useEffect(() => {
    if (!globalPaste || disabled) return;

    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;

      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (files.length > 0) {
        event.preventDefault();
        emit(files, 'paste');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [emit, globalPaste, disabled]);

  // dragenter/dragleave fire for every child element, so depth is counted
  // rather than toggled — otherwise the highlight flickers as the pointer
  // crosses inner nodes.
  const onDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    if (disabled || internalDrag.current) return;
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const onDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (disabled || internalDrag.current) return;
    emit(event.dataTransfer.files, 'drop');
  };

  const maxMb = Math.round(UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024));

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        // The button below is the accessible control. Leaving this input in the
        // tab order would add an invisible stop that announces nothing useful.
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          emit(event.target.files, 'browse');
          // Allow re-selecting the same file immediately after removing it.
          event.target.value = '';
        }}
      />

      <button
        type="button"
        disabled={disabled}
        aria-describedby={descriptionId}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'group relative flex w-full flex-col items-center justify-center gap-4 overflow-hidden',
          'rounded-xl border-2 border-dashed text-center transition-all duration-300 ease-out-soft',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'px-6 py-14 sm:px-10 sm:py-20',
          isDragging
            ? 'border-ink bg-accent-soft scale-[1.005]'
            : 'border-line-strong bg-paper-raised hover:border-ink/35 hover:bg-paper-sunken/60',
        )}
      >
        {/* Drag highlight wash — pointer-events-none so it never blocks drop */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-300',
            isDragging ? 'opacity-100' : 'opacity-0',
          )}
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 50% 50%, rgb(215 242 75 / 0.35), transparent 70%)',
          }}
        />

        <span
          className={cn(
            'relative flex items-center justify-center rounded-lg border transition-all duration-300',
            'size-14',
            isDragging
              ? 'border-ink bg-ink text-accent scale-110'
              : 'border-line bg-paper-sunken text-ink-muted group-hover:border-ink/25 group-hover:text-ink',
          )}
        >
          {isDragging ? (
            <ImagePlus className="size-6" aria-hidden />
          ) : (
            <Upload className="size-6" aria-hidden />
          )}
        </span>

        <span className="relative flex flex-col items-center gap-1.5">
          <span
            className={cn(
              'font-medium tracking-tight text-ink',
              'text-lg',
            )}
          >
            {isDragging ? 'Drop to remove the background' : 'Drop an image here'}
          </span>
          <span className="text-sm text-ink-muted">
            or{' '}
            <span className="font-medium text-ink underline decoration-line-strong underline-offset-4">
              browse your files
            </span>
            <span className="hidden sm:inline"> · paste with ⌘V</span>
          </span>
        </span>

        <span id={descriptionId} className="relative mt-1 text-xs text-ink-subtle">
          JPG, PNG, WEBP or HEIC · up to {maxMb}MB
          {multiple ? ` · up to ${UPLOAD_LIMITS.maxBatchFiles} at once` : ''}
        </span>
      </button>
    </div>
  );
}

/**
 * A page-wide drop target. Lets the user drop an image anywhere once the studio
 * already has content, without hunting for the original drop area.
 */
export function GlobalDropOverlay({
  onFiles,
  enabled = true,
}: {
  onFiles: (files: File[]) => void;
  enabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const depth = useRef(0);
  const internalDrag = useInternalDrag();

  useEffect(() => {
    if (!enabled) return;

    const onEnter = (event: DragEvent) => {
      if (internalDrag.current || !event.dataTransfer?.types.includes('Files')) return;
      depth.current += 1;
      setVisible(true);
    };
    const onLeave = () => {
      depth.current -= 1;
      if (depth.current <= 0) {
        depth.current = 0;
        setVisible(false);
      }
    };
    const onOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      const handledByDropZone = event.defaultPrevented;
      event.preventDefault();
      depth.current = 0;
      setVisible(false);
      if (internalDrag.current || handledByDropZone) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled, onFiles, internalDrag]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-8 backdrop-blur-sm animate-fade-in"
      aria-hidden
    >
      <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-accent bg-paper-raised px-12 py-10 shadow-float">
        <Sparkles className="size-7 text-ink" aria-hidden />
        <p className="text-lg font-medium tracking-tight text-ink">Drop to add images</p>
      </div>
    </div>
  );
}

/** Small "add more" affordance used above the batch queue. */
export function AddMoreButton({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFiles(files);
          event.target.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus aria-hidden />
        Add images
      </Button>
    </>
  );
}
