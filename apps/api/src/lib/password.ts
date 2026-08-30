import { randomBytes, scrypt as scryptCb, type ScryptOptions, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing (backlog 1.1.1). Uses Node's built-in `scrypt` — a memory-hard
 * KDF on OWASP's approved list — so there is no native addon to compile or keep
 * building across Node upgrades (argon2/bcrypt both ship C++).
 *
 * The stored value is self-describing:  `scrypt$N$r$p$<salt-b64>$<hash-b64>`
 * The algorithm tag and parameters travel with every hash, so the cost can be
 * raised later (or the scheme swapped for argon2) without a migration: `verify()`
 * reads whatever parameters a given row was written with, and `needsRehash()` tells
 * a successful login when to transparently re-hash at the current cost.
 */

// `promisify`'s inferred type only exposes the no-options overload; this project
// always passes options, so re-type it explicitly.
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** Current parameters. N must be a power of two. 2^17 ≈ 130ms/hash on a dev laptop. */
const PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_LEN = 64;
const SALT_LEN = 16;

async function derive(password: string, salt: Buffer, N: number, r: number, p: number) {
  // scrypt's default maxmem (32MB) is too low once N is this large: need 128*N*r,
  // plus headroom.
  return scrypt(password.normalize('NFKC'), salt, KEY_LEN, { N, r, p, maxmem: 256 * N * r });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = await derive(password, salt, PARAMS.N, PARAMS.r, PARAMS.p);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  return { N, r, p, salt: Buffer.from(saltB64, 'base64'), hash: Buffer.from(hashB64, 'base64') };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const candidate = await derive(password, parsed.salt, parsed.N, parsed.r, parsed.p);
  if (candidate.length !== parsed.hash.length) return false;
  return timingSafeEqual(candidate, parsed.hash);
}

/** True when a stored hash was written with weaker parameters than we use now — the
 * caller should re-hash the plaintext it just verified and save the result. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p;
}
