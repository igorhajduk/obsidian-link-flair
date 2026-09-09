# Contributing to Link Flair

## Setup

Use Node.js 22.13 or later and npm. CI uses Node.js 22. Run commands from the repository root.

```sh
npm ci
npm run check
```

Dependencies are pinned in `package-lock.json`. Use `npm ci` for repeatable installs. TypeScript 6 is pinned because the current typescript-eslint release supports it; TypeScript 7 is not yet supported by that lint toolchain. A scoped npm override lets `eslint-plugin-obsidianmd` use the project's Obsidian API typings instead of its older exact peer requirement. No lint rules are disabled by that override.

## Repository layout

- `src/`: TypeScript modules; `src/assets/` contains bundled app images.
- `tests/`: unit tests and `fixtures/` with synthetic notes.
- `scripts/`: packaging, release preparation, and local Obsidian test tools.
- `docs/`: architecture, reproducible testing, and artwork provenance.
- `.github/`: Linux CI, draft-release workflow, and the bug-report form.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch plugin source and rebuild `main.js` with inline source maps. |
| `npm run typecheck` | Check TypeScript types without emitting files. |
| `npm run lint` | Run the recommended Obsidian ESLint configuration on plugin source and manifest. |
| `npm test` | Run unit tests in jsdom. |
| `npm run build` | Typecheck and build the plugin bundle. |
| `npm run check` | Run lint, unit tests, typecheck, and build. |
| `npm run package` | Run all checks and write `dist/link-flair` plus SHA-256 checksums. |
| `npm run release:notes -- 0.1.0` | Validate version metadata and print that version's changelog section. |

See [testing](docs/testing.md) for the separate Obsidian renderer harness. Electron and Playwright are development tools and are not bundled into the plugin. Updating app images is a separate macOS development task; ordinary builds use checked-in images and do not require installed vendor applications.

## Changes and pull requests

Create a short-lived branch from `main` with a name describing the change. Open a pull request back to `main`; there is no permanent `develop` branch. Describe the problem, resulting behavior, and relevant validation. Run `npm run check` and add focused tests for behavior changes. Update documentation when behavior or commands change.

Keep private vault contents, screenshots, profiles, and generated artifacts out of commits. `work/`, `dist/`, `node_modules/`, and root `main.js` are ignored. Use synthetic examples in tests and bug reports. Run interface checks in a disposable vault.

For bugs, use the short GitHub issue form and include platform, versions, editor mode, and reproduction steps. Feature suggestions can use a blank issue. Never include private URLs or vault content in an example.

## Preparing a release

1. Update `package.json` and `manifest.json` to the same `x.y.z` version; keep the root version in `package-lock.json` synchronized with `npm install --package-lock-only`.
2. Add or update the corresponding `versions.json` entry to match `minAppVersion`. Preserve mappings for earlier builds.
3. Write the version's user-facing changes under `## [x.y.z] - YYYY-MM-DD` in `CHANGELOG.md`. While preparing a version, `Unreleased` can stand in for the date. This section is the single source for GitHub release notes.
4. Run `npm run package` and `npm run release:notes -- x.y.z`. Complete the relevant [interface and platform checks](docs/testing.md#manual-acceptance).
5. Merge the preparation through a PR. When ready to trigger remote release preparation, create and push a tag matching the version exactly, without a `v` prefix.
6. The GitHub workflow installs dependencies, runs checks, validates the tag against the manifest/package/version mapping, extracts changelog notes, and creates a **draft** release containing the individual `main.js`, `manifest.json`, and `styles.css` assets.
7. Inspect the draft and assets, then publish manually. The workflow does not publish a release or submit a Community entry. A rerun fails if a release already exists rather than replacing its assets.

Review the [platform test coverage](docs/testing.md#manual-acceptance) and [artwork sources and usage policy](docs/app-icons.md) before release. Preserve `src/assets/NOTICE.txt`, which the build includes at the start of `main.js`. Third-party artwork is excluded from the MIT license.

## Community plugins submission

After making the reviewed source repository public and publishing a matching release, connect the repository through the [Obsidian Community developer dashboard](https://community.obsidian.md/). Follow the current [submission instructions](https://docs.obsidian.md/plugins/releasing/submit-plugin), inspect automated review results, and address blocking findings. Catalog acceptance is separate from a successful local build or GitHub release. New versions continue through GitHub Releases and the directory's review process.
