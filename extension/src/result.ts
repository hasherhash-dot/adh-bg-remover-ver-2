import { getJob, JOB_UPDATED, type Job } from './lib/jobs';
import { getSettings } from './lib/settings';
import { toPngName } from './lib/api';

/**
 * Result page.
 *
 * Reads the job from IndexedDB on load, then listens for updates from the
 * service worker. Reading first matters: the tab is opened before the work
 * finishes, so the broadcast may already have fired by the time this script
 * runs.
 */

const jobId = location.hash.replace(/^#/, '');

const statusEl = el<HTMLDivElement>('status');
const statusText = el<HTMLSpanElement>('status-text');
const resultEl = el<HTMLDivElement>('result');
const errorEl = el<HTMLDivElement>('error');
const errorText = el<HTMLSpanElement>('error-text');

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const objectUrls: string[] = [];
let currentJob: Job | null = null;

function trackUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}

window.addEventListener('pagehide', () => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

async function render(): Promise<void> {
  if (!jobId) {
    showError('No image was specified.');
    return;
  }

  const job = await getJob(jobId);
  if (!job) {
    showError('That image is no longer available. It may have been cleared to save space.');
    return;
  }
  currentJob = job;

  if (job.state === 'error') {
    showError(job.error ?? 'Something went wrong.');
    return;
  }

  if (job.state !== 'done' || !job.result) {
    statusEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    statusText.textContent =
      job.state === 'processing' ? 'Removing background…' : 'Fetching the image…';
    return;
  }

  statusEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultEl.classList.remove('hidden');

  if (job.original) {
    el<HTMLImageElement>('img-before').src = trackUrl(job.original);
  }
  el<HTMLImageElement>('img-after').src = trackUrl(job.result);

  el<HTMLElement>('meta-dimensions').textContent =
    job.width && job.height ? `${job.width} × ${job.height}` : '—';
  el<HTMLElement>('meta-size').textContent = formatBytes(job.byteSize ?? job.result.size);
  el<HTMLElement>('meta-time').textContent = job.processingTimeMs
    ? `${(job.processingTimeMs / 1000).toFixed(1)} s`
    : '—';

  document.title = `${toPngName(job.filename)} — ADH`;
}

function showError(message: string): void {
  statusEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  errorEl.classList.remove('hidden');
  errorText.textContent = message;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === JOB_UPDATED && message.jobId === jobId) {
    void render();
  }
});

el<HTMLButtonElement>('download').addEventListener('click', () => {
  if (!currentJob?.result) return;
  const url = trackUrl(currentJob.result);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = toPngName(currentJob.filename);
  anchor.click();
});

el<HTMLButtonElement>('copy').addEventListener('click', async () => {
  if (!currentJob?.result) return;
  const button = el<HTMLButtonElement>('copy');
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentJob.result })]);
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy image'), 2000);
  } catch {
    button.textContent = 'Copy blocked — use Download';
    setTimeout(() => (button.textContent = 'Copy image'), 3000);
  }
});

el<HTMLButtonElement>('open-web-app').addEventListener('click', () => {
  void getSettings().then((settings) => {
    window.open(`${settings.apiBaseUrl}/remove-background`, '_blank', 'noopener');
  });
});

el<HTMLButtonElement>('retry').addEventListener('click', () => {
  statusEl.classList.remove('hidden');
  errorEl.classList.add('hidden');
  statusText.textContent = 'Retrying…';
  void chrome.runtime.sendMessage({ type: 'adh:process-job', jobId });
});

el<HTMLButtonElement>('open-options-error').addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void render();
