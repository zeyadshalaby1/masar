const enabled = process.stdout?.isTTY && !process.env.NO_COLOR
const paint = (code: string) => (text: string) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : text)

export const colors = {
  dim: paint('2'),
  bold: paint('1'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  magenta: paint('35'),
  cyan: paint('36'),
}

const time = () => colors.dim(new Date().toTimeString().slice(0, 8))

export const log = {
  info(scope: string, message: string) {
    console.log(`${time()} ${colors.cyan(scope.padEnd(7))} ${message}`)
  },
  warn(scope: string, message: string) {
    console.warn(`${time()} ${colors.yellow(scope.padEnd(7))} ${message}`)
  },
  error(scope: string, error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error))
    const hint = (err as { hint?: string }).hint
    console.error(`${time()} ${colors.red(scope.padEnd(7))} ${err.message}`)
    if (hint) console.error(`${' '.repeat(17)}${colors.yellow('→')} ${hint}`)
    if (err.stack && !hint) console.error(colors.dim(err.stack.split('\n').slice(1, 6).join('\n')))
  },
}
