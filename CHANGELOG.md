# Changelog

## [0.1.1] - 2026-09-10

- Use a dedicated User-Agent for website metadata requests without reading browser identity.
- Make settings searchable in Obsidian and update DOM helpers, timers, and link styles for compatibility with the current plugin API.
- Add build provenance attestations for release assets.

## [0.1.0] - 2026-09-10

Initial release.

### Added

- Inline icons and readable labels for web links, app deep links, and native Obsidian links in Reading view and Live Preview.
- Bundled offline icons for 23 apps: ChatGPT, Codex, Anybox, Obsidian, MindNode, Zed, Things, OmniFocus, DEVONthink, Drafts, Bear, Visual Studio Code, Cursor, Hookmark, GoLand, IntelliJ IDEA, PyCharm, WebStorm, PhpStorm, CLion, Rider, DataGrip, and RubyMine. Unknown app links use generic icons.
- Website favicons and titles loaded directly from linked websites, with a local cache and an option to disable new requests.
- Optional dashed underlining on hover, disabled by default; hover color changes remain enabled.
- Appearance settings for link colors, text weight, and icon size, spacing, opacity, brightness, and saturation, with live previews and reset controls.
- Individual icon sizing for supported apps, available by selecting an app in the appearance preview. ChatGPT, Codex, Zed, and MindNode are visible initially; the other apps appear in a collapsible list.
- Commands to copy destinations or Markdown links, show a URL, use a fetched page title, and clear cached metadata.
- Preserved authored labels, formatting, native note navigation, and Markdown source. Source mode stays undecorated; explicit text changes support undo.

Requires Obsidian 1.13.7 or later. An app link opens only when its destination application and URI handler are available on the device.
