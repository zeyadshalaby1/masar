import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import pc from 'picocolors'
import { orange } from './ui'

// t('text'), t("text") and t(`text`) without ${}: the key is the text itself.
const CALL = /(?<![\w.$])t\(\s*(?:'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\$])*)`)/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(path)
  }
  return out
}

export function scanKeys(root: string): Set<string> {
  const keys = new Set<string>()
  for (const file of walk(join(root, 'src'))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(CALL)) {
      // Skip examples in comments (lines starting with //, * or /*).
      const line = source.slice(source.lastIndexOf('\n', match.index) + 1, match.index)
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
      const raw = match[1] ?? match[2] ?? match[3] ?? ''
      if (raw) keys.add(raw.replace(/\\(.)/g, '$1'))
    }
  }
  return keys
}

export interface LocaleReport {
  code: string
  file: string
  added: number
  untranslated: number
}

/**
 * Keep src/locales/<code>.json in step with the code: every t('...') key appears in every file.
 * The default language gets the key as its text; others get "" until translated (the key shows meanwhile).
 * Existing translations are never touched, and keys no longer used are kept.
 */
export function syncLocales(root: string, locales: string[], fallback: string, extra: string[] = []): LocaleReport[] {
  const keys = [...new Set([...scanKeys(root), ...extra])]
  const dir = join(root, 'src/locales')
  mkdirSync(dir, { recursive: true })
  return locales.map((code) => {
    const file = join(dir, `${code}.json`)
    const before = existsSync(file) ? readFileSync(file, 'utf8') : ''
    let messages: Record<string, string> = {}
    try {
      messages = before ? JSON.parse(before) : {}
    } catch {
      throw Object.assign(new Error(`${relative(root, file)} is not valid JSON`), { hint: 'Fix the file (a missing comma or quote), then save again.' })
    }
    let added = 0
    for (const key of keys) {
      if (key in messages) continue
      messages[key] = code === fallback ? key : ''
      added++
    }
    const after = `${JSON.stringify(messages, null, 2)}\n`
    if (after !== before) writeFileSync(file, after)
    const untranslated = Object.values(messages).filter((v) => !v).length
    return { code, file: relative(root, file), added, untranslated }
  })
}

export function printLocales(reports: LocaleReport[], { quiet = false } = {}) {
  for (const r of reports) {
    if (quiet && r.added === 0) continue
    const status = r.untranslated ? pc.yellow(`${r.untranslated} to translate`) : pc.dim('complete')
    const added = r.added ? `${pc.green(`+${r.added}`)} ` : ''
    console.log(`  ${orange('➜')}  ${pc.bold('Locale'.padEnd(9))} ${r.code} ${added}${status} ${pc.dim(r.file)}`)
  }
}
