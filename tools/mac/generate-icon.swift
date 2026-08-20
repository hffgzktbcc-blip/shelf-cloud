import AppKit

// Renders a simple "bookshelf" app icon at every size iconutil needs.

func makeIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    guard let ctx = NSGraphicsContext.current?.cgContext else {
        image.unlockFocus()
        return image
    }

    // Squircle-ish background matching macOS's rounded-square icon shape.
    let cornerRadius = size * 0.225
    let bgRect = CGRect(x: 0, y: 0, width: size, height: size)
    let bgPath = CGPath(roundedRect: bgRect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)

    let colors = [
        NSColor(calibratedRed: 0.31, green: 0.27, blue: 0.90, alpha: 1).cgColor,
        NSColor(calibratedRed: 0.49, green: 0.23, blue: 0.91, alpha: 1).cgColor,
    ] as CFArray
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!

    ctx.saveGState()
    ctx.addPath(bgPath)
    ctx.clip()
    ctx.drawLinearGradient(gradient,
                            start: CGPoint(x: 0, y: size),
                            end: CGPoint(x: size, y: 0),
                            options: [])
    ctx.restoreGState()

    // Shelf plank.
    let shelfHeight = size * 0.045
    let shelfY = size * 0.34
    let shelfInset = size * 0.14
    let shelfRect = CGRect(x: shelfInset, y: shelfY, width: size - shelfInset * 2, height: shelfHeight)
    let shelfPath = CGPath(roundedRect: shelfRect, cornerWidth: shelfHeight / 2, cornerHeight: shelfHeight / 2, transform: nil)
    ctx.setFillColor(NSColor.white.withAlphaComponent(0.95).cgColor)
    ctx.addPath(shelfPath)
    ctx.fillPath()

    // Books standing on the shelf, varying widths/heights for rhythm.
    let books: [(xFrac: CGFloat, wFrac: CGFloat, hFrac: CGFloat, alpha: CGFloat)] = [
        (0.20, 0.09, 0.34, 1.00),
        (0.31, 0.12, 0.42, 0.85),
        (0.45, 0.08, 0.30, 1.00),
        (0.55, 0.11, 0.46, 0.85),
        (0.68, 0.09, 0.36, 1.00),
    ]
    for book in books {
        let w = size * book.wFrac
        let h = size * book.hFrac
        let x = size * book.xFrac
        let y = shelfY + shelfHeight
        let rect = CGRect(x: x, y: y, width: w, height: h)
        let radius = w * 0.18
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
        ctx.setFillColor(NSColor.white.withAlphaComponent(book.alpha).cgColor)
        ctx.addPath(path)
        ctx.fillPath()
    }

    image.unlockFocus()
    return image
}

func writePNG(_ image: NSImage, to path: String, size: CGFloat) {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                pixelsWide: Int(size),
                                pixelsHigh: Int(size),
                                bitsPerSample: 8,
                                samplesPerPixel: 4,
                                hasAlpha: true,
                                isPlanar: false,
                                colorSpaceName: .deviceRGB,
                                bytesPerRow: 0,
                                bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()

    guard let data = rep.representation(using: .png, properties: [:]) else { return }
    try? data.write(to: URL(fileURLWithPath: path))
}

let outDir = CommandLine.arguments[1]
let sizes: [(name: String, points: CGFloat, scale: CGFloat)] = [
    ("icon_16x16", 16, 1), ("icon_16x16@2x", 16, 2),
    ("icon_32x32", 32, 1), ("icon_32x32@2x", 32, 2),
    ("icon_128x128", 128, 1), ("icon_128x128@2x", 128, 2),
    ("icon_256x256", 256, 1), ("icon_256x256@2x", 256, 2),
    ("icon_512x512", 512, 1), ("icon_512x512@2x", 512, 2),
]

for entry in sizes {
    let pixelSize = entry.points * entry.scale
    let img = makeIcon(size: pixelSize)
    writePNG(img, to: "\(outDir)/\(entry.name).png", size: pixelSize)
}
