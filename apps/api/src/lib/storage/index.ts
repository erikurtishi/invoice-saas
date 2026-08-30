import { UPLOAD_URL_PATH, uploadDir } from '../../config/env.js';
import { LocalDiskStorage } from './local-disk-storage.js';
import type { Storage } from './storage.js';

export type { Storage, PutObject } from './storage.js';

/**
 * The process-wide file store. Swap the constructor here for a cloud backend
 * (`new S3Storage(env.S3_BUCKET, …)`) when one is adopted — every caller goes
 * through `storage`, so nothing else changes.
 */
export const storage: Storage = new LocalDiskStorage(uploadDir, UPLOAD_URL_PATH);
