# Supported applications

Link Flair identifies these destinations with bundled artwork and an individual icon-size control. It preserves the complete URL, including encoded paths, queries, callbacks, and fragments. It does not fetch app metadata, validate resource existence, or run an app action while decorating a note. Opening still depends on the installed app and its URI handler.

| Application | Recognized scheme or destination |
| --- | --- |
| ChatGPT | `chatgpt-conversation://` |
| Codex | `codex://` |
| Zed | `zed://` |
| MindNode | `mindnode://` |
| Anybox | `anybox://` |
| Obsidian | `obsidian://` and native note links |
| Things | `things://`, `things3://` |
| OmniFocus | `omnifocus://` |
| DEVONthink | `x-devonthink-item://` |
| Drafts | `drafts://` |
| Bear | `bear://` |
| Visual Studio Code | `vscode://`, `vscode-insiders://` |
| Cursor | `cursor://` |
| Hookmark | `hook://` |
| GoLand | `jetbrains://goland/…` |
| IntelliJ IDEA | `jetbrains://idea/…` |
| PyCharm | `jetbrains://pycharm/…` |
| WebStorm | `jetbrains://web-storm/…` |
| PhpStorm | `jetbrains://php-storm/…` |
| CLion | `jetbrains://clion/…` |
| Rider | `jetbrains://rd/…` |
| DataGrip | `jetbrains://dbe/…` |
| RubyMine | `jetbrains://rubymine/…` |

In Settings, ChatGPT, Codex, Zed, and MindNode are visible immediately. Expand **More apps** for all other entries and the generic fallback preview. Every supported app retains its own size setting. VS Code Insiders shares the Visual Studio Code setting, and Things URI variants share the Things setting.

Unknown custom schemes and unrecognized JetBrains hosts use a generic icon. Mail, phone, and file links have built-in symbolic icons. Fork has no dedicated recognition. Direct `goland://` navigation is not assumed from protocol registration alone.

## Reference workflows

The following vendor sources document representative destinations. The checked-in synthetic examples in [Supported apps.md](../tests/fixtures/Supported%20apps.md) exercise decoration in Reading view and Live Preview; they are not real resources to launch.

- [OmniFocus URL schemes](https://inside.omnifocus.com/url-schemes): tasks and perspectives.
- [DEVONthink item links](https://www.devontechnologies.com/blog/20240502-understanding-devonthink-item-links): documents, including links used by DEVONthink To Go.
- [Drafts cross-linking](https://docs.getdrafts.com/docs/drafts/cross-linking): `drafts://open?uuid=…`.
- [Bear callback URLs](https://bear.app/faq/x-callback-url-scheme-documentation/): `bear://x-callback-url/open-note?id=…`.
- [Visual Studio Code URLs](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls): files and line/column locations.
- [Cursor deeplinks](https://prod.cursor.com/docs/reference/deeplinks): app-specific actions. Icon recognition does not claim compatibility with every VS Code file URL.
- [Hookmark links](https://hookproductivity.com/help/hook-window/make-hook-file/): file, email, and search addresses.
- [GoLand Copy Path/Reference](https://www.jetbrains.com/help/go/project-tool-window.html) and [JetBrains' URL generator](https://github.com/JetBrains/intellij-community/blob/22238a72a93d0e942adcc4e71b38c6502cff78da/platform/lang-impl/src/com/intellij/ide/actions/CopyTBXReferenceAction.kt): Toolbox URLs with IDE-specific hosts.

The plugin's rendering checks do not establish navigation acceptance inside every destination application or on every device. Local paths may be specific to one machine.
