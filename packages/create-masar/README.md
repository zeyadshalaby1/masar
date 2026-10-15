<p align="center">
  <a href="https://masar.zeyad.io"><img src="https://raw.githubusercontent.com/zeyadshalaby1/masar/main/brand/logo.svg" alt="Masar" height="64"></a>
</p>

<p align="center"><b>One clear path from idea to production.</b><br>The full-stack TypeScript framework where a feature is one folder.</p>

<p align="center">
  <a href="https://masar.zeyad.io">Website</a> · <a href="https://masar.zeyad.io/docs">Docs</a> · <a href="https://github.com/zeyadshalaby1/masar">GitHub</a>
</p>

# create-masar

Create a new [Masar](https://masar.zeyad.io) app in one command:

```bash
npm create masar@latest my-app
```

A setup page opens in your browser, in Arabic or English. Pick your database (SQLite, PostgreSQL, MongoDB),
languages, mail provider, file storage and admin account, or press **Use defaults and create**.
Every step can be skipped. Secrets go only into your new app's `.env`.

Then:

```bash
cd my-app
npm run dev
```

Every app ships with `AGENTS.md` and `CLAUDE.md`, so Claude Code, Codex and Cursor know Masar from the first prompt.

### Options

| Flag | What it does |
| --- | --- |
| `--cli` | Ask in the terminal instead of the browser |
| `--yes` | No questions, use defaults (also when there is no terminal) |
| `--db sqlite\|postgres\|mongodb` | Pick the database |
| `--pm npm\|pnpm\|yarn\|bun` | Pick the package manager |
| `--no-install` | Skip installing dependencies |
| `--no-agents` | Leave out AGENTS.md and CLAUDE.md |

The starter files written into your app are yours under any license (see TEMPLATE_LICENSE.md).

## Your application

```text
my-app/
├── package.json
├── .env.example
├── AGENTS.md
├── CLAUDE.md
├── public/
└── src/
    ├── config/       app, database, mail and storage
    ├── locales/      English and Arabic translations
    ├── shared/       UI components, layouts, styles and helpers
    └── modules/      home, auth, admin and your features
```

Add your first feature:

```bash
npx masar make:module courses
npm run build
npm run start
```

Masar keeps a feature's models, validated actions and React pages together.
See the [full architecture and file structure](https://github.com/zeyadshalaby1/masar#application-structure).

## License

[FSL-1.1-ALv2](https://github.com/zeyadshalaby1/masar/blob/main/LICENSE): build anything with Masar, including commercial products. Do not use its source to build a competing framework or product. Each release becomes Apache 2.0 after two years.

Designed and built by [Zeyad Shalaby](https://zeyadshalaby.com).

