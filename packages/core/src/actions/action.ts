import type { z } from 'zod'
import { auth, checkAuthorize, type Authorize, type User } from '../auth'
import { ValidationError } from '../errors'
import { currentRequest, type RequestContext } from '../http/context'

type Schema = z.ZodType

export interface ActionArgs<I> {
  /** The validated input (after zod parsing and transforms). */
  input: I
  /** The current request, or null when called outside HTTP (jobs, scripts). */
  request: RequestContext | null
  /** The signed-in user, or null (always null outside a request). */
  user: User | null
}

export interface ActionDefinition<S extends Schema | undefined, O> {
  /** A zod schema. Input is validated before run() and errors return 422. */
  input?: S
  /**
   * Who may call this over HTTP. Required: actions are closed by default.
   * 'public', 'user' (signed in), or a rule such as role('admin'). Server code
   * outside a request (jobs, scripts) is trusted and skips this check.
   */
  authorize: Authorize
  run(args: ActionArgs<S extends Schema ? z.output<S> : undefined>): O | Promise<O>
}

export interface ActionMeta {
  readonly __masar: 'action'
  readonly definition: ActionDefinition<any, any>
  /** "<module>.<export>", set by the kernel. */
  id?: string
}

export type Action<I, O> = ((...args: undefined extends I ? [input?: I] : [input: I]) => Promise<Awaited<O>>) &
  ActionMeta

function toErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_'
    ;(errors[key] ??= []).push(issue.message)
  }
  return errors
}

/**
 * The single place where business logic lives. The same action is:
 *  - called directly on the server:   await createCourse({ title })
 *  - called from a page in the browser (Masar turns the import into an RPC call)
 *  - exposed as JSON API when the module sets expose.api
 */
export function action<S extends Schema | undefined = undefined, O = unknown>(
  definition: ActionDefinition<S, O>,
): Action<S extends Schema ? z.input<S> : undefined, O> {
  const call = async (input?: unknown) => {
    const request = currentRequest()
    if (request) await checkAuthorize(definition.authorize, fn.id ?? 'unknown')
    let value: unknown = input
    if (definition.input) {
      const result = await definition.input.safeParseAsync(input)
      if (!result.success) throw new ValidationError(toErrors(result.error.issues))
      value = result.data
    }
    return definition.run({ input: value as never, request, user: await auth.user() })
  }
  const fn: typeof call & ActionMeta = Object.assign(call, { __masar: 'action' as const, definition })
  return fn as never
}

export function isAction(value: unknown): value is ActionMeta & ((input?: unknown) => Promise<unknown>) {
  return typeof value === 'function' && (value as unknown as ActionMeta).__masar === 'action'
}
