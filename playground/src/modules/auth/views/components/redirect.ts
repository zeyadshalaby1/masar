/** Only same-site paths, so ?redirect= cannot send people to another site. */
export function safeRedirect(search: string) {
  const target = new URLSearchParams(search).get('redirect') ?? '/'
  return target.startsWith('/') && !target.startsWith('//') ? target : '/'
}
