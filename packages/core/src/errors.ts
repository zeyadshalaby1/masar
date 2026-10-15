/**
 * Every Masar error can carry a `hint`: one sentence telling the developer
 * what to do next. The dev error page and the CLI print it under the message.
 */
export class MasarError extends Error {
  readonly hint?: string
  readonly status: number

  constructor(message: string, options: { hint?: string; status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'MasarError'
    this.hint = options.hint
    this.status = options.status ?? 500
  }
}

export class NotFoundError extends MasarError {
  constructor(message = 'Not found', hint?: string) {
    super(message, { status: 404, hint })
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends MasarError {
  constructor(message = 'You are not allowed to do this') {
    super(message, { status: 403 })
    this.name = 'ForbiddenError'
  }
}

export class ValidationError extends MasarError {
  readonly errors: Record<string, string[]>

  constructor(errors: Record<string, string[]>, message = 'The given data was invalid') {
    super(message, { status: 422 })
    this.name = 'ValidationError'
    this.errors = errors
  }
}

/** Thrown by `redirect()` inside loaders and route handlers. */
export class RedirectSignal extends Error {
  readonly location: string
  readonly status: 301 | 302 | 303 | 307 | 308

  constructor(location: string, status: 301 | 302 | 303 | 307 | 308 = 302) {
    super(`Redirect to ${location}`)
    this.name = 'RedirectSignal'
    this.location = location
    this.status = status
  }
}

export function redirect(location: string, status: RedirectSignal['status'] = 302): never {
  throw new RedirectSignal(location, status)
}

export function notFound(message?: string): never {
  throw new NotFoundError(message)
}
