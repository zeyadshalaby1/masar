import { router } from '@inertiajs/react'
import { useCallback, useState } from 'react'
import { ActionError, ActionValidationError } from '../client/runtime'

type AnyAction = (...args: any[]) => Promise<any>

export interface UseActionOptions<R> {
  onSuccess?: (result: R) => void
  onError?: (error: Error) => void
  /** Reload page props after success: true for all, or a list of prop names. */
  reload?: boolean | string[]
}

/**
 * Call an action from a component with pending and error state:
 *
 *   const create = useAction(createCourse, { reload: true })
 *   <form onSubmit={(e) => { e.preventDefault(); create.run(values) }}>
 *   {create.errors.title && <p>{create.errors.title}</p>}
 */
export function useAction<A extends AnyAction>(action: A, options: UseActionOptions<Awaited<ReturnType<A>>> = {}) {
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (...args: Parameters<A>): Promise<Awaited<ReturnType<A>> | undefined> => {
      setPending(true)
      setErrors({})
      setError(null)
      try {
        const result = await action(...args)
        options.onSuccess?.(result)
        if (options.reload) router.reload(options.reload === true ? {} : { only: options.reload })
        return result
      } catch (caught) {
        const err = caught instanceof Error ? caught : new Error(String(caught))
        if (err instanceof ActionValidationError) {
          setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0] ?? ''])))
          setError(err.errors._?.[0] ?? null)
        } else {
          setError(err instanceof ActionError ? err.message : 'Something went wrong')
        }
        options.onError?.(err)
        return undefined
      } finally {
        setPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  )

  return { run, pending, errors, error, reset: () => (setErrors({}), setError(null)) }
}
