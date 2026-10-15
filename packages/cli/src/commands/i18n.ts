import { loadApp } from '../load'
import { printLocales, syncLocales } from '../i18n'
import { findRoot } from '../project'

export async function i18n() {
  const root = findRoot()
  const { app, close } = await loadApp(root)
  try {
    console.log()
    printLocales(syncLocales(root, app.app.locales, app.app.locale, [...app.modules.map((m) => m.title), ...(app.admin?.labelKeys() ?? [])]))
    console.log()
  } finally {
    await close()
  }
}
