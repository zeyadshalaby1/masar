import { db, defineDashboard, users, widgets } from '@zeyadshalaby1/masar'

const DAY = 86_400_000

// Widgets run on the server when the dashboard opens. Remove this file for the default dashboard.
export default defineDashboard([
  widgets.banner('Welcome to your admin', {
    body: 'Every model of the app is here. Customize them in src/modules/admin/resources.',
    href: '/admin/users',
    cta: 'Manage users',
  }),
  widgets.stat('Users', () => db(users).count(), { icon: 'users', href: '/admin/users' }),
  widgets.stat('New this week', () => db(users).where({ createdAt: { gte: new Date(Date.now() - 7 * DAY).toISOString() } }).count(), {
    icon: 'user-plus',
  }),
  widgets.chart('Sign-ups, last 7 days', async () => {
    // Days in UTC, like the stored createdAt values.
    const since = new Date(Date.now() - 6 * DAY)
    since.setUTCHours(0, 0, 0, 0)
    const rows = await db(users).where({ createdAt: { gte: since.toISOString() } }).all()
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(since.getTime() + i * DAY)
      const key = day.toISOString().slice(0, 10)
      return { label: key.slice(5), value: rows.filter((r) => r.createdAt.slice(0, 10) === key).length }
    })
  }),
  widgets.latest('users', { limit: 5 }),
])
