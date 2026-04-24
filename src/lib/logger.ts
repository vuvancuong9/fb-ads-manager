/**
 * Structured logger for server-side use in Next.js API routes.
 * Outputs JSON logs in production, pretty logs in development.
 * All log entries include: timestamp, level, module, message, and optional metadata.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
    ts: string
    level: LogLevel
    module: string
    msg: string
    [key: string]: unknown
}

const isDev = process.env.NODE_ENV !== 'production'

function serialize(entry: LogEntry): string {
    if (isDev) {
          const { ts, level, module: mod, msg, ...rest } = entry
          const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${mod}]`
          const meta = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : ''
          return `${prefix} ${msg}${meta}`
    }
    return JSON.stringify(entry)
}

function log(level: LogLevel, module: string, msg: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
          ts: new Date().toISOString(),
          level,
          module,
          msg,
          ...meta,
    }
    const line = serialize(entry)
    if (level === 'error') {
          console.error(line)
    } else if (level === 'warn') {
          console.warn(line)
    } else {
          console.log(line)
    }
}

export function createLogger(module: string) {
    return {
          debug: (msg: string, meta?: Record<string, unknown>) => log('debug', module, msg, meta),
          info:  (msg: string, meta?: Record<string, unknown>) => log('info',  module, msg, meta),
          warn:  (msg: string, meta?: Record<string, unknown>) => log('warn',  module, msg, meta),
          error: (msg: string, meta?: Record<string, unknown>) => log('error', module, msg, meta),
    }
}

export type Logger = ReturnType<typeof createLogger>
