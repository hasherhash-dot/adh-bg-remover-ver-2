import { ExtensionApiError, fetchImage, removeBackground, toPngName } from './lib/api';
import {
  broadcastJob,
  createJobId,
  getJob,
  patchJob,
  putJob,
  type Job,
} from './lib/jobs';
import { addRecent, getSettings } from './lib/settings';

/**
 * Service worker.
 *
 * MV3 workers are killed aggressively, so no state is held in module scope
 * beyond what can be rebuilt: the context menu is re-created on install, and
 * every job lives in IndexedDB from the moment it is created. If the worker is
 * torn down mid-request, the job is left in `processing` and the result page
 * shows that honestly rather than spinning forever.
 */

const MENU_ID = 'adh-remove-background';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Remove background',
      contexts: ['image'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  void handleContextMenu(info.srcUrl, tab?.url);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'adh:process-job') {
    void processStoredJob(message.jobId as string).then(
      () => sendResponse({ ok: true }),
      (error: unknown) => sendResponse({ ok: false, error: String(error) }),
    );
    return true; // keep the channel open for the async response
  }

  if (message?.type === 'adh:open-web-app') {
    void getSettings().then((settings) => {
      void chrome.tabs.create({ url: `${settings.apiBaseUrl}/remove-background` });
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

async function handleContextMenu(srcUrl: string, pageUrl?: string): Promise<void> {
  const jobId = createJobId();
  const job: Job = {
    id: jobId,
    state: 'pending',
    filename: 'image.png',
    sourceUrl: pageUrl,
    original: null,
    result: null,
    createdAt: Date.now(),
  };
  await putJob(job);

  const settings = await getSettings();
  if (settings.openResultTab) {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`result.html#${jobId}`) });
  }

  setBadge('…', '#5c5b57');

  try {
    const { blob, filename } = await fetchImage(srcUrl);
    await patchJob(jobId, { original: blob, filename, state: 'processing' });
    broadcastJob(jobId);
    await runJob(jobId);
  } catch (error) {
    await failJob(jobId, error);
  }
}

/** Used by the popup: the file is already stored, so just run it. */
async function processStoredJob(jobId: string): Promise<void> {
  await patchJob(jobId, { state: 'processing' });
  broadcastJob(jobId);
  setBadge('…', '#5c5b57');
  try {
    await runJob(jobId);
  } catch (error) {
    await failJob(jobId, error);
  }
}

async function runJob(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job?.original) {
    throw new ExtensionApiError('The image is no longer available. Try again.', true);
  }

  const result = await removeBackground(job.original, job.filename);

  await patchJob(jobId, {
    state: 'done',
    result: result.blob,
    width: result.width,
    height: result.height,
    byteSize: result.byteSize,
    processingTimeMs: result.processingTimeMs,
  });
  broadcastJob(jobId);
  setBadge('✓', '#1f7a52');

  await addRecent({
    jobId,
    filename: toPngName(job.filename),
    createdAt: Date.now(),
    thumbnail: await makeThumbnailDataUrl(result.blob),
  });

  const settings = await getSettings();
  if (settings.autoDownload) {
    await downloadBlob(result.blob, toPngName(job.filename));
  }
}

async function failJob(jobId: string, error: unknown): Promise<void> {
  const message =
    error instanceof ExtensionApiError
      ? error.message
      : 'Something went wrong while removing the background.';
  await patchJob(jobId, { state: 'error', error: message });
  broadcastJob(jobId);
  setBadge('!', '#c0392b');
}

/**
 * Service workers have no document, so canvas is unavailable. OffscreenCanvas
 * plus createImageBitmap is the supported path for producing a preview.
 */
async function makeThumbnailDataUrl(blob: Blob, size = 96): Promise<string> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const thumbnail = await canvas.convertToBlob({ type: 'image/png' });
    return await blobToDataUrl(thumbnail);
  } catch {
    return '';
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  // FileReader is unavailable in a service worker; build the data URL by hand.
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i] as number);
    }
    return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
  });
}

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = await blobToDataUrl(blob);
  await chrome.downloads.download({ url, filename, saveAs: false });
}

function setBadge(text: string, color: string): void {
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
  // Clear it so the icon does not carry stale state into the next session.
  setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 6000);
}
