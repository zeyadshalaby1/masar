import { auth, db, defineSeed, users } from 'masar'

// masar db:seed: an admin to open /admin with, and a few users. Test data only.
export default defineSeed(async ({ fake, log }) => {
  if (!(await db(users).where({ email: 'admin@example.com' }).exists())) {
    await auth.register({ name: 'Admin', email: 'admin@example.com', password: 'password', role: 'admin' })
    log('admin@example.com / password (role admin)')
  }
  for (let i = 0; i < 10; i++) {
    const name = fake.name(fake.boolean() ? 'ar' : 'en')
    await auth.register({ name, email: fake.email(), password: 'password' })
  }
  log('10 users (password: password)')
})
