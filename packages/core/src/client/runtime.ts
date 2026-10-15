/**
 * Browser side of actions. Masar's Vite plugin replaces every
 * `src/modules/<module>/actions.ts` imported by the browser with calls to
 * __masarAction(), so pages import actions exactly like server code does.
 */

export class ActionError extends Error {
  readonly status: number
  readonly hint?: string

  constructor(message: string, status: number, hint?: string) {
    super(message)
    this.name = 'ActionError'
    this.status = status
    this.hint = hint
  }
}

export class ActionValidationError extends ActionError {
  readonly errors: Record<string, string[]>

  constructor(errors: Record<string, string[]>, message: string) {
    super(message, 422)
    this.name = 'ActionValidationError'
    this.errors = errors
  }
}

export function __masarAction(module: string, name: string) {
  const call = async (input?: unknown) => {
    const response = await fetch(`/_masar/actions/${module}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-masar-action': '1' },
      body: input === undefined ? '' : JSON.stringify(input),
    })
    const body = (await response.json().catch(() => null)) as
      | { data?: unknown; message?: string; errors?: Record<string, string[]>; hint?: string }
      | null
    if (response.status === 422 && body?.errors) throw new ActionValidationError(body.errors, body.message ?? 'Invalid data')
    if (!response.ok) throw new ActionError(body?.message ?? response.statusText, response.status, body?.hint)
    return body?.data ?? null
  }
  return Object.assign(call, { __masar: 'action' as const, id: `${module}.${name}` })
}

/** The shape of a stored file (see StoredFile in @masar/core). */
export interface UploadedFile {
  disk: string
  path: string
  name: string
  size: number
  type: string
  url: string | null
  sig: string
}

export interface UploadOptions {
  /** Table name and file field the upload is for: the server applies that field's rules. */
  model: string
  field: string
  /** 0..1 while the bytes go up. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/**
 * Upload one file for a file field. Bytes go straight to the disk (a presigned S3 URL or
 * Masar's streaming endpoint), then save the returned object in your record:
 *
 *   const cover = await uploadFile(file, { model: 'courses', field: 'cover', onProgress: setProgress })
 *   await updateCourse({ id, cover })
 */
export async function uploadFile(file: File, options: UploadOptions): Promise<UploadedFile> {
  const response = await fetch('/_masar/uploads/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-masar-action': '1' },
    body: JSON.stringify({ model: options.model, field: options.field, name: file.name, type: file.type || 'application/octet-stream', size: file.size }),
  })
  const body = (await response.json().catch(() => null)) as
    | { data?: { upload: { method: string; url: string; headers: Record<string, string> }; file: UploadedFile }; message?: string; errors?: Record<string, string[]> }
    | null
  if (response.status === 422 && body?.errors) throw new ActionValidationError(body.errors, body.message ?? 'Invalid file')
  if (!response.ok || !body?.data) throw new ActionError(body?.message ?? response.statusText, response.status)
  const { upload, file: stored } = body.data

  // XHR, because fetch cannot report upload progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(upload.method, upload.url)
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => event.lengthComputable && options.onProgress?.(event.loaded / event.total)
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new ActionError(`Upload failed (${xhr.status})`, xhr.status)))
    xhr.onerror = () => reject(new ActionError('Upload failed: network error or the storage refused it (check CORS on the bucket)', 0))
    xhr.onabort = () => reject(new ActionError('Upload cancelled', 0))
    options.signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
  options.onProgress?.(1)
  return stored
}
