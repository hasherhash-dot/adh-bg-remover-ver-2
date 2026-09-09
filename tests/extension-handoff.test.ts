import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patchJob: vi.fn(), getJob: vi.fn(), removeBackground: vi.fn(), broadcastJob: vi.fn(),
}));
vi.mock('../extension/src/lib/jobs', () => ({
  ...mocks, putJob: vi.fn(), createJobId: () => 'test-job',
}));
vi.mock('../extension/src/lib/settings', () => ({
  getSettings: async () => ({ autoDownload: false }), addRecent: vi.fn(),
}));
vi.mock('../extension/src/lib/api', () => ({
  removeBackground: mocks.removeBackground, fetchImage: vi.fn(),
  toPngName: (name: string) => name, ExtensionApiError: class extends Error {},
}));

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); vi.clearAllMocks(); });

it('finishes a stored upload after opening the result tab without any further popup messages', async () => {
  vi.useFakeTimers();
  let listener: Function = () => {};
  const create = vi.fn().mockResolvedValue({ id: 1 });
  vi.stubGlobal('chrome', {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: (fn: Function) => { listener = fn; } },
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    contextMenus: { onClicked: { addListener: vi.fn() } },
    tabs: { create },
    action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() },
  });
  const original = new Blob(['original']);
  const result = new Blob(['result'], { type: 'image/png' });
  mocks.getJob.mockResolvedValue({ original, filename: 'photo.jpg' });
  mocks.removeBackground.mockResolvedValue({ blob: result, width: 100, height: 100 });
  await import('../extension/src/background');
  const response = vi.fn();
  expect(listener({ type: 'adh:start-upload', jobId: 'test-job' }, {}, response)).toBe(true);
  await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ ok: true }));
  expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test/result.html#test-job' });
  expect(mocks.removeBackground).toHaveBeenCalledWith(original, 'photo.jpg');
  expect(mocks.patchJob).toHaveBeenCalledWith('test-job', expect.objectContaining({ state: 'done', result }));
});
