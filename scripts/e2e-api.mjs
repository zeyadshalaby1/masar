/**
 * HTTP checks for uploads and the admin, run by `pnpm e2e` after the browser test.
 * Makes its own admin with `masar user:role` (runs in ../playground).
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const base = process.env.BASE_URL ?? 'http://localhost:3000'
const playground = fileURLToPath(new URL('../playground', import.meta.url))
const stamp = Date.now()

const ok = (condition, label) => {
  if (!condition) throw new Error(label)
  console.log(`  ✓ ${label}`)
}

/** A cookie-keeping client that calls actions and admin operations. */
const session = () => {
  let cookie = ''
  return async (path, body) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-masar-action': '1', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = response.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const json = response.headers.get('content-type')?.includes('json')
    return { status: response.status, body: json ? await response.json() : await response.text() }
  }
}

const upload = async (call, model, field, name, type, bytes) => {
  const prepared = await call('/_masar/uploads/prepare', { model, field, name, type, size: bytes.length })
  if (prepared.status !== 200) return prepared
  const { upload: target, file } = prepared.body.data
  const put = await fetch(new URL(target.url, base), { method: 'PUT', headers: target.headers, body: bytes })
  return { status: put.status, file }
}

try {
  // ── Uploads ──
  const user = session()
  ok((await user('/_masar/uploads/prepare', { model: 'courses', field: 'cover', name: 'a.png', type: 'image/png', size: 10 })).status === 401, 'upload needs sign in')
  await user('/_masar/actions/auth/register', { name: 'Files', email: `files${stamp}@example.com`, password: 'correct-horse' })
  const png = new Uint8Array(1000).fill(7)
  ok((await upload(user, 'courses', 'cover', 'a.pdf', 'application/pdf', png)).status === 422, 'wrong file type rejected (422)')
  ok((await upload(user, 'courses', 'cover', 'big.png', 'image/png', new Uint8Array(3 * 1024 * 1024))).status === 422, 'file over maxSize rejected (422)')
  const first = await upload(user, 'courses', 'cover', 'a.png', 'image/png', png)
  ok(first.status === 204 && first.file.url.startsWith('/storage/courses/'), 'upload streamed to the local disk')
  const served = await fetch(base + first.file.url)
  ok(served.status === 200 && (await served.arrayBuffer()).byteLength === 1000 && served.headers.get('content-type') === 'image/png', 'file served with its type')
  const part = await fetch(base + first.file.url, { headers: { range: 'bytes=10-19' } })
  ok(part.status === 206 && (await part.arrayBuffer()).byteLength === 10, 'range requests (video seeking)')
  ok((await user('/_masar/actions/courses/createCourse', { title: 'Forged', cover: { ...first.file, path: 'courses/other.png' } })).status === 422, 'forged file reference rejected')
  const course = await user('/_masar/actions/courses/createCourse', { title: 'With cover', cover: first.file })
  ok(course.status === 200, 'record saved with its file')
  const second = await upload(user, 'courses', 'cover', 'b.png', 'image/png', png)
  await user('/_masar/actions/courses/updateCourse', { id: course.body.data.id, title: 'With cover', cover: second.file })
  ok((await fetch(base + first.file.url)).status === 404, 'replaced file deleted from storage')
  await user('/_masar/actions/courses/deleteCourse', { id: course.body.data.id })
  ok((await fetch(base + second.file.url)).status === 404, 'file deleted with its record')
  ok((await fetch(`${base}/_masar/files?d=private&p=x.png`)).status === 403, 'private file without a signature refused')

  // ── Admin ──
  const anon = session()
  ok((await anon('/_masar/admin/list', { resource: 'users' })).status === 401, 'admin API: signed out → 401')
  ok((await user('/_masar/admin/list', { resource: 'users' })).status === 403, 'admin API: not an admin → 403')
  ok((await fetch(`${base}/admin`, { headers: { accept: 'text/html' }, redirect: 'manual' })).status === 302, 'admin pages: signed out → login')

  const adminEmail = `admin${stamp}@example.com`
  const admin = session()
  await admin('/_masar/actions/auth/register', { name: 'E2E Admin', email: adminEmail, password: 'admin-pass-123' })
  execFileSync('npx', ['masar', 'user:role', adminEmail, 'admin'], { cwd: playground, stdio: 'ignore' })
  const found = await admin('/_masar/admin/list', { resource: 'users', q: adminEmail })
  ok(found.status === 200 && found.body.data.total === 1 && found.body.data.data[0].passwordHash === undefined, 'search; password hashes never leave the server')

  const duplicate = await admin('/_masar/admin/save', { resource: 'users', values: { name: 'X', email: adminEmail, role: 'user' } })
  ok(duplicate.status === 422 && duplicate.body.errors.email && duplicate.body.errors.password, 'unique email + required password, errors per field')
  const invalid = await admin('/_masar/admin/save', { resource: 'banners', values: { title: '', link: 'not a url', position: 'x' } })
  ok(invalid.status === 422 && ['title', 'link', 'position', 'image'].every((f) => invalid.body.errors[f]), 'banner form validated per field')

  const image = await upload(admin, 'banners', 'image', 'hero.png', 'image/png', png)
  const banner = await admin('/_masar/admin/save', { resource: 'banners', values: { title: `Banner ${stamp}`, image: image.file, link: 'https://masar.dev' } })
  ok(banner.status === 200 && banner.body.data.placement === 'home' && banner.body.data.active === true, 'banner created; schema defaults applied')
  const filtered = await admin('/_masar/admin/list', { resource: 'banners', filters: { active: 'true', placement: 'home' }, q: `Banner ${stamp}` })
  ok(filtered.body.data.total === 1, 'filters + search')

  const staffEmail = `staff${stamp}@example.com`
  const staff = await admin('/_masar/admin/save', { resource: 'users', values: { name: 'Staff', email: staffEmail, role: 'admin', password: 'staff-pass-123' } })
  const staffSession = session()
  ok((await staffSession('/_masar/actions/auth/login', { email: staffEmail, password: 'staff-pass-123' })).status === 200, 'user created in the admin can sign in')
  ok((await staffSession('/_masar/admin/dashboard', {})).status === 200, 'dashboard widgets load')
  const csv = await admin('/_masar/admin/export', { resource: 'users', q: staffEmail })
  ok(csv.status === 200 && csv.body.includes(staffEmail), 'CSV export')
  const removed = await admin('/_masar/admin/delete', { resource: 'banners', ids: [banner.body.data.id] })
  ok(removed.body.data.deleted === 1 && (await fetch(base + image.file.url)).status === 404, 'delete removes the record and its image')
  await admin('/_masar/admin/delete', { resource: 'users', ids: [staff.body.data.id] })

  // ── Mail: confirmation and password reset (dev outbox, skipped against a production server) ──
  const outbox = await fetch(`${base}/_masar/mail`)
  if (outbox.ok) {
    const latestLink = async (to, path) => {
      for (let i = 0; i < 30; i++) {
        const list = await (await fetch(`${base}/_masar/mail`)).text()
        const item = [...list.matchAll(/href="\/_masar\/mail\/([^"]+)">[^<]*<\/a><div[^>]*>to ([^ ]+) /g)].find((m) => m[2] === to)
        if (item) {
          const html = await (await fetch(`${base}/_masar/mail/${item[1]}`)).text()
          const link = html.match(new RegExp(`href="(https?://[^"]*${path}\\?token=[^"]+)"`))
          if (link) return new URL(link[1].replace(/&amp;/g, '&'))
        }
        await new Promise((r) => setTimeout(r, 200))
      }
      throw new Error(`no ${path} mail for ${to}`)
    }
    const mailEmail = `mail${stamp}@example.com`
    const member = session()
    await member('/_masar/actions/auth/register', { name: 'Mail Test', email: mailEmail, password: 'first-pass-123' })
    const verify = await latestLink(mailEmail, '/verify-email')
    ok(verify.pathname === '/verify-email', 'register sends a confirmation mail (through the queue)')
    ok((await member('/_masar/actions/auth/verifyEmail', { token: verify.searchParams.get('token') })).body.data === true, 'confirmation link verifies the email')
    ok((await member('/_masar/actions/auth/verifyEmail', { token: 'forged.token' })).body.data === false, 'forged token refused')

    await anon('/_masar/actions/auth/forgotPassword', { email: mailEmail })
    ok((await anon('/_masar/actions/auth/forgotPassword', { email: `nobody${stamp}@example.com` })).status === 200, 'forgot password answers the same for unknown emails')
    const reset = await latestLink(mailEmail, '/reset-password')
    const token = reset.searchParams.get('token')
    const fresh = session()
    ok((await fresh('/_masar/actions/auth/resetPassword', { token, password: 'second-pass-456' })).status === 200, 'reset link sets a new password')
    ok((await fresh('/_masar/actions/auth/resetPassword', { token, password: 'third-pass-789' })).status === 401, 'reset link works only once')
    ok((await session()('/_masar/actions/auth/login', { email: mailEmail, password: 'second-pass-456' })).status === 200, 'sign in with the new password')
    ok((await member('/_masar/actions/auth/resendVerification', undefined)).status === 401, 'old sessions ended by the reset')
  }

  console.log('\n  All good.\n')
} catch (error) {
  console.error(`\n  ✖ ${error.message}\n`)
  process.exitCode = 1
}
