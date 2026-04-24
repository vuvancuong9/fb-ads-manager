/**
 * Standardized API response helpers.
 * All API routes should use these helpers to ensure consistent response shape.
 *
 * Success:  { ok: true,  data: T,      meta?: object }
 * Error:    { ok: false, error: string, code?: string, detail?: unknown }
 */

import { NextResponse } from 'next/server'

// ── Success ──────────────────────────────────────────────────────────────────

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200): NextResponse {
    return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) }, { status })
}

export function created<T>(data: T, meta?: Record<string, unknown>): NextResponse {
    return ok(data, meta, 201)
}

// ── Client errors ─────────────────────────────────────────────────────────────

export function badRequest(error: string, detail?: unknown): NextResponse {
    return NextResponse.json({ ok: false, error, ...(detail !== undefined ? { detail } : {}) }, { status: 400 })
}

export function unauthorized(error = 'Unauthorized'): NextResponse {
    return NextResponse.json({ ok: false, error }, { status: 401 })
}

export function forbidden(error = 'Forbidden'): NextResponse {
    return NextResponse.json({ ok: false, error }, { status: 403 })
}

export function notFound(error = 'Not found'): NextResponse {
    return NextResponse.json({ ok: false, error }, { status: 404 })
}

export function conflict(error: string, detail?: unknown): NextResponse {
    return NextResponse.json({ ok: false, error, ...(detail !== undefined ? { detail } : {}) }, { status: 409 })
}

export function tooLarge(error: string): NextResponse {
    return NextResponse.json({ ok: false, error }, { status: 413 })
}

export function unprocessable(error: string, detail?: unknown): NextResponse {
    return NextResponse.json({ ok: false, error, ...(detail !== undefined ? { detail } : {}) }, { status: 422 })
}

// ── Server errors ─────────────────────────────────────────────────────────────

export function serverError(error: string, detail?: unknown): NextResponse {
    return NextResponse.json({ ok: false, error, ...(detail !== undefined ? { detail } : {}) }, { status: 500 })
}

export function serviceUnavailable(error = 'Service unavailable'): NextResponse {
    return NextResponse.json({ ok: false, error }, { status: 503 })
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Convert any unknown caught error to a plain string message. */
export function toErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message
    if (typeof e === 'string') return e
    try { return JSON.stringify(e) } catch { return String(e) }
}

/** Wrap the standard error path: log + return 500. */
export function internalError(e: unknown): NextResponse {
    return serverError(toErrorMessage(e))
}
