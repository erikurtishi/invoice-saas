/**
 * The file-storage port (backlog 1.2.3). Everything that persists a binary asset —
 * business logos now, generated PDFs and other uploads later — depends on this
 * interface, never on a concrete backend. The only implementation today is
 * `LocalDiskStorage`; moving to S3 / a VPS volume / object storage is a single new
 * class plus a one-line swap in `storage/index.ts`, with no call-site changes.
 *
 * Mirrors the `Mailer` port (decision D13) deliberately — same "pluggable adapter,
 * concrete choice deferred" shape.
 */

export interface PutObject {
  /** Storage-relative key, e.g. `logos/abc123.webp`. Forward-slash separated,
   * no leading slash, caller-controlled (and caller-sanitised). */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface Storage {
  /** Write (or overwrite) an object. Returns the root-relative URL it is served at. */
  put(object: PutObject): Promise<{ key: string; url: string }>;
  /** Remove an object. A missing key is not an error (idempotent delete). */
  delete(key: string): Promise<void>;
  /** Byte size of an object, or `null` if it does not exist. For the admin
   * storage-usage view (backlog 8.4.3). */
  sizeOf(key: string): Promise<number | null>;
  /** The root-relative URL an object with this key is served at. */
  urlFor(key: string): string;
  /** Extract the storage key from a URL this store produced, or `null` if the URL
   * did not come from here. */
  keyFromUrl(url: string): string | null;
}
