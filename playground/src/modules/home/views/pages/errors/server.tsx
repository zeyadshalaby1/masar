import { MasarError } from 'masar'

/** /errors/server: a load() that fails with a hint, to see the server error page. */
export async function load() {
  throw new MasarError('Payment provider is not configured', {
    hint: 'Add PAYMOB_API_KEY to .env, or turn payments off in src/config/payments.ts.',
  })
}

export default function ServerError() {
  return null
}
