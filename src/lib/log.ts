type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const threshold = LEVELS[(process.env.AMBORAS_LOG_LEVEL as Level) ?? 'info'] ?? 20
const COLOR: Record<Level, string> = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }

function emit(level: Level, scope: string, msg: string, extra?: unknown) {
  if (LEVELS[level] < threshold) return
  const time = new Date().toISOString().slice(11, 23)
  const tail = extra === undefined ? '' : ' ' + safe(extra)
  process.stdout.write(`${COLOR[level]}${time} ${level.padEnd(5)}\x1b[0m ${scope.padEnd(14)} ${msg}${tail}\n`)
}

function safe(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function logger(scope: string) {
  return {
    debug: (m: string, e?: unknown) => emit('debug', scope, m, e),
    info: (m: string, e?: unknown) => emit('info', scope, m, e),
    warn: (m: string, e?: unknown) => emit('warn', scope, m, e),
    error: (m: string, e?: unknown) => emit('error', scope, m, e),
  }
}
