export interface LoadContext<P extends Record<string, string> = Record<string, string>> {
  /** Dynamic URL segments, e.g. { id } for views/pages/[id].tsx */
  params: P
  query: URLSearchParams
  url: URL
  request: Request
}

/** `export async function load(ctx)` in a page file. Runs on the server only. */
export type PageLoader = (context: LoadContext<any>) => unknown

/** What search engines and link previews see: `export const meta = ({ course }, t) => ({ title: course.title })` */
export interface PageMeta {
  title?: string
  description?: string
  /** Absolute URL of the share image (og:image). */
  image?: string
  /** Defaults to the app URL + the page path. */
  canonical?: string
  /** Keep this page out of search results. */
  noindex?: boolean
}

export interface PageModule {
  default: unknown
  load?: PageLoader
  /** Override the URL derived from the file name, e.g. export const route = '/learn/:slug' */
  route?: string
  /** Title, description and share image: an object, or (props, t) => ({ title: t('Courses') }). */
  meta?: PageMeta | ((props: any, t: (key: string, params?: Record<string, string | number>) => string) => PageMeta)
  /** Pages render on the server by default; false renders this one only in the browser. */
  ssr?: boolean
  /** For dynamic pages ([id].tsx): the params to list in sitemap.xml. Server only. */
  sitemap?: () => Promise<Record<string, string>[]> | Record<string, string>[]
}
