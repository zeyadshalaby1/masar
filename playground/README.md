# playground

Built with [Masar](https://github.com/) — one clear path from idea to production.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm run dev` | Development server with hot reload |
| `pnpm run build` | Production build into `dist/` |
| `pnpm run start` | Run the production build |
| `npx masar make:module <name>` | New module with model, actions and pages |
| `npx masar routes` | Every page, action, API and route |
| `npx masar db:sync` | Create missing tables, columns and indexes |

## Where things go

```
src/
├── config/            app.ts, database.ts (values come from .env)
├── shared/            ui/ (shadcn), layouts/, styles/, lib/
└── modules/
    └── <module>/
        ├── module.ts      name, prefix, store, ui/api, depends
        ├── schema.ts      models → tables or collections
        ├── actions.ts     business logic, validated with zod
        ├── routes.ts      extra HTTP routes (optional)
        ├── jobs/          background work
        └── views/
            ├── pages/     one file = one URL; load() reads data on the server
            └── components/
```

Add shadcn components with `npx shadcn@latest add dialog`; they land in `src/shared/ui`.
