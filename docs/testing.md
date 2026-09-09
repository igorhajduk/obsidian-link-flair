# Testing

Use a disposable vault and synthetic links. Unit tests, a renderer harness, and real-device checks provide different evidence; passing one does not replace the others.

## Automated checks

From the repository root:

```sh
npm ci
npm run check
npm run package
```

`check` runs Obsidian ESLint checks, unit tests, TypeScript checking, and the esbuild bundle. `package` also writes an installable `dist/link-flair` directory and `dist/SHA256SUMS`. The Linux GitHub workflow runs these code/build checks, not an Obsidian UI session. It skips downloading Electron because this job does not launch the desktop harness.

The unit suite covers link classification and source preservation, Markdown labels and references, metadata filtering and caching, concurrency and late results, appearance preference validation, and clipboard fidelity. Vitest reads `tests/**/*.test.ts` in jsdom. Tests do not contact destination apps or use personal vaults.

The recommended linter also emits non-blocking migration and style advice. Existing warnings include declarative settings APIs, document creation helpers, timers, and UI wording. The User-Agent normalization diagnostic in `main.ts` is retained as a warning because that code is not OS detection. Regex exclusions for literal control characters have narrowly documented suppressions. These exceptions do not suppress other rules or change link behavior.

## Local Obsidian renderer harness

The optional harness currently targets macOS with an installed Obsidian app. It defaults to `/Applications/Obsidian.app/Contents/Resources/obsidian.asar`; set `LINK_FLAIR_OBSIDIAN_ASAR` to select another local bundle. Cross-platform operation of this harness is not established.

```sh
npm run test:install
npm run test:obsidian
```

In a second terminal, from the same repository:

```sh
npm run test:smoke
npm run test:appearance
npm run test:apps
```

The installer copies `tests/fixtures/Link Flair.md` into `work/test-vault/` if the note is absent. The harness keeps its profile, vault, and redirected CLI socket under `work/`, and exposes its local debugging endpoint on port 19223. The smoke scripts verify the vault path before operating. Do not point these tools at a personal vault.

The harness loads the installed Obsidian renderer using the development Electron dependency, so its Electron version can differ from the installed Obsidian app. Its in-memory CLI socket adjustment intentionally fails if the installed app's implementation changes; inspect that change before adapting the harness. No installed Obsidian bundle is modified or redistributed.

General scenarios cover app icons, exact destinations, source preservation, edit/undo, Source mode, Reading-view labels and formatting, clipboard cleanup, native note navigation, repeated rendering, and plugin unload. Deep-link dispatch is intercepted rather than executing destination app actions. The app suite renders synthetic links for all new apps and all nine JetBrains IDEs offline in both modes, checking exact Reading-view destinations, identities, decoded images, and unchanged Markdown. It does not open destination apps. Appearance scenarios cover the four initially visible apps, keyboard expansion/collapse of the remaining app list, hidden-app size controls, app selection by click and keyboard, independent app sizes, composition with the general size, unchanged website sizing during app adjustments, hover colors with optional underlining and its persistence/reset, retained color filters, both reading modes, theme colors, persistence, and individual/global reset. Outputs stay under ignored `work/`. Close the test app or stop the harness process when finished.

To refresh the README screenshots while the isolated harness is running, run `node scripts/capture-doc-screenshots.mjs`. It captures a temporary note from `tests/fixtures/Showcase.md` with the plugin enabled and disabled, verifies the Markdown is unchanged, and captures the app-size control. It requests metadata for the public example websites, writes three images to `docs/images/`, and restores the plugin settings and original note view. The images show the real Obsidian renderer; they are not interface mockups.

## Manual acceptance

Repeat the relevant checks on desktop, iPhone, and iPad after changes to interactions, rendering, or settings. Record the plugin version, Obsidian version/build, OS, device, modes checked, and results.

1. Install the packaged build into a disposable vault and enable it.
2. Open `tests/fixtures/Link Flair.md` in Reading view and Live Preview. Check icons, authored labels, native aliases, and wrapping in light and dark themes.
3. On touch devices, verify link opening through Reading view and Obsidian's available editing interactions. Confirm that revealing/editing source still works. Desktop modifier-click alone is not mobile acceptance.
4. Open a safe web link, a native note link, and a synthetic or disposable app destination supported by that device. Record unavailable apps separately from plugin failures.
5. Change appearance settings. Expand **More apps**, select a hidden app, collapse and reopen the list, and verify that its size is retained. Select an app in the preview, adjust its size, and confirm that other apps and websites keep their sizes. Check the individual reset, reopen the note, reload the plugin, and check persistence. Reset appearance and confirm that all app sizes return to 100% and note text stays unchanged.
6. Edit a link, undo the edit, copy source and rendered text, and verify destination fidelity.
7. Disable remote metadata and check offline app icons and cached values. Disable the plugin and confirm that notes remain readable and unchanged.

Tested on macOS with Obsidian 1.13.7, on iPhone with Obsidian 1.13.7 (365), and on iPad with Link Flair 0.1.0. Windows/Linux UI behavior, accessibility, IME input, pop-out windows, and third-party theme/plugin combinations remain unverified.
