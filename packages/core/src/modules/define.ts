import type { Authorize } from '../auth'

export interface ModuleDefinition {
  /** Must match the folder name in src/modules. */
  name: string
  /** Label used in the navigation. Defaults to the capitalized name. */
  title?: string
  /** URL prefix for this module's pages and routes. Defaults to `/<name>`. */
  prefix?: string
  /** Database connection from src/config/database.ts. Defaults to the default connection. */
  store?: string
  /**
   * ui: serve the pages in views/pages (default true).
   * api: also expose every action as JSON under /api/<module>/<action> (default false).
   */
  expose?: { ui?: boolean; api?: boolean }
  /** Modules this one relies on. Masar checks they exist at boot. */
  depends?: string[]
  /** Show this module's index page in the shared navigation (default true). */
  nav?: boolean
  /**
   * Who may open this module's pages, routes and actions, on top of each action's own authorize.
   * e.g. role('admin') for a back office. Pages are open to everyone when this is left out.
   */
  authorize?: Authorize
}

/** Describe a module in src/modules/<name>/module.ts. */
export function defineModule<const M extends ModuleDefinition>(definition: M): M {
  return definition
}
