/**
 * Browser smoke test for the playground. Start `pnpm dev` first, then run:
 *   pnpm e2e            (or BASE_URL=http://localhost:4000 pnpm e2e for the production build)
 * Covers: auth (redirect to login, register, bearer tokens, closed API), home render, module navigation, action validation (422), create,
 * search, show page, update, delete, and the built-in 404 page.
 */
import { chromium } from 'playwright'

const base = process.env.BASE_URL ?? 'http://localhost:3000'
// CHROMIUM_PATH lets you reuse an existing Chromium instead of `npx playwright install chromium`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error' && !/status of (401|404|422)/.test(m.text())) errors.push(m.text())
})
const ok = (label) => console.log(`  ✓ ${label}`)
const title = `E2E ${Date.now()}`

try {
  await page.goto(`${base}/`)
  await page.waitForSelector('h1')
  ok('home renders')

  const email = `e2e-${Date.now()}@example.com`
  const api = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } })
  if ((await api('/api/courses/list-courses')).status !== 401) throw new Error('API answered without a token')
  ok('closed API returns 401')

  const arabic = await (await fetch(`${base}/login`, { headers: { 'accept-language': 'ar-EG,ar;q=0.9' } })).text()
  if (!arabic.includes('dir="rtl"') || !arabic.includes('تسجيل الدخول')) throw new Error('Arabic visitor did not get rtl + Arabic texts')
  ok('Accept-Language ar renders rtl + Arabic')

  await page.goto(`${base}/courses`)
  await page.waitForURL('**/login?redirect=%2Fcourses')
  ok('signed-out page redirects to login')

  await page.click('text=Create one')
  await page.waitForURL('**/register?redirect=%2Fcourses')
  await page.fill('#name', 'E2E User')
  await page.fill('#email', email)
  await page.fill('#password', 'short')
  await page.click('button:has-text("Create account")')
  await page.waitForSelector('text=Use at least 8 characters')
  await page.fill('#password', 'correct-horse')
  await page.click('button:has-text("Create account")')
  await page.waitForURL('**/courses')
  await page.waitForSelector('header >> text=E2E User')
  ok('register signs in and returns to the page')

  const tokenRes = await api('/api/auth/token', { method: 'POST', body: JSON.stringify({ email, password: 'correct-horse' }) })
  const { data } = await tokenRes.json()
  const listed = await api('/api/courses/list-courses', { headers: { authorization: `Bearer ${data.token}` } })
  if (listed.status !== 200) throw new Error(`bearer token rejected: ${listed.status}`)
  const wrong = await api('/api/auth/token', { method: 'POST', body: JSON.stringify({ email, password: 'nope' }) })
  if (wrong.status !== 401) throw new Error(`wrong password gave ${wrong.status}`)
  ok('bearer token for the API')

  await page.goto(`${base}/`)
  await page.click('header >> text=Courses')
  await page.waitForURL('**/courses')
  ok('navigation to /courses')

  await page.fill('#title', 'x')
  await page.click('button:has-text("Create")')
  await page.waitForSelector('text=Title is too short')
  ok('validation error shown (422)')

  await page.fill('#title', title)
  await page.click('button:has-text("Create")')
  await page.waitForSelector(`text=${title}`)
  ok('create through action')

  await page.fill('input[name=q]', title)
  await page.click('button:has-text("Search")')
  await page.waitForURL('**/courses?q=*')
  ok('search')

  await page.click(`text=${title}`)
  await page.waitForURL(/\/courses\/[0-9a-f-]+$/)
  await page.fill('#title', `${title} v2`)
  await page.click('button:has-text("Save changes")')
  await page.waitForSelector(`h1:has-text("${title} v2")`)
  ok('show page + update')

  await page.click('button:has-text("Delete")')
  await page.waitForURL('**/courses')
  if ((await page.locator(`text=${title} v2`).count()) !== 0) throw new Error('row still listed after delete')
  ok('delete')

  await page.goto(`${base}/courses/does-not-exist`)
  await page.waitForSelector('text=404')
  ok('404 page')

  await page.goto(`${base}/`)
  await page.click('header >> text=Sign out')
  await page.waitForURL('**/login')
  await page.goto(`${base}/courses`)
  await page.waitForURL('**/login?redirect=*')
  ok('sign out')

  if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`)
  console.log('\n  All good.\n')
} catch (error) {
  console.error(`\n  ✖ ${error.message}\n`)
  process.exitCode = 1
} finally {
  await browser.close()
}
