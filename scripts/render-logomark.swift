// Renders Savour's logomark — a single "S" in Source Serif 4 Bold — to a PNG.
//
// CoreText rather than a design tool so the glyph is the real outline from the
// same TTF the app loads at runtime, and so the mark can be regenerated at any
// size from one command.
//
// usage: swift rendermark.swift <font.ttf> <out.png> <px> <inkFraction> <bg|clear> <fg>

import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

func rgb(_ hex: String) -> CGColor {
    var h = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { fail("bad colour: \(hex)") }
    return CGColor(
        red: CGFloat((v >> 16) & 0xFF) / 255,
        green: CGFloat((v >> 8) & 0xFF) / 255,
        blue: CGFloat(v & 0xFF) / 255,
        alpha: 1)
}

let args = CommandLine.arguments
guard args.count == 7 else { fail("usage: rendermark <font> <out> <px> <inkFraction> <bg|clear> <fg>") }

let fontPath = args[1]
let outPath = args[2]
guard let side = Double(args[3]), let inkFraction = Double(args[4]) else { fail("bad numbers") }
let bg = args[5]
let fg = rgb(args[6])

// --- load the face straight out of node_modules -------------------------------
let fontURL = URL(fileURLWithPath: fontPath) as CFURL
var regErr: Unmanaged<CFError>?
CTFontManagerRegisterFontsForURL(fontURL, .process, &regErr)

guard
    let dataProvider = CGDataProvider(url: fontURL),
    let cgFont = CGFont(dataProvider)
else { fail("could not read font at \(fontPath)") }

// A generous nominal size; everything is measured then scaled to fit.
let probe = CTFontCreateWithGraphicsFont(cgFont, 512, nil, nil)

// --- measure the glyph's ink, not its typographic box -------------------------
// A logo is centred on the shape you can see. Using the line's advance and
// ascent instead leaves the S sitting high and left of centre, because both
// carry side bearings and descender space this glyph never uses.
let attributed = NSAttributedString(string: "S", attributes: [
    kCTFontAttributeName as NSAttributedString.Key: probe,
])
let line = CTLineCreateWithAttributedString(attributed)
let ink = CTLineGetImageBounds(line, nil)
guard ink.width > 0, ink.height > 0 else { fail("empty glyph bounds") }

// --- scale so the ink occupies the requested fraction of the tile -------------
let target = side * inkFraction
let scale = target / max(ink.width, ink.height)

let ctx = CGContext(
    data: nil,
    width: Int(side),
    height: Int(side),
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!

ctx.interpolationQuality = .high
ctx.setAllowsAntialiasing(true)
ctx.setShouldSmoothFonts(false) // no subpixel trickery in an asset

if bg != "clear" {
    ctx.setFillColor(rgb(bg))
    ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
}

// inkFraction 0 means "no glyph" — used for the flat Android background layer.
if inkFraction > 0 {
ctx.saveGState()
ctx.scaleBy(x: scale, y: scale)

// Put the ink box's centre on the tile's centre.
let cx = (side / scale) / 2 - ink.midX
let cy = (side / scale) / 2 - ink.midY
ctx.textPosition = CGPoint(x: cx, y: cy)
ctx.setFillColor(fg)
CTLineDraw(line, ctx)
ctx.restoreGState()
}

guard let image = ctx.makeImage() else { fail("could not rasterise") }

let out = URL(fileURLWithPath: outPath) as CFURL
guard let dest = CGImageDestinationCreateWithURL(out, UTType.png.identifier as CFString, 1, nil)
else { fail("could not open \(outPath)") }

CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { fail("could not write \(outPath)") }

print("wrote \(outPath)  \(Int(side))×\(Int(side))  ink \(Int(target))px")
