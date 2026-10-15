import type { Context } from 'hono'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type RouteHandler = (c: Context) => Response | Promise<Response>

export interface RouteDefinition {
  method: HttpMethod
  path: string
  handler: RouteHandler
}

export interface RouteBuilder {
  get(path: string, handler: RouteHandler): void
  post(path: string, handler: RouteHandler): void
  put(path: string, handler: RouteHandler): void
  patch(path: string, handler: RouteHandler): void
  delete(path: string, handler: RouteHandler): void
}

export interface RoutesDefinition {
  readonly __masar: 'routes'
  readonly routes: RouteDefinition[]
}

/**
 * Extra HTTP routes for a module (webhooks, file downloads, custom APIs).
 * Paths are relative to the module prefix: in the `courses` module,
 * r.get('/export.csv', ...) answers GET /courses/export.csv.
 */
export function defineRoutes(build: (r: RouteBuilder) => void): RoutesDefinition {
  const routes: RouteDefinition[] = []
  const add = (method: HttpMethod) => (path: string, handler: RouteHandler) => {
    routes.push({ method, path, handler })
  }
  build({ get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE') })
  return { __masar: 'routes', routes }
}

export function isRoutesDefinition(value: unknown): value is RoutesDefinition {
  return typeof value === 'object' && value !== null && (value as RoutesDefinition).__masar === 'routes'
}
