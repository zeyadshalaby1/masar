import { usePage } from '@inertiajs/react'

export { Deferred, Form, Head, InfiniteScroll, Link, router, useForm, usePage, usePoll, WhenVisible } from '@inertiajs/react'
export { ActionError, ActionValidationError, uploadFile, type UploadedFile, type UploadOptions } from '../client/runtime'
export { useAction, type UseActionOptions } from './use-action'
export { useLocale, useT, useTheme, type I18nShared } from './i18n'
import type { I18nShared } from './i18n'

/** Props a page receives from its load(): PageProps<typeof load> */
export type PageProps<L> = L extends (...args: any[]) => infer R ? Exclude<Awaited<R>, Response | undefined> : {}

export interface MasarShared {
  app: { name: string }
  /** Active language, direction, available languages, messages and theme. Prefer useT/useLocale/useTheme. */
  i18n: I18nShared
  nav: { name: string; title: string; href: string }[]
  /** The signed-in user, or null. */
  user: { id: string; name: string; email: string; role: string; emailVerifiedAt: string | null; createdAt: string; updatedAt: string } | null
}

/** App name, direction, module navigation and the signed-in user, shared with every page. */
export function useMasar(): MasarShared {
  return (usePage().props as unknown as { masar: MasarShared }).masar
}
