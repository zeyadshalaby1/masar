import { action, auth, t, UnauthorizedError, z } from '@zeyadshalaby1/masar'

const credentials = z.object({
  email: z.string().trim().email({ error: () => t('Enter a valid email') }),
  password: z.string().min(1, { error: () => t('Enter your password') }),
})

export const register = action({
  authorize: 'public',
  input: z.object({
    name: z.string().trim().min(2, { error: () => t('Name is too short') }).max(100),
    email: z.string().trim().email({ error: () => t('Enter a valid email') }),
    password: z.string().min(8, { error: () => t('Use at least 8 characters') }).max(200),
  }),
  run: async ({ input }) => {
    const user = await auth.register(input)
    await auth.login(user)
    await auth.sendVerification(user)
    return user
  },
})

export const login = action({
  authorize: 'public',
  input: credentials,
  run: async ({ input }) => {
    const user = await auth.attempt(input.email, input.password)
    if (!user) throw new UnauthorizedError(t('Email or password is wrong'))
    await auth.login(user)
    return user
  },
})

export const logout = action({
  authorize: 'user',
  run: () => auth.logout(),
})

/** For mobile apps: POST /api/auth/token, then send Authorization: Bearer <token>. */
export const token = action({
  authorize: 'public',
  input: credentials,
  run: async ({ input }) => {
    const user = await auth.attempt(input.email, input.password)
    if (!user) throw new UnauthorizedError(t('Email or password is wrong'))
    return { token: await auth.createToken(user), user }
  },
})

export const resendVerification = action({
  authorize: 'user',
  run: async ({ user }) => {
    if (user && !user.emailVerifiedAt) await auth.sendVerification(user)
  },
})

/** Used by the /verify-email page when someone opens the link from the mail. */
export const verifyEmail = action({
  authorize: 'public',
  input: z.object({ token: z.string() }),
  run: async ({ input }) => Boolean(await auth.verifyEmail(input.token)),
})

export const forgotPassword = action({
  authorize: 'public',
  input: z.object({ email: z.string().trim().email({ error: () => t('Enter a valid email') }) }),
  // Same answer whether or not the email has an account.
  run: ({ input }) => auth.sendPasswordReset(input.email),
})

export const resetPassword = action({
  authorize: 'public',
  input: z.object({
    token: z.string(),
    password: z.string().min(8, { error: () => t('Use at least 8 characters') }).max(200),
  }),
  run: async ({ input }) => {
    const user = await auth.resetPassword(input.token, input.password)
    if (!user) throw new UnauthorizedError(t('This link is invalid or expired. Ask for a new one.'))
    await auth.login(user)
    return user
  },
})
