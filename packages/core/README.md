<p align="center">
  <a href="https://masar.zeyad.io"><img src="https://raw.githubusercontent.com/zeyadshalaby1/masar/main/brand/logo.svg" alt="Masar" height="64"></a>
</p>

<p align="center"><b>One clear path from idea to production.</b><br>The full-stack TypeScript framework where a feature is one folder.</p>

<p align="center">
  <a href="https://masar.zeyad.io">Website</a> · <a href="https://masar.zeyad.io/docs">Docs</a> · <a href="https://github.com/zeyadshalaby1/masar">GitHub</a>
</p>

# masar

The runtime of [Masar](https://masar.zeyad.io): modules, actions, server-rendered React pages, one data layer
for SQLite, PostgreSQL and MongoDB, auth with email flows, a database-backed job queue and scheduler, mail,
uploads to local disks or S3, i18n with automatic right-to-left, and a generated admin panel.

Start with `npm create masar@latest` instead of installing this package by hand.

```ts
import { action, db, f, model, z } from 'masar'

export const courses = model('courses', { title: f.string(), price: f.number().default(0) })

export const createCourse = action({
  authorize: 'user',
  input: z.object({ title: z.string().min(2) }),
  run: ({ input }) => db(courses).create(input),
})
```

| Import | For |
| --- | --- |
| `masar` | Server API: `defineModule`, `model`, `f`, `db`, `action`, `auth`, `defineJob`, `defineMail`, `t`... |
| `masar/react` | Pages: `Link`, `useAction`, `useForm`, `useT`, `PageProps`... |

Read the docs at [masar.zeyad.io/docs](https://masar.zeyad.io/docs).

## Quick start

Requires Node.js 22.13 or newer.

```bash
npm create masar@latest my-app
cd my-app
npm run dev
```

## Feature structure

```text
src/modules/courses/
├── module.ts          URL prefix, API exposure and authorization
├── schema.ts          models and fields
├── actions.ts         validated server operations
├── jobs/              optional background jobs
├── mail/              optional React mail templates
└── views/
    ├── pages/         React pages with server-only load()
    └── components/    feature UI
```

Masar runs on Hono, Vite, React and Inertia, with its own module and action conventions.
It brings data, auth, jobs, mail and admin into the feature workflow. This is an early 0.1 release;
the MongoDB adapter has had less testing than SQLite and PostgreSQL.

## License

[FSL-1.1-ALv2](https://github.com/zeyadshalaby1/masar/blob/main/LICENSE): build anything with Masar, including commercial products. Do not use its source to build a competing framework or product. Each release becomes Apache 2.0 after two years.

Designed and built by [Zeyad Shalaby](https://zeyadshalaby.com).

