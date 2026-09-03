import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { id } from './ids.ts'
import type { UploadedFile } from './http.ts'

/**
 * Merchant uploads live on disk next to the database and are served from
 * `/_uploads/<id>.<ext>`. The id is random, so an upload URL cannot be
 * enumerated; the extension is derived from the declared type and never from
 * the client's filename, so nothing a browser sends can name a file `.html`.
 */
const ROOT = resolve(dirname(process.env.AMBORAS_DB ?? 'data/amboras.db'), 'uploads')

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
}

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

export class UploadError extends Error {}

export function saveUpload(file: UploadedFile, storeId: string): { url: string; path: string; type: string } {
  const ext = TYPES[file.type.toLowerCase()]
  if (!ext) throw new UploadError(`Images only — ${file.type || 'that file'} is not one`)
  if (file.data.length > MAX_UPLOAD_BYTES) throw new UploadError('That image is over 12MB')
  if (!sniffs(file.data, ext)) throw new UploadError('That file does not look like the image it claims to be')
  const name = `${id('up')}.${ext}`
  const dir = join(ROOT, storeId)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, file.data)
  return { url: `/_uploads/${storeId}/${name}`, path, type: file.type }
}

export function readUpload(urlPath: string): { data: Buffer; type: string } | null {
  const match = /^\/_uploads\/([a-z0-9_]+)\/(up_[a-z0-9]+\.[a-z]+)$/.exec(urlPath)
  if (!match) return null
  const path = join(ROOT, match[1] as string, match[2] as string)
  if (!existsSync(path)) return null
  const ext = (match[2] as string).split('.').pop() ?? ''
  const type = Object.entries(TYPES).find(([, value]) => value === ext)?.[0] ?? 'application/octet-stream'
  return { data: readFileSync(path), type }
}

/** Turns an upload URL back into a data URI, for embedding in generated SVG. */
export function uploadAsDataUri(urlPath: string): string | null {
  const found = readUpload(urlPath)
  if (!found) return null
  return `data:${found.type};base64,${found.data.toString('base64')}`
}

function sniffs(data: Buffer, ext: string): boolean {
  const head = data.subarray(0, 12)
  switch (ext) {
    case 'jpg':
      return head[0] === 0xff && head[1] === 0xd8
    case 'png':
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'gif':
      return head.subarray(0, 3).toString() === 'GIF'
    case 'webp':
      return head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP'
    case 'avif':
      return head.subarray(4, 8).toString() === 'ftyp'
    case 'svg':
      return /<svg[\s>]/i.test(data.subarray(0, 512).toString('utf8'))
    default:
      return false
  }
}
