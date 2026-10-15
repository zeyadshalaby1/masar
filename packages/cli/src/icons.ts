import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Icons the admin UI itself uses. */
const BUILTIN = [
  'arrow-down', 'arrow-up', 'arrow-up-down', 'arrow-up-right', 'check', 'chevron-left', 'chevron-right', 'chevrons-up-down',
  'circle', 'circle-alert', 'circle-check', 'database', 'download', 'file', 'file-text', 'film', 'languages', 'layout-dashboard',
  'list-filter', 'log-out', 'menu', 'monitor', 'moon', 'music', 'pencil', 'play', 'plus', 'refresh-cw', 'search', 'sun',
  'trash-2', 'upload-cloud', 'users', 'x',
]

// icon: 'book-open' · icon="chart-bar" · icon={'x'} · <Icon name="x" /> · --icon in generated meta
const PATTERNS = [/\bicon\s*[:=]\s*\{?\s*['"`]([a-z0-9-]+)['"`]/g, /<Icon\b[^>]*?\bname=\{?\s*['"`]([a-z0-9-]+)['"`]/g]

function walk(dir: string, out: string[] = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(path)
  }
  return out
}

export function lucideDir(root: string): string | null {
  try {
    return dirname(createRequire(join(root, 'package.json')).resolve('lucide-react/package.json'))
  } catch {
    return null
  }
}

/** Every icon name the app mentions, plus the admin's own. Unknown names are reported, not fatal. */
export function collectIcons(root: string): { names: string[]; unknown: string[]; dir: string | null } {
  const names = new Set(BUILTIN)
  for (const file of walk(join(root, 'src'))) {
    const code = readFileSync(file, 'utf8')
    for (const pattern of PATTERNS) for (const m of code.matchAll(pattern)) names.add(m[1]!)
  }
  const dir = lucideDir(root)
  const exists = (name: string) => dir !== null && existsSync(join(dir, 'dist/esm/icons', `${name}.mjs`))
  const all = [...names].sort()
  // Tailwind classes like icon: 'size-9' (button size variants) are not icon names.
  return { names: all.filter(exists), unknown: all.filter((n) => !exists(n) && !/^(size|w|h|p|m|gap)-/.test(n)), dir }
}

export function iconsModule(root: string): string {
  const { names, dir } = collectIcons(root)
  if (!dir) return 'export const icons = {}\n'
  const imports = names.map((n, i) => `import i${i} from ${JSON.stringify(join(dir, 'dist/esm/icons', `${n}.mjs`).replace(/\\/g, '/'))}`)
  return `${imports.join('\n')}\nexport const icons = { ${names.map((n, i) => `${JSON.stringify(n)}: i${i}`).join(', ')} }\n`
}
