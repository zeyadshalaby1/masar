import pc from 'picocolors'

export const VERSION = '0.1.0'

/** Masar orange (#FF5A1F) in terminals that support it. */
export const orange = (text: string) => (pc.isColorSupported ? `\x1b[38;2;255;90;31m${text}\x1b[39m` : text)

export function banner(subtitle: string) {
  console.log()
  console.log(`  ${orange('◆')} ${pc.bold('Masar')} ${pc.dim(`v${VERSION}`)}  ${pc.dim(subtitle)}`)
  console.log()
}

export function line(label: string, value: string) {
  console.log(`  ${orange('➜')}  ${pc.bold(label.padEnd(9))} ${value}`)
}

export function printError(error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error))
  const hint = (err as { hint?: string }).hint
  console.error()
  console.error(`  ${pc.red('✖')} ${pc.bold(err.message)}`)
  if (hint) console.error(`    ${pc.yellow('→')} ${hint}`)
  if (!hint && err.stack) console.error(pc.dim(err.stack.split('\n').slice(1, 8).join('\n')))
  console.error()
}

export function table(rows: string[][], header: string[]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] ?? '').length)))
  const format = (cells: string[]) =>
    cells.map((cell, i) => cell + ' '.repeat(Math.max(0, widths[i] - stripAnsi(cell).length))).join('  ')
  console.log(`  ${pc.dim(format(header))}`)
  for (const row of rows) console.log(`  ${format(row)}`)
}

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, '')
