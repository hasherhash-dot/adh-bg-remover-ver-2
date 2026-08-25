import { createJobId, putJob, type Job } from './lib/jobs';
import { getRecents, getSettings } from './lib/settings';

/**
 * Popup.
 *
 * The popup does not process anything itself — a popup is destroyed the moment
 * it loses focus, which would abort an in-flight request. Instead it writes the
 * file into IndexedDB, asks the service worker to take over, and opens the
 * result tab. The work then survives the popup closing.
 */

const dropzone = byId<HTMLButtonElement>('dropzone');
const fileInput = byId<HTMLInputElement>('file-input');
const status = byId<HTMLDivElement>('status');
const statusText = byId<HTMLSpanElement>('status-text');
const recentsGrid = byId<HTMLDivElement>('recents');
const recentsEmpty = byId<HTMLParagraphElement>('recents-empty');

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'];
const MAX_BYTES = 25 * 1024 * 1024;

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  void handleFiles(Array.from(fileInput.files ?? []));
  fileInput.value = '';
});

let dragDepth = 0;
dropzone.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropzone.classList.add('dragging');
});
dropzone.addEventListener('dragover', (event) => event.preventDefault());
dropzone.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
    dropzone.classList.remove('dragging');
  }
});
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('dragging');
  void handleFiles(Array.from(event.dataTransfer?.files ?? []));
});

// Paste straight into the popup.
document.addEventListener('paste', (event) => {
  const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  );
  if (files.length > 0) void handleFiles(files);
});

async function handleFiles(files: File[]): Promise<void> {
  const usable = files.filter((file) => file.type.startsWith('image/'));
  if (usable.length === 0) {
    showStatus('That file is not an image.', true);
    return;
  }

  const first = usable[0] as File;
  if (first.size > MAX_BYTES) {
    showStatus('That image is larger than 25MB.', true);
    return;
  }
  if (first.type && !ACCEPTED.includes(first.type)) {
    showStatus('Use a JPG, PNG, WEBP or HEIC image.', true);
    return;
  }

  showStatus('Sending to the server…', false);

  const jobId = createJobId();
  const job: Job = {
    id: jobId,
    state: 'pending',
    filename: first.name || 'image.png',
    original: first,
    result: null,
    createdAt: Date.now(),
  };

  try {
    await putJob(job);
    await chrome.tabs.create({ url: chrome.runtime.getURL(`result.html#${jobId}`) });
    await chrome.runtime.sendMessage({ type: 'adh:process-job', jobId });
    window.close();
  } catch {
    showStatus('Could not start processing. Try again.', true);
  }
}

function showStatus(message: string, isError: boolean): void {
  status.classList.remove('hidden');
  status.classList.toggle('error', isError);
  byId<HTMLSpanElement>('status-spinner').classList.toggle('hidden', isError);
  statusText.textContent = message;
}

byId<HTMLButtonElement>('open-options').addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

byId<HTMLButtonElement>('open-web-app').addEventListener('click', () => {
  void getSettings().then((settings) => {
    void chrome.tabs.create({ url: `${settings.apiBaseUrl}/remove-background` });
  });
});

async function renderRecents(): Promise<void> {
  const recents = await getRecents();
  recentsGrid.textContent = '';

  if (recents.length === 0) {
    recentsEmpty.classList.remove('hidden');
    return;
  }
  recentsEmpty.classList.add('hidden');

  for (const item of recents) {
    const button = document.createElement('button');
    button.className = 'recent checker';
    button.type = 'button';
    button.title = item.filename;
    button.setAttribute('aria-label', `Open ${item.filename}`);

    const image = document.createElement('img');
    image.src = item.thumbnail;
    image.alt = '';
    button.append(image);

    button.addEventListener('click', () => {
      void chrome.tabs.create({ url: chrome.runtime.getURL(`result.html#${item.jobId}`) });
    });

    recentsGrid.append(button);
  }
}

void renderRecents();
