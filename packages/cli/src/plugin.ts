import { relative } from 'node:path'
import { parseSync, type Plugin } from 'vite'
import { collectIcons, iconsModule } from './icons'

const ACTIONS = /\/src\/modules\/([^/]+)\/actions\.tsx?$/
const PAGE = /\/src\/modules\/[^/]+\/views\/pages\/.+\.tsx$/
const SERVER_ONLY = [
  /\/src\/modules\/[^/]+\/(schema|routes|module)\.tsx?$/,
  /\/src\/modules\/[^/]+\/jobs\//,
  /\/src\/modules\/admin\/(resources\/|dashboard\.tsx?$)/,
  /\/src\/modules\/[^/]+\/(seeds|schedule)\.tsx?$/,
  /\/src\/modules\/[^/]+\/mail\//,
  /\/src\/config\//,
  /\.server\.tsx?$/,
]
const PAGE_SERVER_EXPORTS = new Set(['load', 'route', 'sitemap'])

type Node = { type: string; start: number; end: number; [key: string]: any }

function program(file: string, code: string): Node[] {
  return parseSync(file, code, { lang: file.endsWith('x') ? 'tsx' : 'ts' }).program.body as unknown as Node[]
}

/** Value exports of actions.ts (types are skipped). */
function exportedNames(file: string, code: string): string[] {
  const names: string[] = []
  for (const node of program(file, code)) {
    if (node.type !== 'ExportNamedDeclaration' || node.exportKind === 'type') continue
    const decl = node.declaration
    if (decl?.type === 'VariableDeclaration') {
      for (const d of decl.declarations) if (d.id.type === 'Identifier') names.push(d.id.name)
    } else if (decl?.type === 'FunctionDeclaration' && decl.id) {
      names.push(decl.id.name)
    } else if (!decl) {
      for (const s of node.specifiers ?? []) if (s.exportKind !== 'type') names.push(s.exported.name)
    }
  }
  return names
}

/**
 * Remove `export function load` / `export const route` from a page for the
 * browser. Replaced with whitespace so positions (and source maps) stay valid;
 * imports only used by load() then disappear in the TypeScript transform.
 */
function stripServerExports(file: string, code: string): string | null {
  const ranges: [number, number][] = []
  for (const node of program(file, code)) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue
    const decl = node.declaration
    const isServer =
      (decl.type === 'FunctionDeclaration' && PAGE_SERVER_EXPORTS.has(decl.id?.name)) ||
      (decl.type === 'VariableDeclaration' &&
        decl.declarations.every((d: Node) => d.id.type === 'Identifier' && PAGE_SERVER_EXPORTS.has(d.id.name)))
    if (isServer) ranges.push([node.start, node.end])
  }
  if (ranges.length === 0) return null
  let out = code
  for (const [start, end] of ranges.reverse()) {
    out = out.slice(0, start) + out.slice(start, end).replace(/[^\n]/g, ' ') + out.slice(end)
  }
  return out
}

/**
 * The Masar Vite plugin. In the browser build it:
 *  - turns src/modules/<m>/actions.ts into RPC calls (same names, same types)
 *  - strips load()/route from pages
 *  - refuses server-only files (schema, routes, config, jobs) with a clear message
 */
export function masar(root: string): Plugin {
  const rel = (file: string) => relative(root, file)
  const ICONS = '\0masar-icons'
  let iconKey = ''
  return {
    name: 'masar',
    enforce: 'pre',
    load(id) {
      // Only the Lucide icons the app names (icon: '...', <Icon name="..."/>), so no 1500-icon bundle.
      if (id !== ICONS) return
      iconKey = collectIcons(root).names.join(',')
      return iconsModule(root)
    },
    hotUpdate({ file, server }) {
      if (!file.replace(/\\/g, '/').includes('/src/') || !/\.(tsx?|jsx?)$/.test(file)) return
      const next = collectIcons(root).names.join(',')
      if (next === iconKey) return
      iconKey = next
      const mod = server.environments.client.moduleGraph.getModuleById(ICONS)
      if (mod) server.environments.client.moduleGraph.invalidateModule(mod)
      server.environments.client.hot.send({ type: 'full-reload' })
    },
    resolveId(source, importer, options) {
      if (source === 'virtual:masar/icons') return ICONS
      // Skip Vite's dependency scanner: it reads files before this plugin rewrites them.
      if (this.environment.config.consumer !== 'client' || (options as { scan?: boolean } | undefined)?.scan) return
      if (source === 'masar' || source === 'masar/server') {
        this.error(
          `${importer ? rel(importer) : 'A browser file'} imports "${source}", which is server code.\n` +
            `  → In pages and components import from "masar/react". Use "import type" for types.`,
        )
      }
    },
    transform(code, id) {
      if (this.environment.config.consumer !== 'client') return
      const file = id.split('?')[0].replace(/\\/g, '/')
      if (!file.startsWith(root.replace(/\\/g, '/'))) return

      const action = file.match(ACTIONS)
      if (action) {
        const names = exportedNames(file, code)
        const body = names
          .map((n) => `export const ${n} = /* @__PURE__ */ __masarAction(${JSON.stringify(action[1])}, ${JSON.stringify(n)})`)
          .join('\n')
        return { code: `import { __masarAction } from 'masar/runtime'\n${body}\n`, map: null }
      }

      if (PAGE.test(file)) {
        const stripped = stripServerExports(file, code)
        return stripped ? { code: stripped, map: null } : undefined
      }

      if (SERVER_ONLY.some((pattern) => pattern.test(file))) {
        this.error(
          `${rel(file)} is server-only and cannot be imported by browser code.\n` +
            `  → Pages reach the server through actions (import { myAction } from '../../actions') or load().\n` +
            `  → For types from schema.ts use: import type { RowOf } from 'masar'`,
        )
      }
    },
  }
}
