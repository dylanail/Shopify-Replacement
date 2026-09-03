import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const key = await scrypt(password, salt, 64);
  const a = Buffer.from(hash, "hex");
  return a.length === key.length && timingSafeEqual(a, key);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** AES-256-GCM for plugin credentials at rest. Key derived from the JWT secret unless KILN_ENC_KEY is set. */
export function encryptSecret(plain: string, secret: string) {
  const key = createHash("sha256").update(process.env.KILN_ENC_KEY ?? secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]).toString("base64"), iv: iv.toString("base64") };
}

export function decryptSecret(ciphertext: string, iv: string, secret: string) {
  const key = createHash("sha256").update(process.env.KILN_ENC_KEY ?? secret).digest();
  const buf = Buffer.from(ciphertext, "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Stable, non-reversible visitor fingerprint (no cookies): ip + ua + store salt, rotated daily. */
export function fingerprint(ip: string, userAgent: string, storeId: string, day = new Date().toISOString().slice(0, 10)) {
  return sha256(`${storeId}|${ip}|${userAgent}|${day}`).slice(0, 24);
}
