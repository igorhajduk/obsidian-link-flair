# Application artwork

Link Flair bundles 128 × 128 PNG renditions and original vendor SVGs of application icons to identify link destinations. Images are embedded in `main.js` and work offline on desktop and mobile. No application code is included.

## Notice

Link Flair's source code is licensed under MIT. Third-party application icons and trademarks are excluded from that license and remain the property of their respective owners. OpenAI owns the ChatGPT and Codex marks. Link Flair is not affiliated with or endorsed by the owners of the applications it identifies.

The build retains [this notice](../src/assets/NOTICE.txt) at the start of `main.js`, so it accompanies the plugin even when installed without the repository documentation. Attribution does not itself grant permission to copy artwork.

## Sources

These renditions were extracted on 9 September 2026. Source descriptions identify where each file came from; they are not claims that the artwork is licensed under MIT.

| Asset | Application / owner | Extraction source | Official artwork or policy |
| --- | --- | --- | --- |
| `codex.png` | Codex / OpenAI | Codex resource `icon-codex-dark-color.png`, purple variant. | [OpenAI brand guidelines](https://openai.com/brand/) |
| `chatgpt.png` | ChatGPT / OpenAI | Codex resource `icon-chatgpt.png`, white ChatGPT artwork. | [OpenAI brand guidelines](https://openai.com/brand/) |
| `anybox.png` | Anybox / Anybox developer | Anybox macOS app, bundle ID `cc.anybox.Anybox`. | [Anybox](https://anybox.app/), [terms](https://anybox.app/terms-of-service) |
| `obsidian.png` | Obsidian / Dynalist Inc. | Obsidian macOS app, bundle ID `md.obsidian`. | [Obsidian brand guidelines](https://obsidian.md/brand) |
| `mindnode.png` | MindNode / IdeasOnCanvas | MindNode macOS app, bundle ID `com.ideasoncanvas.mindnode.macos`. | [MindNode press assets](https://www.mindnode.com/press) |
| `zed.png` | Zed / Zed Industries | Zed macOS app, bundle ID `dev.zed.Zed`. | [Zed brand guidelines](https://zed.dev/brand) |
| `things.png` | Things / Cultured Code | Things macOS app, bundle ID `com.culturedcode.ThingsMac`. | [Things press kit](https://culturedcode.com/press/) |
| `omnifocus.png` | OmniFocus / The Omni Group | `OmniFocus-4-1024.png` from the [official app-icon archive](https://www.omnigroup.com/assets/img/press/Omni-Group-app-icons.zip), resized proportionally to 128 px. | [Press materials](https://www.omnigroup.com/press) |
| `devonthink.png` | DEVONthink / DEVONtechnologies | Installed DEVONthink 4.3.2 macOS app. | [DEVONtechnologies](https://www.devontechnologies.com/) |
| `drafts.png` | Drafts / Agile Tortoise | Official website [Apple touch icon](https://getdrafts.com/assets/img/custom/favicons/apple-touch-icon-180x180.png), resized proportionally. | [Drafts](https://getdrafts.com/) |
| `bear.png` | Bear / Shiny Frog | Official website [Apple touch icon](https://bear.app/images/website-icons/apple-touch-icon.png), resized proportionally. | [Bear](https://bear.app/) |
| `vscode.png` | Visual Studio Code / Microsoft | Official [stable branding icon](https://code.visualstudio.com/assets/branding/code-stable.png), resized proportionally; not the macOS Dock icon. | [Icon and name guidelines](https://code.visualstudio.com/brand) |
| `cursor.png` | Cursor / Anysphere | Installed Cursor 3.17.8 macOS app. | [Cursor](https://cursor.com/) |
| `hookmark.png` | Hookmark / CogSci Apps Corp. | `images/Hookmark-icon.png` from the [28 July 2026 press kit](https://hookproductivity.com/wp-content/uploads/2026/07/Hookmark-Press-Kit-2026-07-28_Issue-8762.zip), resized proportionally. | [Press materials](https://hookproductivity.com/press/) |
| `goland.png` | GoLand / JetBrains | Installed GoLand 2026.2.1.1 macOS app. | [JetBrains brand assets](https://www.jetbrains.com/company/brand/) |
| `intellij-idea.svg`, `pycharm.svg`, `webstorm.svg`, `phpstorm.svg`, `clion.svg`, `rider.svg`, `datagrip.svg`, `rubymine.svg` | Respective IDEs / JetBrains | Original SVGs from the official brand catalog at `https://resources.jetbrains.com/storage/logos/web/<asset>/<asset>.svg`, where `<asset>` is the filename without `.svg`. | [JetBrains brand assets](https://www.jetbrains.com/company/brand/) |

## Usage policy

Application icons are used to identify link destinations. Their source files and colors remain unchanged by default. Users can adjust brightness, saturation, opacity, and proportional size locally; that choice does not assert that every brand authorizes modified artwork in every context. The icons are not Link Flair's product identity or an assertion of endorsement.

The linked sources do not establish explicit redistribution licenses for all bundled assets. The project's MIT license does not extend to third-party artwork in copies or forks.

Prefer a suitable official downloadable asset when updating an icon, record its actual source, and review any accompanying terms. Do not relabel an extracted file as a press-kit asset. If a credible rights-holder concern arises, review it promptly and replace or remove the affected asset as appropriate, considering existing releases as well as future builds. Removal cannot undo earlier distribution or guarantee deletion from independent forks. Report artwork concerns through the repository's [issue tracker](https://github.com/igorhajduk/obsidian-link-flair/issues).

## Review notes — 9 September 2026

| Brand | Published guidance and remaining uncertainty |
| --- | --- |
| OpenAI | Conditional, non-transferable and revocable permission for marks; appearance and affiliation restrictions apply. The reviewed public page does not expressly settle redistribution of these exact app-resource variants. The linked full brand portal required sign-in and was not reviewed. |
| Obsidian | Brand rules prohibit logo changes/recoloring, allow personal app-icon customization, and request contact for commercial asset use. The app's general commercial-use policy does not license artwork. [Developer policies](https://docs.obsidian.md/community-directory/developer-policies) prohibit misleading first-party branding. Revisit the commercial-use condition if distribution becomes commercial. |
| Zed | Supplies official app icons and appearance/affiliation guidance. Unchanged artwork identifying Zed appears consistent with that guidance; this is an interpretation, not a separate redistribution grant for the bundled PNG. The [software overview](https://zed.dev/software-overview#trademarks) separates source licenses from trademark rights. |
| MindNode | Supplies icons for people writing about MindNode. Its linked icon archive contains `MindNode_Icon.png` and macOS metadata, with no accompanying license or usage document. Press availability is useful provenance but not an unrestricted software-redistribution license. |
| Things | The official 20 November 2025 press kit includes current/legacy icons and product descriptions. Its inventory and text files contain no separate licensing document. [Things Cloud terms](https://culturedcode.com/terms/) do not grant branding rights, but their scope must not be expanded into a blanket prohibition on press-image use. |
| Anybox | The reviewed terms cover refunds and support and provide neither an icon-specific license nor an explicit prohibition applicable to this use. |

Omni and Hookmark supply press artwork; the downloaded archives did not supply a separate artwork license (Hookmark's text is product/press information). Drafts and Bear touch icons provide official provenance, not an express software redistribution grant. DEVONthink and Cursor renditions come from installed apps. JetBrains publishes the SVGs through its brand catalog; no separate blanket redistribution grant is asserted here.

Microsoft's guidelines specifically distinguish the blue stable branding icon from the macOS app icon and Insiders artwork; this build uses the stable branding asset for both VS Code schemes. The guidelines restrict recoloring, deformation, and uses that imply association or identify another product. The existing user-controlled appearance adjustments and distribution caveats above still apply; this is not a claim of unconditional brand compliance.

Comparable implementations establish industry practice, not permission for these files. [External Links Icon](https://github.com/moziar/obsidian-external-links-icon/blob/master/src/builtin-scheme-icons.ts) embeds app SVGs in an Obsidian plugin, including Things; the [Raycast Things extension](https://github.com/raycast/extensions/tree/main/extensions/things/assets) distributes app PNGs. Their project licenses do not establish ownership of the underlying marks or artwork.

## Updating images locally

`scripts/extract-app-icons.swift` uses macOS `NSWorkspace.icon(forFile:)` for installed application icons, including asset catalogs. Codex and ChatGPT use the explicit resources listed above rather than the selected Dock icon. Extraction requires macOS, Swift/AppKit, and the relevant installed applications. Supply keys to refresh only selected installed apps, or `key=path` to import a downloaded official raster image:

```sh
swift scripts/extract-app-icons.swift devonthink goland cursor
swift scripts/extract-app-icons.swift omnifocus=/path/to/OmniFocus-4-1024.png
npm run package
```

Original JetBrains SVGs are stored unchanged and embedded as image data URLs. Normal builds use the checked-in files in `src/assets/` and do not run extraction. Review image changes, provenance, and relevant terms before release. Installation needs only `main.js`, `manifest.json`, and `styles.css`; the notice is already inside `main.js`.
