import { auth, db, defineSeed, env, users } from 'masar'

// masar db:seed: an admin to open /admin with (ADMIN_EMAIL / ADMIN_PASSWORD in .env), and a few users. Test data only.
export default defineSeed(async ({ fake, log }) => {
  const email = env('ADMIN_EMAIL', 'admin@example.com')
  if (!(await db(users).where({ email }).exists())) {
    await auth.register({ name: 'Admin', email, password: env('ADMIN_PASSWORD', 'password'), role: 'admin' })
    log(`${email} (role admin)`)
  }
  for (let i = 0; i < 10; i++) {
    const name = fake.name(fake.boolean() ? 'ar' : 'en')
    await auth.register({ name, email: fake.email(), password: 'password' })
  }
  log('10 users (password: password)')
})
