/** Only same-site paths, so ?redirect= cannot send people to another site (//x, /\\x, https://x). */
export function safeRedirect(search: string) {
  const target = new URLSearchParams(search).get('redirect') ?? '/'
  try {
    const url = new URL(target, window.location.origin)
    return url.origin === window.location.origin && target.startsWith('/') ? url.pathname + url.search + url.hash : '/'
  } catch {
    return '/'
  }
}
