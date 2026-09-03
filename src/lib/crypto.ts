import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

const SECRET = process.env.AMBORAS_SECRET ?? 'dev-secret-not-for-production-use-only'
const KEY = scryptSync(SECRET, 'amboras.master.v1', 32)

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltPart, hashPart] = stored.split('$')
  if (scheme !== 'scrypt' || !saltPart || !hashPart) return false
  const expected = Buffer.from(hashPart, 'base64url')
  const actual = scryptSync(password, Buffer.from(saltPart, 'base64url'), expected.length, {
    N: 16384,
    r: 8,
    p: 1,
  })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function sign(payload: string): string {
  return createHmac('sha256', KEY).update(payload).digest('base64url')
}

export function verifySignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * Plugin credentials are merchant secrets for third-party accounts. They are
 * sealed at rest so a database copy alone does not hand over a merchant's
 * Shippo token; the resolver decrypts them per tenant, per request.
 */
export function seal(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function open(sealed: string): string | null {
  const [ivPart, tagPart, bodyPart] = sealed.split('.')
  if (!ivPart || !tagPart || !bodyPart) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivPart, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(bodyPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

/** A stable, non-reversible visitor key. No cookie, no pixel, no third party. */
export function fingerprint(ip: string, userAgent: string, day: string): string {
  return createHmac('sha256', KEY).update(`${ip}|${userAgent}|${day}`).digest('base64url').slice(0, 22)
}
