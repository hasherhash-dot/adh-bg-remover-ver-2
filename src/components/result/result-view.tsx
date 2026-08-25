'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Download, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { BeforeAfterSlider, FullscreenCompare } from '@/components/compare/before-after-slider';
import { ImageEditor } from '@/components/editor/image-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BackgroundPicker,
  type ResultBackground,
} from '@/components/result/background-picker';
import { track } from '@/lib/analytics';
import { cn, cutoutFilename, formatBytes, formatDuration } from '@/lib/utils';
import type { ImageJob } from '@/lib/client/types';

/**
 * The result screen.
 *
 * One primary action — Download PNG — and everything else is visibly secondary.
 * Giving four buttons equal weight makes a user stop and read; giving one
 * obvious weight makes the screen resolve in a glance.
 *
 * Whatever is on screen is what downloads: the background picker swaps the
 * displayed blob, and download, copy and the metadata row all read from that
 * same blob.
 */

export interface ResultViewProps {
  job: ImageJob;
  onStartOver: () => void;
  /** Compact layout for the batch preview pane. */
  compact?: boolean;
}

export function ResultView({ job, onStartOver, compact = false }: ResultViewProps) {
  const { toast } = useToast();
  const [fullscreen, setFullscreen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justDownloaded, setJustDownloaded] = useState(false);

  const result = job.result;

  /**
   * The cutout with the chosen background applied. Null means "the untouched
   * transparent result", so no blob is duplicated until a colour is picked.
   */
  const [display, setDisplay] = useState<{ blob: Blob; url: string } | null>(null);
  const [background, setBackground] = useState<ResultBackground>({ type: 'transparent' });

  // Object URLs for composited variants are ours to revoke.
  useEffect(() => {
    const url = display?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [display]);

  const shownUrl = display?.url ?? result?.url ?? '';
  const shownBlob = display?.blob ?? result?.blob ?? null;
  const downloadName = useMemo(() => cutoutFilename(job.filename), [job.filename]);

  const download = useCallback(() => {
    if (!shownUrl) return;
    const anchor = document.createElement('a');
    anchor.href = shownUrl;
    anchor.download = downloadName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    track('download_clicked', { format: 'png', background: background.type });
    setJustDownloaded(true);
    setTimeout(() => setJustDownloaded(false), 2200);
  }, [background.type, downloadName, shownUrl]);

  const copy = useCallback(async () => {
    if (!shownBlob) return;
    try {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        throw new Error('unsupported');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': shownBlob })]);
      setCopied(true);
      track('copy_clicked', {});
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        tone: 'error',
        title: "Your browser wouldn't allow copying",
        description: 'Use Download instead — the file is ready.',
      });
    }
  }, [shownBlob, toast]);

  // Cmd/Ctrl+S downloads, matching the expectation set by every other app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        download();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [download]);

  if (!result) return null;

  const shownSize = shownBlob?.size ?? result.byteSize;

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      <BeforeAfterSlider
        beforeUrl={job.originalUrl}
        afterUrl={shownUrl}
        onRequestFullscreen={() => setFullscreen(true)}
        maxViewportHeight={compact ? 46 : 58}
      />

      <BackgroundPicker
        source={result.blob}
        onChange={(blob, next) => {
          setBackground(next);
          setDisplay(next.type === 'transparent' ? null : { blob, url: URL.createObjectURL(blob) });
        }}
      />

      {/* Primary action, then everything else. */}
      <div className="flex flex-col gap-2.5">
        <Button variant="accent" size="lg" onClick={download} className="w-full">
          {justDownloaded ? <Check aria-hidden /> : <Download aria-hidden />}
          {justDownloaded ? 'Saved to your downloads' : 'Download PNG'}
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-1">
          <Button variant="ghost" size="sm" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <span className="h-4 w-px bg-line" aria-hidden />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditorOpen(true);
              track('editor_opened', {});
            }}
          >
            <Sliders aria-hidden />
            Edit
          </Button>
          <span className="h-4 w-px bg-line" aria-hidden />
          <Button variant="ghost" size="sm" onClick={onStartOver}>
            <ArrowLeft aria-hidden />
            New image
          </Button>
        </div>
      </div>

      {/* Metadata — quiet, factual, reflects exactly what will download. */}
      <dl
        className={cn(
          'grid gap-x-6 gap-y-4 rounded-lg border border-line bg-paper-raised p-4',
          compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        <MetaItem label="Dimensions" value={`${result.width} × ${result.height}`} />
        <MetaItem label="File size" value={formatBytes(shownSize)} />
        <MetaItem label="Processing" value={formatDuration(result.processingTimeMs)} />
        <MetaItem
          label="Format"
          value={
            <span className="inline-flex items-center gap-1.5">
              PNG
              {background.type === 'transparent' ? (
                <Badge variant="accent" size="sm">
                  Transparent
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  <span
                    className="size-2.5 rounded-full border border-line-strong"
                    style={{ backgroundColor: background.color }}
                    aria-hidden
                  />
                  {background.color}
                </Badge>
              )}
            </span>
          }
        />
      </dl>

      <p className="text-center text-xs text-ink-subtle">
        Saves as <span className="font-medium text-ink-muted">{downloadName}</span>
      </p>

      {fullscreen && (
        <FullscreenCompare
          beforeUrl={job.originalUrl}
          afterUrl={shownUrl}
          onClose={() => setFullscreen(false)}
        />
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Edit image</DialogTitle>
          </DialogHeader>
          <ImageEditor
            resultBlob={result.blob}
            filename={job.filename}
            onClose={() => setEditorOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}
