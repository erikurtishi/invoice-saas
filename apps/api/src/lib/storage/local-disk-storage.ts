import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PutObject, Storage } from './storage.js';

/**
 * `Storage` backed by a directory on the local filesystem, served read-only by
 * `express.static` at `urlPrefix`. This is the backend for the local build and the
 * single-VPS deploy (decision D1); a cloud object store swaps in at
 * `storage/index.ts` without touching any caller.
 */
export class LocalDiskStorage implements Storage {
  constructor(
    private readonly rootDir: string,
    private readonly urlPrefix: string,
  ) {}

  /** Guard against `..` / absolute-path escapes in a caller-supplied key. */
  private resolve(key: string): string {
    const full = path.resolve(this.rootDir, key);
    const rel = path.relative(this.rootDir, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Unsafe storage key: ${key}`);
    }
    return full;
  }

  async put(object: PutObject): Promise<{ key: string; url: string }> {
    const dest = this.resolve(object.key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, object.body);
    return { key: object.key, url: this.urlFor(object.key) };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async sizeOf(key: string): Promise<number | null> {
    try {
      return (await stat(this.resolve(key))).size;
    } catch {
      return null;
    }
  }

  urlFor(key: string): string {
    return `${this.urlPrefix}/${key}`;
  }

  keyFromUrl(url: string): string | null {
    const prefix = `${this.urlPrefix}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}
