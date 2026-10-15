/**
 * Load an optional database driver installed in the app.
 * The specifier is a variable on purpose: bundlers leave it alone and
 * TypeScript doesn't require the driver's types in apps that don't use it.
 */
export function importDriver(name: 'postgres' | 'mongodb'): Promise<any> {
  const specifier: string = name
  return import(/* @vite-ignore */ specifier)
}
