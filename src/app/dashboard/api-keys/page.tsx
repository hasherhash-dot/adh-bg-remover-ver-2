'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatRelativeTime } from '@/lib/utils';

interface ApiKeySummary {
  id: string;
  name: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
}

/**
 * API key management.
 *
 * The plaintext key exists in exactly one response and is shown in a dialog the
 * user must dismiss. It is never fetched again, because only its digest is
 * stored — so the UI has to make copying it feel deliberate.
 */
export default function ApiKeysPage() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/api-keys');
      const data = await response.json();
      setKeys(response.ok ? (data.keys ?? []) : []);
    } catch {
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Untitled key' }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setNoAccess(true);
          toast({
            tone: 'info',
            title: 'API keys are not available yet',
            description: 'The API works, but key management is not open to accounts yet.',
          });
        } else {
          toast({ tone: 'error', title: data?.error?.message ?? 'Could not create the key.' });
        }
        return;
      }

      setIssuedKey(data.key);
      setName('');
      await load();
    } catch {
      toast({ tone: 'error', title: 'Could not reach the server.' });
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    const response = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (response.ok) {
      await load();
      toast({ tone: 'success', title: 'Key revoked' });
    } else {
      toast({ tone: 'error', title: 'Could not revoke that key.' });
    }
  };

  const copyKey = async () => {
    if (!issuedKey) return;
    try {
      await navigator.clipboard.writeText(issuedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ tone: 'error', title: 'Copy the key manually — clipboard access was blocked.' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">API keys</h1>
        <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-muted">
          Keys authenticate server-to-server calls. Only a hash is stored, so a key is shown once
          and cannot be recovered afterwards.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-paper-raised p-4">
        <div className="min-w-48 flex-1">
          <label htmlFor="key-name" className="text-xs font-medium text-ink-muted">
            Key name
          </label>
          <input
            id="key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Production server"
            maxLength={64}
            className="mt-1.5 h-10 w-full rounded-sm border border-control bg-paper px-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:border-ink"
          />
        </div>
        <Button onClick={create} loading={creating} loadingLabel="Creating…">
          <Plus aria-hidden />
          Create key
        </Button>
      </div>

      {noAccess && (
        <p className="rounded-md border border-line bg-paper-sunken p-4 text-sm leading-relaxed text-ink-muted">
          The API endpoints and key management are implemented and tested, but issuing keys is
          switched off while there is no account system to attach them to. Nothing to buy — this is
          simply not finished yet.
        </p>
      )}

      {keys === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-md" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="size-5" aria-hidden />}
          title="No API keys yet"
          body="Create a key to call the API from your own server. Keys can be revoked at any time."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-paper-raised p-4"
            >
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium text-ink">{key.name}</p>
                <code className="mt-1 block font-mono text-xs text-ink-subtle">{key.preview}</code>
              </div>
              <div className="text-xs text-ink-subtle">
                <p>Created {formatRelativeTime(key.createdAt)}</p>
                <p className="mt-0.5">
                  {key.lastUsedAt
                    ? `Last used ${formatRelativeTime(key.lastUsedAt)}`
                    : 'Never used'}
                </p>
              </div>
              <Badge variant="neutral" size="sm">
                {key.requestCount.toLocaleString()} requests
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => revoke(key.id)}
                aria-label={`Revoke ${key.name}`}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-line bg-paper-sunken p-5">
        <h2 className="text-sm font-semibold text-ink">Using a key</h2>
        <pre className="mt-3 overflow-x-auto scrollbar-slim rounded-sm bg-ink p-3.5 text-[12.5px] text-paper/90">
          <code className="font-mono">{`curl -X POST /api/remove-background \\
  -H "Authorization: Bearer adh_live_..." \\
  -F "image=@photo.jpg" -o cutout.png`}</code>
        </pre>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Keep keys on your server. Anything shipped to a browser or an extension is readable by
          anyone who looks — see the{' '}
          <Link href="/api" className="underline underline-offset-4">
            API reference
          </Link>
          .
        </p>
      </div>

      <Dialog open={issuedKey !== null} onOpenChange={(open) => !open && setIssuedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription>
              This is the only time it will be shown. Only a hash is stored, so it cannot be
              retrieved again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-sm border border-line bg-paper-sunken p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-ink">
              {issuedKey}
            </code>
            <Button variant="outline" size="icon-sm" onClick={copyKey} aria-label="Copy key">
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setIssuedKey(null)}>I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
