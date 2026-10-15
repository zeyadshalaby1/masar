export type DiskConfig =
  | {
      driver: 'local'
      /** Folder on the server, relative to the app root. */
      root: string
      /** Public URL prefix, e.g. '/storage'. Leave out for private files (served through signed links). */
      url?: string
    }
  | {
      /** Any S3-compatible service: AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, Backblaze B2, Bunny... */
      driver: 's3'
      bucket: string
      region: string
      key: string
      secret: string
      /** For services other than AWS, e.g. https://<account>.r2.cloudflarestorage.com */
      endpoint?: string
      /** Public base URL (a CDN or the bucket's public domain). Leave out for private buckets. */
      url?: string
    }

export interface StorageConfig<D extends Record<string, DiskConfig> = Record<string, DiskConfig>> {
  /** Disk used when f.file() or storage() does not name one. */
  default: keyof D & string
  disks: D
}

/**
 * Where uploaded files live, in src/config/storage.ts:
 *
 *   export default defineStorage({
 *     default: 'public',
 *     disks: {
 *       public: { driver: 'local', root: 'storage/public', url: '/storage' },
 *       videos: { driver: 's3', bucket: 'courses', region: 'auto', endpoint: env('S3_ENDPOINT'), key: env('S3_KEY'), secret: env('S3_SECRET') },
 *     },
 *   })
 */
export function defineStorage<const D extends Record<string, DiskConfig>>(config: StorageConfig<D>): StorageConfig<D> {
  return config
}

export const DEFAULT_STORAGE: StorageConfig = {
  default: 'public',
  disks: {
    public: { driver: 'local', root: 'storage/public', url: '/storage' },
    private: { driver: 'local', root: 'storage/private' },
  },
}
