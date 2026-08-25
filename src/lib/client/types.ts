/** Shared client-side view models. Kept free of any server imports. */

export type BackgroundChoice =
  | { type: 'transparent' }
  | { type: 'color'; color: string }
  | { type: 'image'; file: File; previewUrl: string };

export type JobStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error' | 'cancelled';

export interface ImageJob {
  id: string;
  file: File;
  filename: string;
  status: JobStatus;
  /** 0..1 for the upload phase only; null once the server takes over. */
  uploadRatio: number | null;
  originalUrl: string;
  originalSize: number;
  result: {
    url: string;
    blob: Blob;
    width: number;
    height: number;
    byteSize: number;
    processingTimeMs: number;
    filename: string;
  } | null;
  error: { message: string; retryable: boolean } | null;
  createdAt: number;
}

export interface HistoryItem {
  id: string;
  filename: string;
  width: number;
  height: number;
  byteSize: number;
  processingTimeMs: number;
  createdAt: number;
  /** Small PNG preview, stored as a blob in IndexedDB. */
  thumbnail: Blob;
  /** Full-size result. Kept only while the browser has room for it. */
  result: Blob | null;
}
