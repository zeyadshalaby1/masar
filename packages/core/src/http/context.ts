import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context } from 'hono'
import { MasarError } from '../errors'

export interface RequestContext {
  request: Request
  url: URL
  /** The Hono context, for headers, cookies and anything else HTTP. */
  c: Context
}

const scope = globalThis as typeof globalThis & { __masarRequest?: AsyncLocalStorage<RequestContext> }
const storage = (scope.__masarRequest ??= new AsyncLocalStorage<RequestContext>())

export function runInRequest<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

export function currentRequest(): RequestContext | null {
  return storage.getStore() ?? null
}

/** The current HTTP request, from anywhere in an action, loader or route. */
export function useRequest(): RequestContext {
  const context = storage.getStore()
  if (!context) {
    throw new MasarError('useRequest() was called outside of a request', {
      hint: 'Call it inside an action, a page load() or a route handler.',
    })
  }
  return context
}
