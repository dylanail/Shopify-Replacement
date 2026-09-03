import { randomBytes, randomUUID } from 'node:crypto'

const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz' // no 0/1/l/o

/** Short, url-safe, collision-resistant id with a type prefix (`prod_x7k2...`). */
export function id(prefix: string, size = 16): string {
  const bytes = randomBytes(size)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return `${prefix}_${out}`
}

export function uuid(): string {
  return randomUUID()
}

/** A url handle: lowercase, hyphenated, ascii-folded. */
export function handle(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

/**
 * Store slugs carry a random suffix so a preview URL cannot be guessed from the
 * brand name — enumerating `ironjaw.amboras.test` must not find a draft store.
 */
export function storeSlug(name: string): string {
  return `${handle(name).slice(0, 32)}-${id('x', 5).slice(2)}`
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

let seq = 0
/** Monotonic display ids for orders inside a store are allocated in SQL; this is
 * only the in-process tiebreaker for events written in the same millisecond. */
export function tick(): number {
  return ++seq
}
