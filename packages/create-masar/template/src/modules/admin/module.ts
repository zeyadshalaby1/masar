import { defineModule, role } from 'masar'

// The back office at /admin. It reads every model of the app; customize one in resources/<name>.ts,
// the dashboard in dashboard.ts, and add pages with: masar make:admin-page "Reports" --icon chart-bar
export default defineModule({
  name: 'admin',
  title: 'Admin',
  prefix: '/admin',
  nav: false,
  authorize: role('admin'),
})
