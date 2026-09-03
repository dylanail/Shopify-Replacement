import { inflateSync } from 'node:zlib'

/**
 * A GIF maker with no dependencies.
 *
 * Frames come in as PNGs (the image models return PNG; uploads may be PNG),
 * are decoded here, resampled to a common size, quantised to one 256-colour
 * palette and written as an animated GIF89a with LZW compression. It exists
 * so a product's image sheet — the same product in six scenes — can become
 * the looping GIF a static ad slot or a product gallery wants, without a
 * native image library in the deployment.
 *
 * What it does not do: JPEG. A JPEG upload is refused with a message that
 * says to use a PNG or a render.
 */
export type Rgba = { width: number; height: number; data: Uint8Array }

/* ------------------------------------------------------------------ PNG */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function isPng(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)
}

/** Decodes 8-bit greyscale, RGB, RGBA, grey+alpha and palette PNGs without interlacing. */
export function decodePng(bytes: Buffer): Rgba {
  if (!isPng(bytes)) throw new Error('Not a PNG')
  let offset = 8
  let width = 0
  let height = 0
  let depth = 8
  let colorType = 6
  let interlace = 0
  let palette: Buffer | null = null
  let alphaTable: Buffer | null = null
  const idat: Buffer[] = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    const chunk = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      depth = chunk[8] ?? 8
      colorType = chunk[9] ?? 6
      interlace = chunk[12] ?? 0
    } else if (type === 'PLTE') palette = Buffer.from(chunk)
    else if (type === 'tRNS') alphaTable = Buffer.from(chunk)
    else if (type === 'IDAT') idat.push(chunk)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (!width || !height) throw new Error('PNG has no header')
  if (depth !== 8) throw new Error(`Only 8-bit PNGs are supported (this one is ${depth}-bit)`)
  if (interlace) throw new Error('Interlaced PNGs are not supported')
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  let previous = new Uint8Array(stride)
  let at = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[at++] ?? 0
    const line = new Uint8Array(raw.subarray(at, at + stride))
    at += stride
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? (line[i - channels] as number) : 0
      const b = previous[i] as number
      const c = i >= channels ? (previous[i - channels] as number) : 0
      const x = line[i] as number
      let value = x
      if (filter === 1) value = x + a
      else if (filter === 2) value = x + b
      else if (filter === 3) value = x + Math.floor((a + b) / 2)
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      line[i] = value & 0xff
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const i = x * channels
      if (colorType === 0) { out[o] = out[o + 1] = out[o + 2] = line[i] as number; out[o + 3] = 255 }
      else if (colorType === 2) { out[o] = line[i] as number; out[o + 1] = line[i + 1] as number; out[o + 2] = line[i + 2] as number; out[o + 3] = 255 }
      else if (colorType === 3) {
        const index = line[i] as number
        out[o] = palette?.[index * 3] ?? 0
        out[o + 1] = palette?.[index * 3 + 1] ?? 0
        out[o + 2] = palette?.[index * 3 + 2] ?? 0
        out[o + 3] = alphaTable && index < alphaTable.length ? (alphaTable[index] as number) : 255
      } else if (colorType === 4) { out[o] = out[o + 1] = out[o + 2] = line[i] as number; out[o + 3] = line[i + 1] as number }
      else { out[o] = line[i] as number; out[o + 1] = line[i + 1] as number; out[o + 2] = line[i + 2] as number; out[o + 3] = line[i + 3] as number }
    }
    previous = line
  }
  return { width, height, data: out }
}

/* ------------------------------------------------------------- resample */

/** Box-filter resample to fit inside `max` on the longer side, preserving aspect; a white ground replaces transparency. */
export function resample(image: Rgba, max: number): Rgba {
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y / height) * image.height)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / height) * image.height))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x / width) * image.width)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) / width) * image.width))
      let r = 0, g = 0, b = 0, n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * image.width + sx) * 4
          const alpha = (image.data[i + 3] as number) / 255
          r += (image.data[i] as number) * alpha + 255 * (1 - alpha)
          g += (image.data[i + 1] as number) * alpha + 255 * (1 - alpha)
          b += (image.data[i + 2] as number) * alpha + 255 * (1 - alpha)
          n++
        }
      }
      const o = (y * width + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = 255
    }
  }
  return { width, height, data: out }
}

/** Centre-crop to exactly width × height so every frame in a GIF is the same size. */
export function cover(image: Rgba, width: number, height: number): Rgba {
  const scale = Math.max(width / image.width, height / image.height)
  const scaled = resampleTo(image, Math.round(image.width * scale), Math.round(image.height * scale))
  const left = Math.floor((scaled.width - width) / 2)
  const top = Math.floor((scaled.height - height) / 2)
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const source = ((y + top) * scaled.width + left) * 4
    out.set(scaled.data.subarray(source, source + width * 4), y * width * 4)
  }
  return { width, height, data: out }
}

function resampleTo(image: Rgba, width: number, height: number): Rgba {
  if (width === image.width && height === image.height) return image
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y / height) * image.height))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x / width) * image.width))
      const i = (sy * image.width + sx) * 4
      const o = (y * width + x) * 4
      const alpha = (image.data[i + 3] as number) / 255
      out[o] = Math.round((image.data[i] as number) * alpha + 255 * (1 - alpha))
      out[o + 1] = Math.round((image.data[i + 1] as number) * alpha + 255 * (1 - alpha))
      out[o + 2] = Math.round((image.data[i + 2] as number) * alpha + 255 * (1 - alpha))
      out[o + 3] = 255
    }
  }
  return { width, height, data: out }
}

/* ------------------------------------------------------------- quantise */

/** Median-cut palette over every frame at once, so the colours do not flicker between frames. */
export function palette(frames: Rgba[], size = 256): Uint8Array {
  const samples: number[][] = []
  const step = Math.max(1, Math.floor(frames.reduce((sum, frame) => sum + frame.width * frame.height, 0) / 40_000))
  let counter = 0
  for (const frame of frames) {
    for (let i = 0; i < frame.data.length; i += 4) {
      if (counter++ % step) continue
      samples.push([frame.data[i] as number, frame.data[i + 1] as number, frame.data[i + 2] as number])
    }
  }
  if (!samples.length) samples.push([255, 255, 255])
  let boxes: number[][][] = [samples]
  while (boxes.length < size) {
    let widest = -1
    let widestRange = -1
    let widestChannel = 0
    boxes.forEach((box, index) => {
      if (box.length < 2) return
      for (let channel = 0; channel < 3; channel++) {
        let low = 255, high = 0
        for (const sample of box) { const value = sample[channel] as number; if (value < low) low = value; if (value > high) high = value }
        if (high - low > widestRange) { widestRange = high - low; widest = index; widestChannel = channel }
      }
    })
    if (widest < 0 || widestRange <= 0) break
    const box = boxes[widest] as number[][]
    box.sort((a, b) => (a[widestChannel] as number) - (b[widestChannel] as number))
    const half = Math.floor(box.length / 2)
    boxes.splice(widest, 1, box.slice(0, half), box.slice(half))
  }
  const out = new Uint8Array(size * 3)
  boxes.forEach((box, index) => {
    let r = 0, g = 0, b = 0
    for (const sample of box) { r += sample[0] as number; g += sample[1] as number; b += sample[2] as number }
    const n = Math.max(1, box.length)
    out[index * 3] = Math.round(r / n)
    out[index * 3 + 1] = Math.round(g / n)
    out[index * 3 + 2] = Math.round(b / n)
  })
  return out
}

function nearest(paletteBytes: Uint8Array, r: number, g: number, b: number, cache: Map<number, number>): number {
  const key = (r << 16) | (g << 8) | b
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < paletteBytes.length / 3; i++) {
    const dr = r - (paletteBytes[i * 3] as number)
    const dg = g - (paletteBytes[i * 3 + 1] as number)
    const db = b - (paletteBytes[i * 3 + 2] as number)
    const distance = dr * dr + dg * dg + db * db
    if (distance < bestDistance) { bestDistance = distance; best = i }
  }
  cache.set(key, best)
  return best
}

/* ------------------------------------------------------------------ LZW */

/** Variable-width LZW as GIF decoders expect it: a clear code first, the code width growing as the table fills, a reset at 4096. */
function lzw(indices: Uint8Array, minCodeSize: number): Buffer {
  const clear = 1 << minCodeSize
  const end = clear + 1
  const out: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  let codeSize = minCodeSize + 1
  const emit = (code: number) => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) { out.push(bitBuffer & 0xff); bitBuffer >>>= 8; bitCount -= 8 }
  }
  let table = new Map<number, number>()
  let next = end + 1
  emit(clear)
  if (!indices.length) { emit(end); if (bitCount > 0) out.push(bitBuffer & 0xff); return Buffer.from(out) }
  let prefix = indices[0] as number
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i] as number
    const key = (prefix << 8) | k
    const found = table.get(key)
    if (found !== undefined) { prefix = found; continue }
    emit(prefix)
    if (next === 4096) {
      emit(clear)
      table = new Map()
      next = end + 1
      codeSize = minCodeSize + 1
    } else {
      if (next >= 1 << codeSize) codeSize++
      table.set(key, next++)
    }
    prefix = k
  }
  emit(prefix)
  emit(end)
  if (bitCount > 0) out.push(bitBuffer & 0xff)
  return Buffer.from(out)
}

/* ------------------------------------------------------------------ GIF */

export type GifOptions = { /** Centiseconds per frame. */ delay?: number; maxSide?: number; loop?: boolean }

/** Frames of any size become one looping GIF at the first frame's aspect, no longer than `maxSide`. */
export function encodeGif(frames: Rgba[], options: GifOptions = {}): Buffer {
  if (!frames.length) throw new Error('A GIF needs at least one frame')
  const first = resample(frames[0] as Rgba, options.maxSide ?? 480)
  const sized = frames.map((frame, index) => (index === 0 ? first : cover(frame, first.width, first.height)))
  const colors = palette(sized, 256)
  const cache = new Map<number, number>()
  const parts: Buffer[] = []
  const header = Buffer.alloc(13)
  header.write('GIF89a', 0, 'ascii')
  header.writeUInt16LE(first.width, 6)
  header.writeUInt16LE(first.height, 8)
  header[10] = 0xf7 // global colour table, 8 bits, 256 entries
  header[11] = 0
  header[12] = 0
  parts.push(header, Buffer.from(colors))
  if (options.loop !== false) parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0x00, 0x00, 0x00]))
  const delay = Math.max(2, Math.round(options.delay ?? 60))
  for (const frame of sized) {
    const control = Buffer.from([0x21, 0xf9, 0x04, 0x00, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00])
    const descriptor = Buffer.alloc(10)
    descriptor[0] = 0x2c
    descriptor.writeUInt16LE(0, 1)
    descriptor.writeUInt16LE(0, 3)
    descriptor.writeUInt16LE(frame.width, 5)
    descriptor.writeUInt16LE(frame.height, 7)
    descriptor[9] = 0
    const indices = new Uint8Array(frame.width * frame.height)
    for (let i = 0, p = 0; i < frame.data.length; i += 4, p++) indices[p] = nearest(colors, frame.data[i] as number, frame.data[i + 1] as number, frame.data[i + 2] as number, cache)
    const compressed = lzw(indices, 8)
    const blocks: Buffer[] = [Buffer.from([8])]
    for (let at = 0; at < compressed.length; at += 255) {
      const slice = compressed.subarray(at, at + 255)
      blocks.push(Buffer.from([slice.length]), slice)
    }
    blocks.push(Buffer.from([0]))
    parts.push(control, descriptor, ...blocks)
  }
  parts.push(Buffer.from([0x3b]))
  return Buffer.concat(parts)
}

/** Reads a GIF's frame count and size back, for tests and for the admin's caption. */
export function inspectGif(bytes: Buffer): { width: number; height: number; frames: number } {
  if (bytes.toString('ascii', 0, 6) !== 'GIF89a') throw new Error('Not a GIF89a')
  let frames = 0
  for (let i = 13; i < bytes.length - 9; i++) if (bytes[i] === 0x2c && bytes[i - 8] === 0x21 && bytes[i - 7] === 0xf9) frames++
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), frames }
}

/** A simple test image: a flat colour with a diagonal, as RGBA. */
export function solidFrame(width: number, height: number, rgb: [number, number, number]): Rgba {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const on = Math.abs(x - y) < 3
      data[o] = on ? 255 - rgb[0] : rgb[0]
      data[o + 1] = on ? 255 - rgb[1] : rgb[1]
      data[o + 2] = on ? 255 - rgb[2] : rgb[2]
      data[o + 3] = 255
    }
  }
  return { width, height, data }
}
