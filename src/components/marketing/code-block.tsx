'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Copyable code sample. No syntax highlighter: shipping a tokeniser to render
 * eight lines of curl would cost more than it is worth, and monospaced ink on
 * paper reads perfectly well.
 */
export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the text is selectable either way.
    }
  };

  return (
    <div className={cn('group relative', className)}>
      <pre className="overflow-x-auto scrollbar-slim rounded-md border border-line bg-ink p-4 pr-12 text-[13px] leading-relaxed text-paper/90">
        <code className="font-mono">{code}</code>
      </pre>
      {language && (
        <span className="absolute left-4 top-0 -translate-y-1/2 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-subtle">
          {language}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        className="absolute right-2.5 top-2.5 rounded-xs p-1.5 text-paper/50 transition-colors hover:bg-paper/10 hover:text-paper focus-visible:outline-paper"
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
