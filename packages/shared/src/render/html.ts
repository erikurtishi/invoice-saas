/**
 * Minimal HTML string helpers for the block renderers (backlog 3.1.3). No
 * templating library — the renderer is a pure function producing a string, and
 * every value that reaches it is escaped through `esc`.
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

type Primitive = string | number | boolean | null | undefined;

/** Escape a value for text/attribute context. `null`/`undefined` → `''`. */
export function esc(value: Primitive): string {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/** Escape, then turn newlines into `<br>` — for user free-text (notes, addresses). */
export function escMultiline(value: string | null | undefined): string {
  return esc(value).replace(/\r?\n/g, '<br>');
}

/** Join truthy parts with newlines — keeps block builders readable. */
export function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join('\n');
}

/** `attr({ class: 'x', 'data-n': 2, hidden: false })` → ` class="x" data-n="2"`.
 * `false`/`null`/`undefined` values are dropped. */
export function attr(attrs: Record<string, Primitive>): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value != null && value !== '')
    .map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${esc(value)}"`))
    .join('');
}
