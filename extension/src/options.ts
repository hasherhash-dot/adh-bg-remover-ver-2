import { getSettings, normalizeBaseUrl, saveSettings } from './lib/settings';

/** Settings page. Small enough to stay imperative — no framework needed. */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const baseUrlInput = el<HTMLInputElement>('api-base-url');
const apiKeyInput = el<HTMLInputElement>('api-key');
const autoDownload = el<HTMLInputElement>('auto-download');
const openResultTab = el<HTMLInputElement>('open-result-tab');
const saveStatus = el<HTMLSpanElement>('save-status');

async function load(): Promise<void> {
  const settings = await getSettings();
  baseUrlInput.value = settings.apiBaseUrl;
  apiKeyInput.value = settings.apiKey;
  autoDownload.checked = settings.autoDownload;
  openResultTab.checked = settings.openResultTab;
}

el<HTMLButtonElement>('save').addEventListener('click', async () => {
  const normalized = normalizeBaseUrl(baseUrlInput.value);
  baseUrlInput.value = normalized;

  await saveSettings({
    apiBaseUrl: normalized,
    apiKey: apiKeyInput.value.trim(),
    autoDownload: autoDownload.checked,
    openResultTab: openResultTab.checked,
  });

  setStatus('Saved.');
});

el<HTMLButtonElement>('test').addEventListener('click', async () => {
  const base = normalizeBaseUrl(baseUrlInput.value);
  setStatus('Checking…');
  try {
    const response = await fetch(`${base}/api/health`);
    if (!response.ok) {
      setStatus(`Server replied ${response.status}.`);
      return;
    }
    const data = (await response.json()) as { status?: string; provider?: string };
    setStatus(
      data.status === 'ready'
        ? `Connected — engine "${data.provider}" is ready.`
        : `Reachable, but the engine reports "${data.status}".`,
    );
  } catch {
    setStatus('Could not reach that address.');
  }
});

let statusTimer: ReturnType<typeof setTimeout> | undefined;
function setStatus(message: string): void {
  saveStatus.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (saveStatus.textContent = ''), 4000);
}

void load();
