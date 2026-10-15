# Publishing Masar

The public release consists of three packages, all at the same version:

| Package | Archive | Publish order |
| --- | --- | --- |
| `@masar/core` | `masar-core-<version>.tgz` | 1 |
| `@masar/cli` | `masar-cli-<version>.tgz` | 2 |
| `create-masar` | `create-masar-<version>.tgz` | 3 |

Publish the installer last so newly generated apps can resolve both framework packages.
The repository root and playground are private and must never be published.

## Prepare and validate

Use Node.js 22.13+ and the pinned pnpm 10.28.0 version.

1. Update the version in each package manifest, the CLI's `@masar/core` peer dependency and
   `VERSION` in `packages/create-masar/index.js`. Update CLI display versions when changing releases.
2. Keep each package's README and LICENSE in sync with the release. The installer also ships
   `TEMPLATE_LICENSE.md`, explaining the separate grant for generated application files.
3. Run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
npm run release:pack
npm run release:smoke
```

`release:pack` writes archives to ignored `artifacts/`, using pnpm to replace workspace dependencies
with published version numbers. `release:smoke` installs those archives in a temporary directory,
runs the packed installer, installs a fresh app, checks TypeScript, builds it and checks production
SSR and Arabic RTL. It needs registry access and port 3197. It leaves the temporary app for inspection.

Inspect each archive before publishing:

```bash
npm publish ./artifacts/masar-core-0.1.0.tgz --dry-run --access public
npm publish ./artifacts/masar-cli-0.1.0.tgz --dry-run --access public
npm publish ./artifacts/create-masar-0.1.0.tgz --dry-run --access public
```

Archives must contain their README, LICENSE and runtime files, without `.env`, databases,
`node_modules`, build caches or local workspace paths.

## Publish the checked archives

The publisher needs ownership or publishing rights for the `@masar` scope and `create-masar`.
Use the official browser login; do not commit tokens or put them in release scripts.

```bash
npm login
npm whoami
npm publish ./artifacts/masar-core-0.1.0.tgz --access public --tag latest
npm publish ./artifacts/masar-cli-0.1.0.tgz --access public --tag latest
npm publish ./artifacts/create-masar-0.1.0.tgz --access public --tag latest
```

Complete npm's authentication or 2FA prompt when requested. Substitute the current version in
archive names for subsequent releases. A published name/version cannot be reused with changed contents.

## Verify and announce

```bash
npm view @masar/core version
npm view @masar/cli version
npm view create-masar version
npm create masar@latest my-app -- --yes
cd my-app
npm run typecheck
npm run build
```

Push the tested source, tag the matching commit as `v<version>`, and create a GitHub release with
release notes and the three checked archives attached. GitHub Releases and the GitHub Packages
sidebar are separate: publishing to npm does not create a GitHub Packages entry.
