import { defineStorage, env } from '@masar/core'

/**
 * Where uploads go. A file field picks a disk with f.file({ disk: 'videos' }); otherwise `default`.
 * Local disks live under storage/ on the server. For cloud storage uncomment `cloud` and fill
 * the S3_* values in .env: any S3-compatible service works (AWS S3, Cloudflare R2, Spaces, MinIO).
 */
export default defineStorage({
  default: 'public',
  disks: {
    public: { driver: 'local', root: 'storage/public', url: '/storage' },
    private: { driver: 'local', root: 'storage/private' },
    // cloud: {
    //   driver: 's3',
    //   bucket: env('S3_BUCKET'),
    //   region: env('S3_REGION', 'auto'),
    //   endpoint: env('S3_ENDPOINT', ''),
    //   key: env('S3_KEY'),
    //   secret: env('S3_SECRET'),
    //   url: env('S3_URL', ''), // public bucket or CDN domain; leave empty for private files
    // },
  },
})

