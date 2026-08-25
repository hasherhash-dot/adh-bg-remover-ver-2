/**
 * Extension settings.
 *
 * Stored in `chrome.storage.local` rather than `sync` on purpose: an API key is
 * a credential, and syncing it to every signed-in browser widens the blast
 * radius of a compromised profile for no real benefit.
 *
 * The extension holds no secret of its own. The API key here belongs to the
 * user, is entered by the user, and is only ever sent to the endpoint the user
 * configured.
 */

export interface Settings {
  /** Origin of the ADH deployment, without a trailing slash. */
  apiBaseUrl: string;
  /** Optional. Only needed if the deployment requires key auth. */
  apiKey: string;
  /** Save the result straight to the downloads folder when it is ready. */
  autoDownload: boolean;
  /** Open the result tab automatically after a context-menu action. */
  openResultTab: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: 'http://localhost:3000',
  apiKey: '',
  autoDownload: false,
  openResultTab: true,
};

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...((stored[KEY] as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  next.apiBaseUrl = normalizeBaseUrl(next.apiBaseUrl);
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** Trims trailing slashes and rejects anything that is not a valid origin. */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_SETTINGS.apiBaseUrl;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return DEFAULT_SETTINGS.apiBaseUrl;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return DEFAULT_SETTINGS.apiBaseUrl;
  }
}

export interface RecentItem {
  jobId: string;
  filename: string;
  createdAt: number;
  /** Small data URL preview so the popup can render without touching IndexedDB. */
  thumbnail: string;
}

const RECENTS_KEY = 'recents';
const MAX_RECENTS = 6;

export async function getRecents(): Promise<RecentItem[]> {
  const stored = await chrome.storage.local.get(RECENTS_KEY);
  return (stored[RECENTS_KEY] as RecentItem[] | undefined) ?? [];
}

export async function addRecent(item: RecentItem): Promise<void> {
  const recents = [item, ...(await getRecents()).filter((r) => r.jobId !== item.jobId)].slice(
    0,
    MAX_RECENTS,
  );
  await chrome.storage.local.set({ [RECENTS_KEY]: recents });
}

export async function clearRecents(): Promise<void> {
  await chrome.storage.local.remove(RECENTS_KEY);
}
