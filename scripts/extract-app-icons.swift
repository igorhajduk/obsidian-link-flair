// Refresh identifying artwork from locally installed vendor apps for this local build.
// Run from the repository root: swift scripts/extract-app-icons.swift
import AppKit
var sources = [
    "devonthink": "/Applications/DEVONthink.app",
    "goland": "/Applications/GoLand.app",
    "cursor": "/Applications/Cursor.app",
    "codex": "/Applications/Codex.app/Contents/Resources/icon-codex-dark-color.png",
    "chatgpt": "/Applications/Codex.app/Contents/Resources/icon-chatgpt.png",
    "anybox": "/Applications/Anybox.app",
    "obsidian": "/Applications/Obsidian.app", "mindnode": "/Applications/MindNode.app",
    "zed": "/Applications/Zed.app", "things": "/Applications/Things3.app"
]
// Select installed apps by key, or import an official downloaded image as key=path.
var requested = Set<String>()
for argument in CommandLine.arguments.dropFirst() {
    let pair = argument.split(separator: "=", maxSplits: 1).map(String.init)
    let key = pair[0]
    guard key.range(of: "^[a-z][a-z0-9-]*$", options: .regularExpression) != nil else { fatalError("Invalid asset name") }
    if pair.count == 2 { sources[key] = pair[1] }
    guard sources[key] != nil else { fatalError("Unknown asset: \(key)") }
    requested.insert(key)
}
for (key, path) in sources where requested.isEmpty || requested.contains(key) {
    guard FileManager.default.fileExists(atPath: path) else { fatalError("Missing \(path)") }
    let icon = path.hasSuffix(".app") ? NSWorkspace.shared.icon(forFile: path) : NSImage(contentsOfFile: path)!
    let size = 128
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    icon.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .copy, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    let data = bitmap.representation(using: .png, properties: [:])!
    try data.write(to: URL(fileURLWithPath: "src/assets/\(key).png"))
    print("\(key): \(data.count) bytes from \(path)")
}
