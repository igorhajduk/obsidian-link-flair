# Design

Link Flair derives a visual presentation from links while retaining their original Markdown and destination. It uses Obsidian's Reading-view lifecycle and CodeMirror editor extensions. The manifest ID is `link-flair`; the display name is `Link Flair`.

## Modules

| Module | Responsibility |
| --- | --- |
| `links.ts` | Classify links, parse source boundaries, preserve destinations, and produce safe Markdown labels. |
| `editor.ts` | Decorate visible Live Preview ranges, reveal active link source, and preserve normal editing. |
| `reading.ts` | Decorate rendered anchors and eligible bare app links; restore original content on unload. |
| `clipboard.ts` | Remove decorative markup from Reading-view rich copy without interfering with editor source copy. |
| `metadata.ts` | Queue direct website requests and maintain a bounded cache of derived titles and icons. |
| `app-icons.ts` | Choose bundled application artwork independently of web metadata. |
| `apps.ts` | Identify supported apps consistently for previews and per-app icon sizing. |
| `render.ts` | Create icons with a generic fallback when artwork is unavailable. |
| `settings.ts` | Validate saved preferences and generate scoped appearance CSS. |
| `main.ts` | Register lifecycle hooks, editor extensions, commands, settings, and persistence. |

## Source and interaction

Rendering never writes derived metadata into notes. Explicit commands are the only source-changing operations, and those use ordinary editor edits with undo support. A page-title command uses only an already-cached title; if missing, it requests metadata and asks the user to invoke the command again. A late network response cannot rewrite an edited note.

Authored labels retain their text and formatting. Bare web URLs may display a fetched title. Source mode remains undecorated; active cursor or selection ranges reveal source in Live Preview. Reading-view copy retains ordinary links and removes decoration.

Native note links retain Obsidian's navigation, aliases, headings, block references, backlinks, and hover previews. App URLs retain query strings, escaping, callbacks, and fragments exactly. An app-specific icon does not assert that the destination app is installed or that a particular resource exists. App item metadata is not retrieved. JetBrains Toolbox destinations use the URL host to distinguish nine supported IDEs; unknown hosts retain the generic fallback. VS Code and VS Code Insiders share an icon and size setting.

Reading-view source provenance is conservative. If a rendered section contains an authored link to a destination, another bare occurrence of that destination can retain its URL instead of receiving a derived title. The renderer does not overwrite an authored label to guess which occurrence generated an anchor.

## Metadata and network behavior

Remote web metadata is enabled by default. Requests use Obsidian's `requestUrl` API and go directly to websites, without a plugin backend, analytics, or third-party favicon service. The HTTP User-Agent retains the browser identifier and removes Obsidian/Electron tokens, which some websites reject. This header normalization does not detect the operating system.

An authored web link requests an origin icon. If `/favicon.ico` is unavailable, Link Flair looks for icon declarations on the origin homepage. Bare URLs also request the destination page for its title. App URIs and internal note links never enter this service.

Automatic requests exclude URLs containing credentials, literal IP addresses, local or single-label hostnames, and common private-domain suffixes. Obsidian's request API follows redirects and does not expose redirect inspection or cancellation. Initial URL filtering is therefore not a complete network boundary. Response type and size checks apply after receipt, before parsing and caching.

Disabling remote metadata stops new requests and rejects pending results, but cannot cancel a request already sent. Existing cached values remain usable. Titles expire after one day, icons after seven days, and failures after ten minutes. The cache is capped at 128 entries and stored with settings in `data.json`. A vault's sync configuration may carry that file; notes never depend on it.

## Appearance and lifecycle

Appearance changes update scoped CSS in registered documents, including Obsidian's separate windows, without rebuilding note content or restarting metadata requests. Preferences are validated when loaded. Resetting appearance leaves link behavior and metadata intact.

Supported app icons have an optional size multiplier (50–200%, default 100%) on top of the general icon size. The selected app's slider appears inside the settings preview. ChatGPT, Codex, Zed, and MindNode are initially visible; a native details/summary control reveals the other apps. Collapsing the list also closes a hidden app's slider without resetting its saved size. Things URI variants share one setting; native note links share Obsidian's setting. Website favicons and generic fallbacks for unsupported apps use only the general size. Dimensions change together and reserve layout space, preserving image proportions. Color filters remain available for all icons and preserve original colors by default. Hovering changes the link color; dashed underlining is an optional appearance setting, disabled by default for new and existing settings. It applies to Reading view, Live Preview, and the settings preview.

Reading-view children own their observers and restore decorated anchors on cleanup. Plugin unload removes its appearance styles, unloads children, and disposes metadata work.

## Compatibility and limits

The declared minimum is Obsidian 1.13.7. Runtime code uses browser and Obsidian APIs; Node.js and Electron are development tools. Bundled app images work offline on devices that can run the plugin. The macOS image-extraction script is not part of the runtime.

Tested on macOS, iPhone, and iPad. See [testing](testing.md) for platform details, automated checks, and remaining coverage.

Known limits include best-effort metadata for unavailable or authenticated sites, no app item metadata, and no guarantee for Canvas, Bases, Publish, or PDF export. Windows/Linux UI behavior, IME composition, screen-reader behavior, pop-out windows, and third-party theme/plugin combinations require further acceptance checks.

## References

- [Obsidian editor decorations](https://docs.obsidian.md/Plugins/Editor/Decorations)
- [Obsidian API declarations](https://github.com/obsidianmd/obsidian-api)
- [Community plugin requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
